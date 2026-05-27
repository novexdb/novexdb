import { connectionManager } from '@main/services/connection-manager'
import type {
  CascadeDeletionStat,
  CascadeExecuteRequest,
  CascadeExecuteResult,
  CascadeSelection
} from '@shared/types/cascade'

/**
 * Execute a confirmed cascade delete.
 *
 * Strategy:
 *  1. Group selections by table and dedupe identical `{table, rowKey}` pairs.
 *  2. Compute a deletion order via the FK graph — children before parents —
 *     so each DELETE doesn't violate any remaining FK.
 *  3. Build one `DELETE … WHERE (pk_col_a, pk_col_b) IN (…)` per table.
 *  4. Run every statement inside one transaction via `executeStatements` —
 *     a failure rolls every prior delete back, the database stays consistent.
 *
 * `dryRun: true` returns the planned counts without actually deleting anything.
 */
export async function executeCascade(
  request: CascadeExecuteRequest
): Promise<CascadeExecuteResult> {
  const startedAt = Date.now()
  const engine = await connectionManager.getEngine(request.connectionId)
  if (engine !== 'postgres' && engine !== 'mysql') {
    throw new Error(`Cascade execute is not yet supported for engine "${engine}".`)
  }

  // Step 1 — group + dedupe.
  const byTable = groupByTable(request.selections)
  if (byTable.size === 0) {
    return { deleted: [], durationMs: Date.now() - startedAt, dryRun: !!request.dryRun }
  }

  // Step 2 — sort tables children-first using the FK graph among the selected
  // table set. Anything not reachable in the local graph keeps insertion order.
  const tableOrder = await sortTablesChildrenFirst(
    request.connectionId,
    engine,
    [...byTable.keys()]
  )

  // Step 3 — build the per-table DELETE statements.
  const statements: { sql: string; table: string; count: number }[] = []
  for (const key of tableOrder) {
    const rows = byTable.get(key) ?? []
    if (rows.length === 0) continue
    const [schema, table] = key.split('::')
    statements.push({
      sql: buildDeleteSql(engine, schema, table, rows),
      table: key,
      count: rows.length
    })
  }

  // Step 4 — dry-run short-circuit returns the planned counts unaltered.
  if (request.dryRun) {
    return {
      deleted: statements.map(({ table, count }) => {
        const [schema, name] = table.split('::')
        return { schema, table: name, count }
      }),
      durationMs: Date.now() - startedAt,
      dryRun: true
    }
  }

  // Real run — single transaction; `executeStatements` rolls back on the first
  // statement that throws and surfaces the error.
  await connectionManager.executeStatements(
    request.connectionId,
    statements.map(({ sql }) => ({ sql }))
  )

  // The aggregated `affectedRows` from the batch isn't broken down per
  // statement, so we report planned counts per table. A row that didn't exist
  // is silently skipped by `WHERE IN` — same outcome from the user's POV.
  const deleted: CascadeDeletionStat[] = statements.map(({ table, count }) => {
    const [schema, name] = table.split('::')
    return { schema, table: name, count }
  })

  return { deleted, durationMs: Date.now() - startedAt, dryRun: false }
}

// ──────────────────────────────────────────────────────────────── helpers ──

