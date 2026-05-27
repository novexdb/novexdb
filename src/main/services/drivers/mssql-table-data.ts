import sql, { type ConnectionPool, type IRecordSet } from 'mssql'
import { quoteMssqlIdent, quoteMssqlQualified } from '@main/utils/sql'
import type { TableFetchParams } from '@main/services/drivers/driver.types'
import type {
  TableChangeSet,
  TableColumn,
  TableDataPage,
  TableMutateResult
} from '@shared/types/table-data'

const COLUMN_META_SQL = `
  SELECT c.name AS [name],
         TYPE_NAME(c.user_type_id) +
           CASE
             WHEN TYPE_NAME(c.user_type_id) IN ('varchar', 'nvarchar', 'char', 'nchar', 'binary', 'varbinary')
               THEN '(' + CASE WHEN c.max_length = -1 THEN 'max'
                               WHEN TYPE_NAME(c.user_type_id) IN ('nvarchar', 'nchar')
                                 THEN CAST(c.max_length / 2 AS varchar(10))
                               ELSE CAST(c.max_length AS varchar(10)) END + ')'
             WHEN TYPE_NAME(c.user_type_id) IN ('decimal', 'numeric')
               THEN '(' + CAST(c.precision AS varchar(10)) + ',' + CAST(c.scale AS varchar(10)) + ')'
             ELSE '' END AS data_type,
         c.is_nullable AS nullable,
         CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key
  FROM sys.columns c
  JOIN sys.objects o ON o.object_id = c.object_id
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  LEFT JOIN (
    SELECT ic.object_id, ic.column_id
    FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE i.is_primary_key = 1
  ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
  WHERE s.name = @schema AND o.name = @table
  ORDER BY c.column_id`

interface ColumnMetaRow {
  name: string
  data_type: string
  nullable: boolean
  is_primary_key: boolean | number
}

function toBool(value: boolean | number | undefined): boolean {
  return value === true || value === 1
}

/** Project an mssql recordset row (object or array) into a positional array. */
function rowToArray(row: unknown, columnNames: readonly string[]): unknown[] {
  if (Array.isArray(row)) return row as unknown[]
  if (row && typeof row === 'object') {
    const record = row as Record<string, unknown>
    return columnNames.map((name) => record[name])
  }
  return []
}

