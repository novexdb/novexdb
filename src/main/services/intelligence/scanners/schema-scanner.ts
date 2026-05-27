import { randomUUID } from 'node:crypto'
import { connectionManager } from '@main/services/connection-manager'
import type { Issue, TableSizeStats } from '@shared/types/intelligence'
import type { Scanner, ScannerOutput, ScanContext } from '@main/services/intelligence/scanner-types'

/**
 * Schema-level inspector — flags missing primary keys, foreign-key columns
 * lacking an index, duplicate indexes, and populates the table-size summary.
 *
 * Every query is read-only, engine-aware, and individually fault-tolerant —
 * a failing query degrades to a single `scanner_query_failure` issue instead
 * of sinking the whole scan, so partial results still reach the dashboard.
 */
export class SchemaScanner implements Scanner {
  readonly kind = 'schema' as const
  readonly label = 'Schema scan'

  async run(ctx: ScanContext): Promise<ScannerOutput> {
    const engine = await connectionManager.getEngine(ctx.connectionId)
    if (engine === 'postgres') return runPostgres(ctx)
    if (engine === 'mysql') return runMysql(ctx)
    throw new Error(`Schema scan is not yet supported for engine "${engine}".`)
  }
}

const now = (): string => new Date().toISOString()

function issue(partial: Omit<Issue, 'id' | 'source' | 'detectedAt'>): Issue {
  return { id: randomUUID(), source: 'schema', detectedAt: now(), ...partial }
}

/**
 * Run a single scan query; on failure, log + surface a low-noise issue and
 * return an empty result so the caller can keep going. Keeps one missing
 * privilege or dialect quirk from blanking the whole dashboard.
 */
