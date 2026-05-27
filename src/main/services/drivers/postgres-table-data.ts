import type { Pool } from 'pg'
import { quoteIdent, quoteQualified } from '@main/utils/sql'
import type { TableFetchParams } from '@main/services/drivers/driver.types'
import type {
  TableChangeSet,
  TableColumn,
  TableDataPage,
  TableMutateResult
} from '@shared/types/table-data'

const COLUMN_META_SQL = `
  SELECT a.attname AS name,
         format_type(a.atttypid, a.atttypmod) AS data_type,
         NOT a.attnotnull AS nullable,
         COALESCE(pk.is_pk, false) AS is_primary_key
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN (
    SELECT i.indrelid, k.attnum, true AS is_pk
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) AS k(attnum)
    WHERE i.indisprimary
  ) pk ON pk.indrelid = a.attrelid AND pk.attnum = a.attnum
  WHERE n.nspname = $1 AND c.relname = $2
    AND a.attnum > 0 AND NOT a.attisdropped
  ORDER BY a.attnum`

interface ColumnMetaRow {
  name: string
  data_type: string
  nullable: boolean
  is_primary_key: boolean
}

/** Fetch one page of a table's rows along with column metadata. */
export async function fetchTablePage(
  pool: Pool,
  params: TableFetchParams
): Promise<TableDataPage> {
  const qualified = quoteQualified(params.schema, params.table)

  const metaResult = await pool.query<ColumnMetaRow>(COLUMN_META_SQL, [
    params.schema,
    params.table
  ])
  if (metaResult.rows.length === 0) {
    throw new Error(`Table "${params.schema}"."${params.table}" was not found`)
  }
  const metaByName = new Map(metaResult.rows.map((row) => [row.name, row]))
  const pkColumns = metaResult.rows
    .filter((row) => row.is_primary_key)
    .map((row) => row.name)

  // Only sort by a real column — orderBy is an identifier and cannot be parameterized.
  const orderColumn = params.orderBy && metaByName.has(params.orderBy) ? params.orderBy : null
  let orderClause = ''
  if (orderColumn) {
    orderClause = ` ORDER BY ${quoteIdent(orderColumn)} ${params.orderDir === 'desc' ? 'DESC' : 'ASC'}`
  } else if (pkColumns.length > 0) {
    // Stable pagination: without a deterministic order, an UPDATE relocates the
    // row's tuple and it can shuffle onto a different page (and appear "lost").
    orderClause = ` ORDER BY ${pkColumns.map(quoteIdent).join(', ')}`
  }

  // Casting every column to text covers jsonb/uuid/timestamptz/bytea — the
  // pattern itself is parameterized; column names come from introspection.
  let whereClause = ''
  const whereValues: unknown[] = []
  if (params.search.trim() !== '') {
    whereValues.push(`%${params.search}%`)
    const predicates = metaResult.rows.map(
      (row) => `${quoteIdent(row.name)}::text ILIKE $1`
    )
    whereClause = ` WHERE (${predicates.join(' OR ')})`
  }

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::bigint AS count FROM ${qualified}${whereClause}`,
    whereValues
  )
  const totalRows = Number(countResult.rows[0]?.count ?? 0)

  const dataResult = await pool.query({
    text: `SELECT * FROM ${qualified}${whereClause}${orderClause} LIMIT $${whereValues.length + 1} OFFSET $${whereValues.length + 2}`,
    rowMode: 'array',
    values: [...whereValues, params.limit, params.offset]
  })

  const columns: TableColumn[] = (dataResult.fields ?? []).map((field) => {
    const meta = metaByName.get(field.name)
    return {
      name: field.name,
      dataType: meta?.data_type ?? 'unknown',
      nullable: meta?.nullable ?? true,
      isPrimaryKey: meta?.is_primary_key ?? false
    }
  })

  return {
    columns,
    rows: (dataResult.rows ?? []) as unknown[][],
    totalRows,
    editable: columns.some((column) => column.isPrimaryKey)
  }
}

/** Apply staged inserts/updates/deletes inside a single transaction. */
export async function applyTableChanges(
  pool: Pool,
  schema: string,
  table: string,
  changes: TableChangeSet
): Promise<TableMutateResult> {
  const qualified = quoteQualified(schema, table)
  const client = await pool.connect()
  let inserted = 0
  let updated = 0
  let deleted = 0

  try {
    await client.query('BEGIN')

    for (const insert of changes.inserts) {
      const cols = Object.keys(insert.values)
      if (cols.length === 0) continue
      const placeholders = cols.map((_, index) => `$${index + 1}`).join(', ')
      const sql = `INSERT INTO ${qualified} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders})`
      const result = await client.query(
        sql,
        cols.map((column) => insert.values[column])
      )
      inserted += result.rowCount ?? 0
    }

    for (const update of changes.updates) {
      const setCols = Object.keys(update.set)
      const pkCols = Object.keys(update.pk)
      if (setCols.length === 0) continue
      if (pkCols.length === 0) throw new Error('Cannot update a row without a primary key')
      const setClause = setCols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(', ')
      const whereClause = pkCols
        .map((c, i) => `${quoteIdent(c)} = $${setCols.length + i + 1}`)
        .join(' AND ')
      const sql = `UPDATE ${qualified} SET ${setClause} WHERE ${whereClause}`
      const params = [
        ...setCols.map((c) => update.set[c]),
        ...pkCols.map((c) => update.pk[c])
      ]
      const result = await client.query(sql, params)
      updated += result.rowCount ?? 0
    }

    for (const remove of changes.deletes) {
      const pkCols = Object.keys(remove.pk)
      if (pkCols.length === 0) throw new Error('Cannot delete a row without a primary key')
      const whereClause = pkCols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(' AND ')
      const sql = `DELETE FROM ${qualified} WHERE ${whereClause}`
      const result = await client.query(
        sql,
        pkCols.map((c) => remove.pk[c])
      )
      deleted += result.rowCount ?? 0
    }

    await client.query('COMMIT')
    return { inserted, updated, deleted }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}
