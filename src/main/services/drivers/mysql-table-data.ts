import type { FieldPacket, Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { quoteMysqlIdent, quoteMysqlQualified } from '@main/utils/sql'
import type { TableFetchParams } from '@main/services/drivers/driver.types'
import type {
  TableChangeSet,
  TableColumn,
  TableDataPage,
  TableMutateResult
} from '@shared/types/table-data'

const COLUMN_META_SQL = `
  SELECT column_name AS name, column_type AS data_type,
         is_nullable AS nullable, column_key AS column_key
  FROM information_schema.columns
  WHERE table_schema = ? AND table_name = ?
  ORDER BY ordinal_position`

interface ColumnMetaRow {
  name: string
  data_type: string
  nullable: string
  column_key: string
}

/** Fetch one page of a MySQL table's rows plus its column metadata. */
export async function fetchMysqlTablePage(
  pool: Pool,
  params: TableFetchParams
): Promise<TableDataPage> {
  const qualified = quoteMysqlQualified(params.schema, params.table)

  const [metaRows] = await pool.query<RowDataPacket[]>(COLUMN_META_SQL, [
    params.schema,
    params.table
  ])
  const meta = metaRows as unknown as ColumnMetaRow[]
  if (meta.length === 0) {
    throw new Error(`Table \`${params.schema}\`.\`${params.table}\` was not found`)
  }
  const metaByName = new Map(meta.map((row) => [row.name, row]))
  const pkColumns = meta.filter((row) => row.column_key === 'PRI').map((row) => row.name)

  // Only sort by a real column — orderBy is an identifier, not parameterizable.
  let orderClause = ''
  if (params.orderBy && metaByName.has(params.orderBy)) {
    orderClause = ` ORDER BY ${quoteMysqlIdent(params.orderBy)} ${
      params.orderDir === 'desc' ? 'DESC' : 'ASC'
    }`
  } else if (pkColumns.length > 0) {
    orderClause = ` ORDER BY ${pkColumns.map(quoteMysqlIdent).join(', ')}`
  }

  // CAST every column to CHAR so LIKE works against numerics/dates/JSON too.
  // mysql2 binds positional `?` only — bind the pattern once per column.
  let whereClause = ''
  const whereValues: unknown[] = []
  if (params.search.trim() !== '') {
    const pattern = `%${params.search}%`
    const predicates = meta.map((row) => {
      whereValues.push(pattern)
      return `CAST(${quoteMysqlIdent(row.name)} AS CHAR) LIKE ?`
    })
    whereClause = ` WHERE (${predicates.join(' OR ')})`
  }

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM ${qualified}${whereClause}`,
    whereValues
  )
  const totalRows = Number((countRows[0]?.['count'] as number | string | null) ?? 0)

  const [dataRows, fields] = await pool.query<RowDataPacket[]>(
    {
      sql: `SELECT * FROM ${qualified}${whereClause}${orderClause} LIMIT ? OFFSET ?`,
      rowsAsArray: true
    },
    [...whereValues, params.limit, params.offset]
  )

  const columns: TableColumn[] = (fields as FieldPacket[]).map((field) => {
    const info = metaByName.get(field.name)
    return {
      name: field.name,
      dataType: info?.data_type ?? 'unknown',
      nullable: info ? info.nullable.toUpperCase() === 'YES' : true,
      isPrimaryKey: info?.column_key === 'PRI'
    }
  })

  return {
    columns,
    rows: dataRows as unknown as unknown[][],
    totalRows,
    editable: columns.some((column) => column.isPrimaryKey)
  }
}

/** Apply staged inserts/updates/deletes to a MySQL table in one transaction. */
export async function applyMysqlTableChanges(
  pool: Pool,
  schema: string,
  table: string,
  changes: TableChangeSet
): Promise<TableMutateResult> {
  const qualified = quoteMysqlQualified(schema, table)
  const connection = await pool.getConnection()
  let inserted = 0
  let updated = 0
  let deleted = 0

  try {
    await connection.beginTransaction()

    for (const insert of changes.inserts) {
      const cols = Object.keys(insert.values)
      if (cols.length === 0) continue
      const sql = `INSERT INTO ${qualified} (${cols.map(quoteMysqlIdent).join(', ')}) VALUES (${cols
        .map(() => '?')
        .join(', ')})`
      const [result] = await connection.query<ResultSetHeader>(
        sql,
        cols.map((column) => insert.values[column])
      )
      inserted += result.affectedRows ?? 0
    }

    for (const update of changes.updates) {
      const setCols = Object.keys(update.set)
      const pkCols = Object.keys(update.pk)
      if (setCols.length === 0) continue
      if (pkCols.length === 0) throw new Error('Cannot update a row without a primary key')
      const setClause = setCols.map((c) => `${quoteMysqlIdent(c)} = ?`).join(', ')
      const whereClause = pkCols.map((c) => `${quoteMysqlIdent(c)} = ?`).join(' AND ')
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE ${qualified} SET ${setClause} WHERE ${whereClause}`,
        [...setCols.map((c) => update.set[c]), ...pkCols.map((c) => update.pk[c])]
      )
      updated += result.affectedRows ?? 0
    }

    for (const remove of changes.deletes) {
      const pkCols = Object.keys(remove.pk)
      if (pkCols.length === 0) throw new Error('Cannot delete a row without a primary key')
      const whereClause = pkCols.map((c) => `${quoteMysqlIdent(c)} = ?`).join(' AND ')
      const [result] = await connection.query<ResultSetHeader>(
        `DELETE FROM ${qualified} WHERE ${whereClause}`,
        pkCols.map((c) => remove.pk[c])
      )
      deleted += result.affectedRows ?? 0
    }

    await connection.commit()
    return { inserted, updated, deleted }
  } catch (err) {
    await connection.rollback().catch(() => undefined)
    throw err
  } finally {
    connection.release()
  }
}