async function tryQuery(
  ctx: ScanContext,
  step: string,
  sql: string,
  bag: Issue[]
): Promise<{ rows: unknown[][] }> {
  try {
    const result = await connectionManager.runScanQuery(ctx.connectionId, sql)
    return { rows: result.rows }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[schema-scanner] "${step}" failed:`, err)
    bag.push(
      issue({
        severity: 'medium',
        type: 'scanner_query_failure',
        table: null,
        description: `Schema scan step "${step}" failed: ${message}`,
        suggestedSql: sql.trim()
      })
    )
    return { rows: [] }
  }
}

// ────────────────────────────────────────────────────────────── PostgreSQL ──

async function runPostgres(ctx: ScanContext): Promise<ScannerOutput> {
  const issues: Issue[] = []
  const tableSizes: TableSizeStats[] = []

  ctx.reportTask('Inspecting tables…')
  const tablesResult = await tryQuery(
    ctx,
    'List tables and sizes',
    `
      SELECT n.nspname AS schema,
             c.relname AS "table",
             c.reltuples::bigint AS row_estimate,
             pg_total_relation_size(c.oid)::bigint AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `,
    issues
  )
  ctx.signal.throwIfAborted()

  let totalTables = 0
  let totalRows = 0
  let databaseSizeBytes = 0
  for (const row of tablesResult.rows) {
    const schema = String(row[0])
    const table = String(row[1])
    const rowEstimate = Number(row[2] ?? 0)
    const bytes = Number(row[3] ?? 0)
    totalTables += 1
    totalRows += rowEstimate
    databaseSizeBytes += bytes
    tableSizes.push({ schema, table, rowEstimate, bytes })
  }

  ctx.reportTask('Checking for tables without a primary key…')
  const noPkResult = await tryQuery(
    ctx,
    'Find tables without a primary key',
    `
      SELECT n.nspname AS schema, c.relname AS "table"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint con
          WHERE con.conrelid = c.oid AND con.contype = 'p'
        )
      ORDER BY 1, 2
    `,
    issues
  )
  ctx.signal.throwIfAborted()
  for (const row of noPkResult.rows) {
    const schema = String(row[0])
    const table = String(row[1])
    issues.push(
      issue({
        severity: 'high',
        type: 'missing_primary_key',
        table: `${schema}.${table}`,
        description: `Table "${schema}"."${table}" has no primary key — updates and deletes cannot reliably target individual rows.`,
        suggestedSql: `ALTER TABLE "${schema}"."${table}" ADD COLUMN id BIGSERIAL PRIMARY KEY;`
      })
    )
  }

  ctx.reportTask('Looking for unindexed foreign keys…')
  // Single-column FKs only — the common case. Multi-column FKs are rare and
  // their index detection adds enough query complexity to be a follow-up.
  const missingFkIdx = await tryQuery(
    ctx,
    'Find unindexed foreign-key columns',
    `
      SELECT n.nspname AS schema,
             cl.relname AS "table",
             c.conname AS constraint_name,
             att.attname AS "column"
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_attribute att ON att.attrelid = c.conrelid
                            AND att.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND array_length(c.conkey, 1) = 1
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND NOT EXISTS (
          SELECT 1
          FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND i.indkey[0] = c.conkey[1]
        )
      ORDER BY 1, 2
    `,
    issues
  )
  ctx.signal.throwIfAborted()
  for (const row of missingFkIdx.rows) {
    const schema = String(row[0])
    const table = String(row[1])
    const column = String(row[3])
    issues.push(
      issue({
        severity: 'medium',
        type: 'missing_fk_index',
        table: `${schema}.${table}`,
        column,
        description: `Foreign-key column "${column}" on "${schema}"."${table}" lacks a supporting index — joins and cascades will scan.`,
        suggestedSql: `CREATE INDEX ON "${schema}"."${table}" ("${column}");`
      })
    )
  }

  ctx.reportTask('Scanning for duplicate indexes…')
  // Group by the indkey signature cast to text — `int2vector` doesn't sort cleanly.
  const dupIdx = await tryQuery(
    ctx,
    'Find duplicate non-unique indexes',
    `
      SELECT n.nspname AS schema,
             tc.relname AS "table",
             array_agg(ic.relname ORDER BY ic.relname) AS index_names
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_class tc ON tc.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = tc.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND NOT i.indisunique
      GROUP BY n.nspname, tc.relname, i.indkey::text
      HAVING count(*) > 1
    `,
    issues
  )
  ctx.signal.throwIfAborted()
  for (const row of dupIdx.rows) {
    const schema = String(row[0])
    const table = String(row[1])
    const names = (row[2] as string[]) ?? []
    issues.push(
      issue({
        severity: 'low',
        type: 'duplicate_index',
        table: `${schema}.${table}`,
        description: `Indexes ${names.join(', ')} on "${schema}"."${table}" cover the same columns — one is redundant.`,
        suggestedSql: `-- Drop the redundant index, e.g.:\nDROP INDEX "${schema}"."${names[1] ?? names[0]}";`
      })
    )
  }

  return {
    issues,
    summary: {
      totalTables,
      totalRows,
      databaseSizeBytes,
      missingForeignKeys: missingFkIdx.rows.length,
      missingIndexes: missingFkIdx.rows.length + dupIdx.rows.length
    },
    tableSizes
  }
}

// ─────────────────────────────────────────────────────────────────── MySQL ──

async function runMysql(ctx: ScanContext): Promise<ScannerOutput> {
  const issues: Issue[] = []
  const tableSizes: TableSizeStats[] = []

  ctx.reportTask('Inspecting tables…')
  const tablesResult = await tryQuery(
    ctx,
    'List tables and sizes',
    `
      SELECT table_schema, table_name, COALESCE(table_rows, 0) AS row_estimate,
             COALESCE(data_length + index_length, 0) AS bytes
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema = DATABASE()
      ORDER BY bytes DESC
    `,
    issues
  )
  ctx.signal.throwIfAborted()

  let totalTables = 0
  let totalRows = 0
  let databaseSizeBytes = 0
  for (const row of tablesResult.rows) {
    const schema = String(row[0])
    const table = String(row[1])
    const rowEstimate = Number(row[2] ?? 0)
    const bytes = Number(row[3] ?? 0)
    totalTables += 1
    totalRows += rowEstimate
    databaseSizeBytes += bytes
    tableSizes.push({ schema, table, rowEstimate, bytes })
  }

  ctx.reportTask('Checking for tables without a primary key…')
  const noPk = await tryQuery(
    ctx,
    'Find tables without a primary key',
    `
      SELECT t.table_schema, t.table_name
      FROM information_schema.tables t
      LEFT JOIN information_schema.table_constraints tc
        ON tc.table_schema = t.table_schema
       AND tc.table_name = t.table_name
       AND tc.constraint_type = 'PRIMARY KEY'
      WHERE t.table_type = 'BASE TABLE'
        AND t.table_schema = DATABASE()
        AND tc.constraint_name IS NULL
      ORDER BY 1, 2
    `,
    issues
  )
  ctx.signal.throwIfAborted()
  for (const row of noPk.rows) {
    const schema = String(row[0])
    const table = String(row[1])
    issues.push(
      issue({
        severity: 'high',
        type: 'missing_primary_key',
        table: `${schema}.${table}`,
        description: `Table \`${schema}\`.\`${table}\` has no primary key — updates and deletes cannot reliably target individual rows.`,
        suggestedSql: `ALTER TABLE \`${schema}\`.\`${table}\` ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY;`
      })
    )
  }

  ctx.reportTask('Looking for unindexed foreign keys…')
  const missingFkIdx = await tryQuery(
    ctx,
    'Find unindexed foreign-key columns',
    `
      SELECT kcu.table_schema, kcu.table_name, kcu.constraint_name, kcu.column_name
      FROM information_schema.key_column_usage kcu
      WHERE kcu.referenced_table_name IS NOT NULL
        AND kcu.table_schema = DATABASE()
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.statistics s
          WHERE s.table_schema = kcu.table_schema
            AND s.table_name = kcu.table_name
            AND s.column_name = kcu.column_name
            AND s.seq_in_index = 1
        )
      ORDER BY 1, 2
    `,
    issues
  )
  ctx.signal.throwIfAborted()
  for (const row of missingFkIdx.rows) {
    const schema = String(row[0])
    const table = String(row[1])
    const column = String(row[3])
    issues.push(
      issue({
        severity: 'medium',
        type: 'missing_fk_index',
        table: `${schema}.${table}`,
        column,
        description: `Foreign-key column \`${column}\` on \`${schema}\`.\`${table}\` lacks a supporting index — joins and cascades will scan.`,
        suggestedSql: `CREATE INDEX \`idx_${table}_${column}\` ON \`${schema}\`.\`${table}\` (\`${column}\`);`
      })
    )
  }

  return {
    issues,
    summary: {
      totalTables,
      totalRows,
      databaseSizeBytes,
      missingForeignKeys: missingFkIdx.rows.length,
      missingIndexes: missingFkIdx.rows.length
    },
    tableSizes
  }
}