/** Fetch one page of a SQL Server table's rows plus its column metadata. */
export async function fetchMssqlTablePage(
  pool: ConnectionPool,
  params: TableFetchParams
): Promise<TableDataPage> {
  const qualified = quoteMssqlQualified(params.schema, params.table)

  const metaResult = await pool
    .request()
    .input('schema', sql.NVarChar, params.schema)
    .input('table', sql.NVarChar, params.table)
    .query<ColumnMetaRow>(COLUMN_META_SQL)
  const meta = metaResult.recordset
  if (meta.length === 0) {
    throw new Error(`Table [${params.schema}].[${params.table}] was not found`)
  }
  const metaByName = new Map(meta.map((row) => [row.name, row]))
  const pkColumns = meta.filter((row) => toBool(row.is_primary_key)).map((row) => row.name)

  // Only sort by a real column — orderBy is an identifier, not parameterizable.
  let orderClause = ''
  if (params.orderBy && metaByName.has(params.orderBy)) {
    orderClause = ` ORDER BY ${quoteMssqlIdent(params.orderBy)} ${
      params.orderDir === 'desc' ? 'DESC' : 'ASC'
    }`
  } else if (pkColumns.length > 0) {
    // OFFSET/FETCH requires an ORDER BY; pick the PK as a stable default.
    orderClause = ` ORDER BY ${pkColumns.map(quoteMssqlIdent).join(', ')}`
  } else {
    // No PK and no user order — fall back to ordering by the first column so
    // OFFSET/FETCH stays valid.
    orderClause = ` ORDER BY ${quoteMssqlIdent(meta[0].name)}`
  }

  // Convert every column to NVARCHAR(MAX) so LIKE works against numerics/dates/uuid too.
  let whereClause = ''
  const searchValue = params.search.trim()
  if (searchValue !== '') {
    const predicates = meta.map(
      (row) => `CONVERT(NVARCHAR(MAX), ${quoteMssqlIdent(row.name)}) LIKE @search`
    )
    whereClause = ` WHERE (${predicates.join(' OR ')})`
  }

  const countRequest = pool.request()
  if (searchValue !== '') countRequest.input('search', sql.NVarChar, `%${searchValue}%`)
  const countResult = await countRequest.query<{ count: number }>(
    `SELECT COUNT_BIG(*) AS [count] FROM ${qualified}${whereClause}`
  )
  const totalRows = Number(countResult.recordset[0]?.count ?? 0)

  const dataRequest = pool.request()
  dataRequest.arrayRowMode = true
  if (searchValue !== '') dataRequest.input('search', sql.NVarChar, `%${searchValue}%`)
  dataRequest.input('offset', sql.Int, Math.max(0, Math.floor(params.offset)))
  dataRequest.input('limit', sql.Int, Math.max(0, Math.floor(params.limit)))

  const dataResult = await dataRequest.query<unknown>(
    `SELECT * FROM ${qualified}${whereClause}${orderClause}
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
  )
  const recordset = dataResult.recordset as IRecordSet<unknown> | undefined
  const columnMeta = recordset?.columns ?? {}
  const ordered = Object.values(columnMeta).sort((a, b) => a.index - b.index)
  const columnNames = ordered.map((column) => column.name)

  const columns: TableColumn[] = ordered.map((column) => {
    const info = metaByName.get(column.name)
    return {
      name: column.name,
      dataType: info?.data_type ?? 'unknown',
      nullable: info?.nullable ?? true,
      isPrimaryKey: toBool(info?.is_primary_key)
    }
  })

  const rows = (recordset ?? []).map((row) => rowToArray(row, columnNames))

  return {
    columns,
    rows,
    totalRows,
    editable: columns.some((column) => column.isPrimaryKey)
  }
}

/** Apply staged inserts/updates/deletes to a SQL Server table in one transaction. */
export async function applyMssqlTableChanges(
  pool: ConnectionPool,
  schema: string,
  table: string,
  changes: TableChangeSet
): Promise<TableMutateResult> {
  const qualified = quoteMssqlQualified(schema, table)
  const transaction = new sql.Transaction(pool)
  let inserted = 0
  let updated = 0
  let deleted = 0

  try {
    await transaction.begin()

    for (const insert of changes.inserts) {
      const cols = Object.keys(insert.values)
      if (cols.length === 0) continue
      const request = transaction.request()
      cols.forEach((column, index) => request.input(`v${index}`, insert.values[column]))
      const placeholders = cols.map((_, index) => `@v${index}`).join(', ')
      const sqlText = `INSERT INTO ${qualified} (${cols.map(quoteMssqlIdent).join(', ')}) VALUES (${placeholders})`
      const result = await request.query(sqlText)
      inserted += (result.rowsAffected ?? []).reduce((sum, n) => sum + (n ?? 0), 0)
    }

    for (const update of changes.updates) {
      const setCols = Object.keys(update.set)
      const pkCols = Object.keys(update.pk)
      if (setCols.length === 0) continue
      if (pkCols.length === 0) throw new Error('Cannot update a row without a primary key')

      const request = transaction.request()
      setCols.forEach((column, index) => request.input(`s${index}`, update.set[column]))
      pkCols.forEach((column, index) => request.input(`k${index}`, update.pk[column]))

      const setClause = setCols.map((c, i) => `${quoteMssqlIdent(c)} = @s${i}`).join(', ')
      const whereClause = pkCols.map((c, i) => `${quoteMssqlIdent(c)} = @k${i}`).join(' AND ')
      const result = await request.query(
        `UPDATE ${qualified} SET ${setClause} WHERE ${whereClause}`
      )
      updated += (result.rowsAffected ?? []).reduce((sum, n) => sum + (n ?? 0), 0)
    }

    for (const remove of changes.deletes) {
      const pkCols = Object.keys(remove.pk)
      if (pkCols.length === 0) throw new Error('Cannot delete a row without a primary key')

      const request = transaction.request()
      pkCols.forEach((column, index) => request.input(`k${index}`, remove.pk[column]))
      const whereClause = pkCols.map((c, i) => `${quoteMssqlIdent(c)} = @k${i}`).join(' AND ')
      const result = await request.query(`DELETE FROM ${qualified} WHERE ${whereClause}`)
      deleted += (result.rowsAffected ?? []).reduce((sum, n) => sum + (n ?? 0), 0)
    }

    await transaction.commit()
    return { inserted, updated, deleted }
  } catch (err) {
    await transaction.rollback().catch(() => undefined)
    throw err
  }
}