/** Map key = `${schema}::${table}` → unique rowKeys to delete from it. */
function groupByTable(
  selections: CascadeSelection[]
): Map<string, Record<string, unknown>[]> {
  const out = new Map<string, Record<string, unknown>[]>()
  const seen = new Set<string>()
  for (const sel of selections) {
    const tableKey = `${sel.schema}::${sel.table}`
    const dedupeKey = `${tableKey}::${stableStringify(sel.rowKey)}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    const list = out.get(tableKey) ?? []
    list.push(sel.rowKey)
    out.set(tableKey, list)
  }
  return out
}

/**
 * Children-first topological sort across only the tables in `keys`.
 *
 * Reads FK constraints among those tables and returns a key order where every
 * referencing (child) table comes before every referenced (parent) table.
 * Cycles fall back to insertion order — Postgres will reject the violating
 * DELETE; the transaction rolls back; the user gets a clear error.
 */
async function sortTablesChildrenFirst(
  connectionId: string,
  engine: 'postgres' | 'mysql',
  keys: string[]
): Promise<string[]> {
  if (keys.length <= 1) return keys
  // Build a `child -> parent[]` map across our keys only.
  const tableSet = new Set(keys)
  const childToParents = new Map<string, Set<string>>()
  for (const key of keys) childToParents.set(key, new Set())

  const sql =
    engine === 'postgres'
      ? `
          SELECT
            src_ns.nspname AS child_schema, src_cls.relname AS child_table,
            tgt_ns.nspname AS parent_schema, tgt_cls.relname AS parent_table
          FROM pg_constraint con
          JOIN pg_class src_cls ON src_cls.oid = con.conrelid
          JOIN pg_namespace src_ns ON src_ns.oid = src_cls.relnamespace
          JOIN pg_class tgt_cls ON tgt_cls.oid = con.confrelid
          JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt_cls.relnamespace
          WHERE con.contype = 'f'
        `
      : `
          SELECT
            kcu.table_schema AS child_schema, kcu.table_name AS child_table,
            kcu.referenced_table_schema AS parent_schema,
            kcu.referenced_table_name AS parent_table
          FROM information_schema.key_column_usage kcu
          WHERE kcu.referenced_table_name IS NOT NULL
        `

  const fkResult = await connectionManager.runScanQuery(connectionId, sql)
  for (const row of fkResult.rows) {
    const child = `${row[0]}::${row[1]}`
    const parent = `${row[2]}::${row[3]}`
    if (tableSet.has(child) && tableSet.has(parent) && child !== parent) {
      childToParents.get(child)?.add(parent)
    }
  }

  // Kahn's algorithm with reversed edges (since we want children FIRST).
  // We iteratively pull tables whose set of unprocessed parents-in-our-set is
  // empty — i.e. nobody references them within our deletion set.
  const processed = new Set<string>()
  const order: string[] = []
  while (order.length < keys.length) {
    let progressed = false
    for (const key of keys) {
      if (processed.has(key)) continue
      const parents = childToParents.get(key) ?? new Set()
      const blocking = [...parents].some((parent) => !processed.has(parent))
      if (!blocking) continue // it's a parent — defer
      // No parent dependencies still unprocessed → safe to delete now.
    }
    for (const key of keys) {
      if (processed.has(key)) continue
      const parents = childToParents.get(key) ?? new Set()
      const stillBlockedBy = [...parents].filter((parent) => !processed.has(parent))
      // A "child" is one that has all its in-scope parents already processed.
      // For *children first*, we want the leaves of the FK graph first, so we
      // invert: process tables that are NOT referenced by any remaining table.
      if (stillBlockedBy.length === 0) {
        // This table doesn't depend on any other in-scope table.
        // Push to the END — parents go last.
        order.push(key)
        processed.add(key)
        progressed = true
      }
    }
    if (!progressed) {
      // Cycle — append the rest in insertion order; the DB will reject the bad
      // statement and the transaction will roll back.
      for (const key of keys) if (!processed.has(key)) order.push(key)
      break
    }
  }
  // We currently appended parents-first; reverse so children come first.
  return order.reverse()
}

/** Build `DELETE FROM "s"."t" WHERE ("a","b") IN ((v1,v2), …)` for many rows. */
function buildDeleteSql(
  engine: 'postgres' | 'mysql',
  schema: string,
  table: string,
  rowKeys: Record<string, unknown>[]
): string {
  if (rowKeys.length === 0) throw new Error('buildDeleteSql called with no rows')
  // Use the keys of the first row as the canonical column order. We require
  // every row to share the same shape — the scanner always populates the same
  // PK columns per table.
  const columns = Object.keys(rowKeys[0])
  const tuples = rowKeys.map((rowKey) => {
    const literals = columns.map((col) => sqlValue(rowKey[col]))
    return columns.length === 1 ? `${literals[0]}` : `(${literals.join(', ')})`
  })
  const cols = columns.map((c) => quoteColumn(engine, c)).join(', ')
  const lhs = columns.length === 1 ? `${cols}` : `(${cols})`
  return `DELETE FROM ${quoteRelation(engine, schema, table)} WHERE ${lhs} IN (${tuples.join(', ')});`
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return `'${String(value).replace(/'/g, "''")}'`
}

function quoteColumn(engine: 'postgres' | 'mysql', name: string): string {
  return engine === 'mysql'
    ? `\`${name.replace(/`/g, '``')}\``
    : `"${name.replace(/"/g, '""')}"`
}

function quoteRelation(engine: 'postgres' | 'mysql', schema: string, table: string): string {
  return `${quoteColumn(engine, schema)}.${quoteColumn(engine, table)}`
}

function stableStringify(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort()
  return JSON.stringify(keys.map((k) => [k, value[k] === null ? null : String(value[k])]))
}
