import log from 'electron-log/main'
import { connectionManager } from '@main/services/connection-manager'
import type {
  CascadeNode,
  CascadeScanRequest,
  CascadeScanResult
} from '@shared/types/cascade'

const logger = log.scope('cascade-scanner')

/** Per-table inbound-FK descriptor — "rows in `child` reference us via `column`". */
interface InboundFk {
  constraintName: string
  childSchema: string
  childTable: string
  childColumns: string[]
  /** Parent-side columns the child columns refer to. Same length, same order. */
  parentColumns: string[]
}

const DEFAULT_MAX_DEPTH = 5
const DEFAULT_MAX_ROWS_PER_TABLE = 500

/**
 * Walk the foreign-key graph from each root row and return a dependency tree.
 *
 * Engine-aware (postgres + mysql). Recursion is bounded by `maxDepth` (default 5)
 * and `maxRowsPerTable` (default 500) so a single root row can't fan out into
 * tens of thousands of grandchildren and freeze the UI. Cycles are caught by a
 * visited-set keyed on `${schema}.${table}::${pk-json}`.
 */
export async function scanDependencies(
  request: CascadeScanRequest
): Promise<CascadeScanResult> {
  const startedAt = Date.now()
  logger.info(
    'scan starting',
    `${request.schema}.${request.table}`,
    `${request.rowKeys.length} root(s)`
  )
  const engine = await connectionManager.getEngine(request.connectionId)
  if (engine !== 'postgres' && engine !== 'mysql') {
    throw new Error(`Cascade scan is not yet supported for engine "${engine}".`)
  }

  const maxDepth = request.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxRows = request.maxRowsPerTable ?? DEFAULT_MAX_ROWS_PER_TABLE

  // Cache: every `${schema}.${table}` we've ever asked about → its inbound FKs.
  const fkCache = new Map<string, InboundFk[]>()
  const visited = new Set<string>()
  const truncatedTables: CascadeScanResult['truncatedTables'] = []
  const unresolvedFks: CascadeScanResult['unresolvedFks'] = []
  // Dedupe unresolved entries so a deep tree with the same shape only
  // reports each (constraint, missing-cols) combo once.
  const unresolvedSeen = new Set<string>()
  let totalDescendants = 0

  const visitKey = (schema: string, table: string, rowKey: Record<string, unknown>): string =>
    `${schema}.${table}::${stableStringify(rowKey)}`

  const recordUnresolved = (
    fk: InboundFk,
    missing: string[]
  ): void => {
    const key = `${fk.childSchema}.${fk.childTable}::${fk.constraintName}::${missing.join(',')}`
    if (unresolvedSeen.has(key)) return
    unresolvedSeen.add(key)
    unresolvedFks.push({
      childSchema: fk.childSchema,
      childTable: fk.childTable,
      constraintName: fk.constraintName,
      missingParentColumns: missing
    })
  }

  const inboundFor = async (schema: string, table: string): Promise<InboundFk[]> => {
    const key = `${schema}.${table}`
    const cached = fkCache.get(key)
    if (cached) return cached
    try {
      const list =
        engine === 'postgres'
          ? await loadInboundFkPostgres(request.connectionId, schema, table)
          : await loadInboundFkMysql(request.connectionId, schema, table)
      logger.info('inbound fks', `${schema}.${table}`, `${list.length} fks`)
      fkCache.set(key, list)
      return list
    } catch (err) {
      // A catalog read failure shouldn't tank the whole scan — treat as
      // "no inbound FKs" and continue, with a console error for visibility.
      logger.error('inbound fk lookup failed', `${schema}.${table}`, err)
      fkCache.set(key, [])
      return []
    }
  }

  const buildChildren = async (
    schema: string,
    table: string,
    /**
     * Columns available for FK matching. For roots, this is the freshly
     * fetched row body — so FKs referencing columns the renderer didn't
     * send (e.g. the data grid only sent `seq`, but the FK references `id`)
     * still resolve. Falls back to the renderer-supplied PK on body-fetch
     * failure; in that case anything beyond PK-shaped FKs won't follow.
     */
    fkLookup: Record<string, unknown>,
    parentId: string,
    depth: number
  ): Promise<CascadeNode[]> => {
    if (depth >= maxDepth) return []
    const inbound = await inboundFor(schema, table)
    if (inbound.length === 0) return []

    const children: CascadeNode[] = []
    for (const fk of inbound) {
      // Build the SELECT that finds child rows whose FK columns equal the
      // parent's PK values. If the parent doesn't actually carry one of
      // the referenced parent columns, record the gap so the modal can
      // surface "we tried this FK but couldn't follow it" — never silent.
      const missing = fk.parentColumns.filter((col) => !(col in fkLookup))
      if (missing.length > 0) {
        recordUnresolved(fk, missing)
        logger.info(
          'fk skipped — missing parent column(s)',
          `${fk.childSchema}.${fk.childTable} via ${fk.constraintName}`,
          `missing: ${missing.join(',')}`
        )
        continue
      }

      let rows: ChildRow[]
      try {
        rows = await selectChildRows(
          request.connectionId,
          engine,
          schema,
          table,
          fk,
          fkLookup,
          maxRows + 1 // +1 so we can tell if there's more.
        )
      } catch (err) {
        logger.error(
          'child lookup failed',
          `${fk.childSchema}.${fk.childTable}.${fk.childColumns.join(',')}`,
          err
        )
        continue
      }
      if (rows.length > 0) {
        logger.info(
          'child rows',
          `${fk.childSchema}.${fk.childTable}`,
          `${rows.length} via ${fk.childColumns.join(',')}`
        )
      }

      let truncatedHere: CascadeNode['truncated'] = undefined
      let trimmedRows = rows
      if (rows.length > maxRows) {
        trimmedRows = rows.slice(0, maxRows)
        truncatedHere = { foundSoFar: maxRows, limit: maxRows }
        truncatedTables.push({
          schema: fk.childSchema,
          table: fk.childTable,
          foundSoFar: maxRows,
          limit: maxRows
        })
      }

      for (const { rowKey: childRowKey, fullRow } of trimmedRows) {
        const childVisitKey = visitKey(fk.childSchema, fk.childTable, childRowKey)
        if (visited.has(childVisitKey)) continue // cycle break
        visited.add(childVisitKey)

        const childId = `${parentId}>${fk.constraintName}::${stableStringify(childRowKey)}`
        // We always have the full body for child rows (we SELECT *'d
        // them above), so pass it directly — every column is available
        // to satisfy whatever the next layer of FKs references.
        const grandchildren = await buildChildren(
          fk.childSchema,
          fk.childTable,
          fullRow,
          childId,
          depth + 1
        )
        totalDescendants += 1
        const node: CascadeNode = {
          id: childId,
          schema: fk.childSchema,
          table: fk.childTable,
          rowKey: childRowKey,
          fullRow,
          viaConstraint: fk.constraintName,
          viaColumn: fk.childColumns.join(', '),
          children: grandchildren
        }
        if (truncatedHere) node.truncated = truncatedHere
        children.push(node)
      }
    }
    return children
  }

  const roots: CascadeNode[] = []
  for (const rowKey of request.rowKeys) {
    const rootId = `root::${request.schema}.${request.table}::${stableStringify(rowKey)}`
    const rootVisitKey = visitKey(request.schema, request.table, rowKey)
    visited.add(rootVisitKey)

    // Fetch the root body BEFORE walking children. Two reasons:
    //   1. The modal needs every column to render "what is being deleted".
    //   2. The FK walker uses the full row as its lookup table — so FKs
    //      that reference columns the renderer didn't send (e.g. it only
    //      sent the PK `seq`, but FKs target `id` or `trans_no`) still
    //      resolve. Without this, `buildChildren` skips every FK silently
    //      and the user sees "0 descendants" on a row that has dozens.
    let rootFullRow: Record<string, unknown> | null = null
    let rootFullRowError: string | undefined
    try {
      rootFullRow = await selectFullRow(
        request.connectionId,
        engine,
        request.schema,
        request.table,
        rowKey
      )
      if (!rootFullRow) {
        rootFullRowError = `No row in ${request.schema}.${request.table} matches ${formatRowKeyForError(rowKey)} — it may have been deleted by another session.`
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      rootFullRowError = message
      logger.error('root row fetch failed', `${request.schema}.${request.table}`, err)
    }

    const fkLookup = rootFullRow ?? rowKey
    const children = await buildChildren(
      request.schema,
      request.table,
      fkLookup,
      rootId,
      0
    )
    const root: CascadeNode = {
      id: rootId,
      schema: request.schema,
      table: request.table,
      rowKey,
      fullRow: rootFullRow,
      viaConstraint: null,
      viaColumn: null,
      children
    }
    if (rootFullRowError) root.fullRowError = rootFullRowError
    roots.push(root)
  }

  const durationMs = Date.now() - startedAt
  logger.info(
    'scan complete',
    `${totalDescendants} descendants in ${durationMs} ms`,
    truncatedTables.length > 0 ? `${truncatedTables.length} truncated` : '',
    unresolvedFks.length > 0 ? `${unresolvedFks.length} unresolved FKs` : ''
  )
  return { roots, totalDescendants, truncatedTables, unresolvedFks, durationMs }
}

// ──────────────────────────────────────────────────────────── FK introspect ──

async function loadInboundFkPostgres(
  connectionId: string,
  schema: string,
  table: string
): Promise<InboundFk[]> {
  const result = await connectionManager.runScanQuery(
    connectionId,
    `
      SELECT
        con.conname,
        src_ns.nspname AS child_schema,
        src_cls.relname AS child_table,
        array_agg(src_att.attname ORDER BY src_k.ord) AS child_columns,
        array_agg(tgt_att.attname ORDER BY src_k.ord) AS parent_columns
      FROM pg_constraint con
      JOIN pg_class src_cls ON src_cls.oid = con.conrelid
      JOIN pg_namespace src_ns ON src_ns.oid = src_cls.relnamespace
      JOIN pg_class tgt_cls ON tgt_cls.oid = con.confrelid
      JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt_cls.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY src_k(attnum, ord) ON TRUE
      JOIN unnest(con.confkey) WITH ORDINALITY tgt_k(attnum, ord)
        ON src_k.ord = tgt_k.ord
      JOIN pg_attribute src_att
        ON src_att.attrelid = con.conrelid AND src_att.attnum = src_k.attnum
      JOIN pg_attribute tgt_att
        ON tgt_att.attrelid = con.confrelid AND tgt_att.attnum = tgt_k.attnum
      WHERE con.contype = 'f'
        AND tgt_ns.nspname = $1
        AND tgt_cls.relname = $2
      GROUP BY con.conname, src_ns.nspname, src_cls.relname
    `.replace('$1', sqlLiteral(schema)).replace('$2', sqlLiteral(table))
  )
  return result.rows.map((row) => ({
    constraintName: String(row[0]),
    childSchema: String(row[1]),
    childTable: String(row[2]),
    childColumns: row[3] as string[],
    parentColumns: row[4] as string[]
  }))
}

async function loadInboundFkMysql(
  connectionId: string,
  schema: string,
  table: string
): Promise<InboundFk[]> {
  // information_schema doesn't give us a clean array_agg; group + collect on the
  // app side. Sort by ordinal_position so multi-column FKs line up correctly.
  const result = await connectionManager.runScanQuery(
    connectionId,
    `
      SELECT
        kcu.constraint_name,
        kcu.table_schema AS child_schema,
        kcu.table_name AS child_table,
        kcu.column_name AS child_column,
        kcu.referenced_column_name AS parent_column,
        kcu.ordinal_position
      FROM information_schema.key_column_usage kcu
      WHERE kcu.referenced_table_schema = ${sqlLiteral(schema)}
        AND kcu.referenced_table_name = ${sqlLiteral(table)}
        AND kcu.referenced_column_name IS NOT NULL
      ORDER BY kcu.constraint_name, kcu.ordinal_position
    `
  )
  const grouped = new Map<string, InboundFk>()
  for (const row of result.rows) {
    const constraintName = String(row[0])
    const key = `${row[1]}.${row[2]}::${constraintName}`
    const existing = grouped.get(key)
    if (existing) {
      existing.childColumns.push(String(row[3]))
      existing.parentColumns.push(String(row[4]))
    } else {
      grouped.set(key, {
        constraintName,
        childSchema: String(row[1]),
        childTable: String(row[2]),
        childColumns: [String(row[3])],
        parentColumns: [String(row[4])]
      })
    }
  }
  return [...grouped.values()]
}

// ──────────────────────────────────────────────────────────── row fetching ──

/** A child row plus every column on it, so the modal can show full detail. */
interface ChildRow {
  /** PK column→value (or FK columns when there's no PK). Stable identity. */
  rowKey: Record<string, unknown>
  /** Every column on the row — what's actually being deleted. */
  fullRow: Record<string, unknown>
}

/**
 * SELECT * for every child row referencing the given parent. We return both
 * the PK projection (used as the row's stable identity for visited-set,
 * dedupe, and DELETE WHERE IN) and the full column map (used by the UI).
 */
async function selectChildRows(
  connectionId: string,
  engine: 'postgres' | 'mysql',
  parentSchema: string,
  parentTable: string,
  fk: InboundFk,
  parentRowKey: Record<string, unknown>,
  limit: number
): Promise<ChildRow[]> {
  // Look up the child table's PK columns so we can return rich rowKeys (not
  // just the FK columns). If no PK exists we fall back to the FK columns.
  const pkColumns = await primaryKeyColumns(connectionId, engine, fk.childSchema, fk.childTable)
  const rowKeyCols = pkColumns.length > 0 ? pkColumns : fk.childColumns

  const whereClauses = fk.childColumns.map((childCol, i) => {
    const value = parentRowKey[fk.parentColumns[i]]
    return `${quoteColumn(engine, childCol)} ${eqOrIsNull(engine, value)}`
  })
  const where = whereClauses.join(' AND ')

  const sql = `
    SELECT *
    FROM ${quoteRelation(engine, fk.childSchema, fk.childTable)}
    WHERE ${where}
    LIMIT ${limit}
  `

  // parentSchema / parentTable aren't used in the query (lookup happens via the
  // FK columns) — they're kept in the signature for log traceability.
  void parentSchema
  void parentTable

  const result = await connectionManager.runScanQuery(connectionId, sql)
  const columnNames = result.columns.map((c) => c.name)
  return result.rows.map((row) => {
    const fullRow: Record<string, unknown> = {}
    columnNames.forEach((column, index) => {
      fullRow[column] = row[index]
    })
    const rowKey: Record<string, unknown> = {}
    for (const col of rowKeyCols) rowKey[col] = fullRow[col]
    return { rowKey, fullRow }
  })
}

/** SELECT * for a single root row given its PK values. */
async function selectFullRow(
  connectionId: string,
  engine: 'postgres' | 'mysql',
  schema: string,
  table: string,
  rowKey: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const where = Object.entries(rowKey)
    .map(([col, value]) => `${quoteColumn(engine, col)} ${eqOrIsNull(engine, value)}`)
    .join(' AND ')
  if (!where) return null
  const sql = `SELECT * FROM ${quoteRelation(engine, schema, table)} WHERE ${where} LIMIT 1`
  const result = await connectionManager.runScanQuery(connectionId, sql)
  if (result.rows.length === 0) return null
  const columnNames = result.columns.map((c) => c.name)
  const fullRow: Record<string, unknown> = {}
  columnNames.forEach((column, index) => {
    fullRow[column] = result.rows[0][index]
  })
  return fullRow
}

async function primaryKeyColumns(
  connectionId: string,
  engine: 'postgres' | 'mysql',
  schema: string,
  table: string
): Promise<string[]> {
  const sql =
    engine === 'postgres'
      ? `
          SELECT att.attname
          FROM pg_index idx
          JOIN pg_class cls ON cls.oid = idx.indrelid
          JOIN pg_namespace ns ON ns.oid = cls.relnamespace
          JOIN unnest(idx.indkey) WITH ORDINALITY k(attnum, ord) ON TRUE
          JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = k.attnum
          WHERE idx.indisprimary
            AND ns.nspname = ${sqlLiteral(schema)}
            AND cls.relname = ${sqlLiteral(table)}
          ORDER BY k.ord
        `
      : `
          SELECT column_name
          FROM information_schema.key_column_usage
          WHERE constraint_name = 'PRIMARY'
            AND table_schema = ${sqlLiteral(schema)}
            AND table_name = ${sqlLiteral(table)}
          ORDER BY ordinal_position
        `
  const result = await connectionManager.runScanQuery(connectionId, sql)
  return result.rows.map((row) => String(row[0]))
}

// ─────────────────────────────────────────────────────────────── utilities ──

/** Stable JSON for the visited-set key — sorts keys so {a,b} === {b,a}. */
function stableStringify(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort()
  return JSON.stringify(keys.map((k) => [k, value[k] === null ? null : String(value[k])]))
}

/** Format `{seq: 12, type: 10}` → `seq=12, type=10` for error messages. */
function formatRowKeyForError(rowKey: Record<string, unknown>): string {
  return Object.entries(rowKey)
    .map(([col, value]) => `${col}=${value === null ? 'NULL' : String(value)}`)
    .join(', ')
}

/** Escape a literal for inline use — read-only scanner queries, no user input. */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function quoteColumn(engine: 'postgres' | 'mysql', name: string): string {
  return engine === 'mysql'
    ? `\`${name.replace(/`/g, '``')}\``
    : `"${name.replace(/"/g, '""')}"`
}

function quoteRelation(engine: 'postgres' | 'mysql', schema: string, table: string): string {
  return `${quoteColumn(engine, schema)}.${quoteColumn(engine, table)}`
}

/** Render an `= 'value'` or `IS NULL` clause from a JS value. */
function eqOrIsNull(engine: 'postgres' | 'mysql', value: unknown): string {
  if (value === null || value === undefined) return 'IS NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return `= ${value}`
  if (typeof value === 'bigint') return `= ${value.toString()}`
  if (typeof value === 'boolean') return `= ${value ? 'TRUE' : 'FALSE'}`
  // Strings + everything else — escape and quote. Engine-agnostic single-quoting.
  void engine
  return `= '${String(value).replace(/'/g, "''")}'`
}
