import { connectionManager } from '@main/services/connection-manager'
import { quoteIdent, quoteMysqlIdent } from '@main/utils/sql'
import type { Issue } from '@shared/types/intelligence'
import type { Scanner, ScannerOutput, ScanContext } from '@main/services/intelligence/scanner-types'
import { issueFactory, tryQuery } from '@main/services/intelligence/scanners/scanner-utils'

const issue = issueFactory('data-quality')

/** Skip tables larger than this — quality checks would scan too much. */
const MAX_ROWS_FOR_QUALITY_SCAN = 1_000_000
/** Only sample this many tables per scan (the largest ones the scanner can
 *  reach safely) so the whole pass stays under a few seconds. */
const TABLE_SAMPLE_LIMIT = 20
/** Threshold for flagging "excessive NULLs". */
const NULL_FLAG_RATIO = 0.8
/** Minimum total rows before NULL spikes become statistically meaningful. */
const NULL_MIN_ROWS = 100

const EMAIL_REGEX = '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\\\.[A-Za-z]{2,}$'

/**
 * Sample-based data-quality inspector — focuses on the largest reachable
 * tables, finds columns that look like emails / phones and surfaces invalid
 * values, duplicates and NULL spikes. Every per-column query is
 * fault-tolerant; one missing privilege doesn't sink the rest of the scan.
 */
export class DataQualityScanner implements Scanner {
  readonly kind = 'data-quality' as const
  readonly label = 'Data quality scan'

  async run(ctx: ScanContext): Promise<ScannerOutput> {
    const engine = await connectionManager.getEngine(ctx.connectionId)
    if (engine === 'postgres') return runPostgres(ctx)
    if (engine === 'mysql') return runMysql(ctx)
    throw new Error(`Data quality scan is not yet supported for engine "${engine}".`)
  }
}

interface ColumnRef {
  schema: string
  table: string
  column: string
  /** Estimated row count of the parent table; null when unknown. */
  rowEstimate: number | null
}

// ────────────────────────────────────────────────────────────── PostgreSQL ──

async function runPostgres(ctx: ScanContext): Promise<ScannerOutput> {
  const issues: Issue[] = []
  let duplicateRecordsCount = 0
  let invalidRecordsCount = 0

  ctx.reportTask('Picking reachable tables…')
  const targetTables = await tryQuery(
    ctx,
    'List candidate tables',
    `
      SELECT n.nspname AS schema, c.relname AS "table", c.reltuples::bigint AS row_estimate
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND c.reltuples::bigint <= ${MAX_ROWS_FOR_QUALITY_SCAN}
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT ${TABLE_SAMPLE_LIMIT}
    `,
    issues,
    'data-quality'
  )
  ctx.signal.throwIfAborted()
  const tableSet = new Set(
    targetTables.rows.map((r) => `${String(r[0])}.${String(r[1])}`)
  )

  ctx.reportTask('Listing column candidates…')
  const columnsResult = await tryQuery(
    ctx,
    'List text columns',
    `
      SELECT c.table_schema, c.table_name, c.column_name, c.is_nullable, c.data_type
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND c.data_type IN ('text', 'character varying', 'character', 'citext')
      ORDER BY c.table_schema, c.table_name, c.ordinal_position
    `,
    issues,
    'data-quality'
  )
  ctx.signal.throwIfAborted()

  const columnsByTable = new Map<string, ColumnRef[]>()
  for (const row of columnsResult.rows) {
    const schema = String(row[0])
    const table = String(row[1])
    const column = String(row[2])
    const key = `${schema}.${table}`
    if (!tableSet.has(key)) continue
    const list = columnsByTable.get(key) ?? []
    list.push({ schema, table, column, rowEstimate: null })
    columnsByTable.set(key, list)
  }

  for (const [key, columns] of columnsByTable) {
    if (ctx.signal.aborted) break
    ctx.reportTask(`Scanning ${key}…`)
    for (const col of columns) {
      if (ctx.signal.aborted) break
      const looksEmail = /email/i.test(col.column)
      const looksPhone = /phone|mobile|tel/i.test(col.column)
      const qualified = `"${col.schema}"."${col.table}"`
      const colExpr = quoteIdent(col.column)

      // Excessive NULLs — useful for any text column.
      const nulls = await tryQuery(
        ctx,
        `Count NULLs in ${col.schema}.${col.table}.${col.column}`,
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE ${colExpr} IS NULL) AS nulls
         FROM ${qualified}`,
        issues,
        'data-quality',
        { failureSeverity: 'low' }
      )
      const nullRow = nulls.rows[0]
      if (nullRow) {
        const total = Number(nullRow[0] ?? 0)
        const nullCount = Number(nullRow[1] ?? 0)
        if (total >= NULL_MIN_ROWS && nullCount / total >= NULL_FLAG_RATIO) {
          issues.push(
            issue({
              severity: 'low',
              type: 'excessive_nulls',
              table: `${col.schema}.${col.table}`,
              column: col.column,
              rowsAffected: nullCount,
              description: `${col.column} on "${col.schema}"."${col.table}" is NULL for ${Math.round((nullCount / total) * 100)}% of rows — consider tightening the schema or backfilling.`,
              suggestedSql: `-- Inspect the rows:\nSELECT * FROM "${col.schema}"."${col.table}" WHERE ${colExpr} IS NOT NULL LIMIT 25;`
            })
          )
          invalidRecordsCount += nullCount
        }
      }

      // Invalid email syntax + duplicate emails — only if the column looks like an email.
      if (looksEmail) {
        const invalid = await tryQuery(
          ctx,
          `Find invalid emails in ${col.schema}.${col.table}.${col.column}`,
          `SELECT count(*) FROM ${qualified}
           WHERE ${colExpr} IS NOT NULL
             AND ${colExpr} !~ '${EMAIL_REGEX}'`,
          issues,
          'data-quality',
          { failureSeverity: 'low' }
        )
        const count = Number(invalid.rows[0]?.[0] ?? 0)
        if (count > 0) {
          issues.push(
            issue({
              severity: 'medium',
              type: 'invalid_emails',
              table: `${col.schema}.${col.table}`,
              column: col.column,
              rowsAffected: count,
              description: `${count.toLocaleString()} row(s) in "${col.schema}"."${col.table}".${col.column} don't match a valid email pattern.`,
              suggestedSql: `SELECT * FROM "${col.schema}"."${col.table}" WHERE ${colExpr} !~ '${EMAIL_REGEX}' LIMIT 25;`
            })
          )
          invalidRecordsCount += count
        }
      }

      if (looksEmail || looksPhone) {
        const dups = await tryQuery(
          ctx,
          `Find duplicates in ${col.schema}.${col.table}.${col.column}`,
          `SELECT count(*) FROM (
             SELECT ${colExpr}
             FROM ${qualified}
             WHERE ${colExpr} IS NOT NULL
             GROUP BY ${colExpr}
             HAVING count(*) > 1
           ) t`,
          issues,
          'data-quality',
          { failureSeverity: 'low' }
        )
        const dupCount = Number(dups.rows[0]?.[0] ?? 0)
        if (dupCount > 0) {
          issues.push(
            issue({
              severity: 'medium',
              type: looksEmail ? 'duplicate_emails' : 'duplicate_phones',
              table: `${col.schema}.${col.table}`,
              column: col.column,
              rowsAffected: dupCount,
              description: `${dupCount.toLocaleString()} ${looksEmail ? 'email' : 'phone'} value(s) appear more than once in "${col.schema}"."${col.table}".${col.column}.`,
              suggestedSql: `SELECT ${colExpr}, count(*) AS occurrences\nFROM "${col.schema}"."${col.table}"\nGROUP BY ${colExpr}\nHAVING count(*) > 1\nORDER BY 2 DESC\nLIMIT 25;`
            })
          )
          duplicateRecordsCount += dupCount
        }
      }
    }
  }

  duplicateRecordsCount += await runIdentifierDuplicateChecksPostgres(ctx, issues)

  return {
    issues,
    summary: { duplicateRecordsCount, invalidRecordsCount }
  }
}

// ─────────────────────────────────────────────────────────────────── MySQL ──

async function runMysql(ctx: ScanContext): Promise<ScannerOutput> {
  const issues: Issue[] = []
  let duplicateRecordsCount = 0
  let invalidRecordsCount = 0

  ctx.reportTask('Picking reachable tables…')
  const targetTables = await tryQuery(
    ctx,
    'List candidate tables',
    `
      SELECT table_schema, table_name, COALESCE(table_rows, 0) AS row_estimate
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema = DATABASE()
        AND COALESCE(table_rows, 0) <= ${MAX_ROWS_FOR_QUALITY_SCAN}
      ORDER BY COALESCE(data_length + index_length, 0) DESC
      LIMIT ${TABLE_SAMPLE_LIMIT}
    `,
    issues,
    'data-quality'
  )
  ctx.signal.throwIfAborted()
  const tableSet = new Set(
    targetTables.rows.map((r) => `${String(r[0])}.${String(r[1])}`)
  )

  ctx.reportTask('Listing column candidates…')
  const columnsResult = await tryQuery(
    ctx,
    'List text columns',
    `
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND data_type IN ('char', 'varchar', 'text', 'tinytext', 'mediumtext', 'longtext')
      ORDER BY table_schema, table_name, ordinal_position
    `,
    issues,
    'data-quality'
  )
  ctx.signal.throwIfAborted()

  const columnsByTable = new Map<string, ColumnRef[]>()
  for (const row of columnsResult.rows) {
    const schema = String(row[0])
    const table = String(row[1])
    const column = String(row[2])
    const key = `${schema}.${table}`
    if (!tableSet.has(key)) continue
    const list = columnsByTable.get(key) ?? []
    list.push({ schema, table, column, rowEstimate: null })
    columnsByTable.set(key, list)
  }

  for (const [key, columns] of columnsByTable) {
    if (ctx.signal.aborted) break
    ctx.reportTask(`Scanning ${key}…`)
    for (const col of columns) {
      if (ctx.signal.aborted) break
      const looksEmail = /email/i.test(col.column)
      const looksPhone = /phone|mobile|tel/i.test(col.column)
      const qualified = `\`${col.schema}\`.\`${col.table}\``
      const colExpr = quoteMysqlIdent(col.column)

      const nulls = await tryQuery(
        ctx,
        `Count NULLs in ${col.schema}.${col.table}.${col.column}`,
        `SELECT count(*) AS total,
                SUM(CASE WHEN ${colExpr} IS NULL THEN 1 ELSE 0 END) AS nulls
         FROM ${qualified}`,
        issues,
        'data-quality',
        { failureSeverity: 'low' }
      )
      const nullRow = nulls.rows[0]
      if (nullRow) {
        const total = Number(nullRow[0] ?? 0)
        const nullCount = Number(nullRow[1] ?? 0)
        if (total >= NULL_MIN_ROWS && nullCount / total >= NULL_FLAG_RATIO) {
          issues.push(
            issue({
              severity: 'low',
              type: 'excessive_nulls',
              table: `${col.schema}.${col.table}`,
              column: col.column,
              rowsAffected: nullCount,
              description: `${col.column} on \`${col.schema}\`.\`${col.table}\` is NULL for ${Math.round((nullCount / total) * 100)}% of rows — consider tightening the schema or backfilling.`,
              suggestedSql: `-- Inspect the rows:\nSELECT * FROM \`${col.schema}\`.\`${col.table}\` WHERE ${colExpr} IS NOT NULL LIMIT 25;`
            })
          )
          invalidRecordsCount += nullCount
        }
      }

      if (looksEmail) {
        const invalid = await tryQuery(
          ctx,
          `Find invalid emails in ${col.schema}.${col.table}.${col.column}`,
          `SELECT count(*) FROM ${qualified}
           WHERE ${colExpr} IS NOT NULL
             AND ${colExpr} NOT REGEXP '${EMAIL_REGEX}'`,
          issues,
          'data-quality',
          { failureSeverity: 'low' }
        )
        const count = Number(invalid.rows[0]?.[0] ?? 0)
        if (count > 0) {
          issues.push(
            issue({
              severity: 'medium',
              type: 'invalid_emails',
              table: `${col.schema}.${col.table}`,
              column: col.column,
              rowsAffected: count,
              description: `${count.toLocaleString()} row(s) in \`${col.schema}\`.\`${col.table}\`.${col.column} don't match a valid email pattern.`,
              suggestedSql: `SELECT * FROM \`${col.schema}\`.\`${col.table}\` WHERE ${colExpr} NOT REGEXP '${EMAIL_REGEX}' LIMIT 25;`
            })
          )
          invalidRecordsCount += count
        }
      }

      if (looksEmail || looksPhone) {
        const dups = await tryQuery(
          ctx,
          `Find duplicates in ${col.schema}.${col.table}.${col.column}`,
          `SELECT count(*) FROM (
             SELECT ${colExpr}
             FROM ${qualified}
             WHERE ${colExpr} IS NOT NULL
             GROUP BY ${colExpr}
             HAVING count(*) > 1
           ) t`,
          issues,
          'data-quality',
          { failureSeverity: 'low' }
        )
        const dupCount = Number(dups.rows[0]?.[0] ?? 0)
        if (dupCount > 0) {
          issues.push(
            issue({
              severity: 'medium',
              type: looksEmail ? 'duplicate_emails' : 'duplicate_phones',
              table: `${col.schema}.${col.table}`,
              column: col.column,
              rowsAffected: dupCount,
              description: `${dupCount.toLocaleString()} ${looksEmail ? 'email' : 'phone'} value(s) appear more than once in \`${col.schema}\`.\`${col.table}\`.${col.column}.`,
              suggestedSql: `SELECT ${colExpr}, count(*) AS occurrences\nFROM \`${col.schema}\`.\`${col.table}\`\nGROUP BY ${colExpr}\nHAVING count(*) > 1\nORDER BY 2 DESC\nLIMIT 25;`
            })
          )
          duplicateRecordsCount += dupCount
        }
      }
    }
  }

  duplicateRecordsCount += await runIdentifierDuplicateChecksMysql(ctx, issues)

  return {
    issues,
    summary: { duplicateRecordsCount, invalidRecordsCount }
  }
}

// ────────────────────────────────────── composite-key duplicate detection ──

/** Column-name patterns that look like business identifiers — when these are
 *  duplicated across rows it's almost always a data-entry / import problem. */
const IDENTIFIER_PATTERN =
  /(invoice_?number|invoice_?id|order_?number|order_?id|receipt_?number|sku|barcode|reference|ref_?no)/i

async function runIdentifierDuplicateChecksPostgres(
  ctx: ScanContext,
  issues: Issue[]
): Promise<number> {
  ctx.reportTask('Looking for duplicate business identifiers…')
  const cols = await tryQuery(
    ctx,
    'List identifier-shaped columns',
    `
      SELECT c.table_schema, c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
    `,
    issues,
    'data-quality'
  )
  let dupCount = 0
  for (const row of cols.rows) {
    if (ctx.signal.aborted) break
    const schema = String(row[0])
    const table = String(row[1])
    const column = String(row[2])
    if (!IDENTIFIER_PATTERN.test(column)) continue

    const qualified = `"${schema}"."${table}"`
    const colExpr = `"${column}"`
    const dups = await tryQuery(
      ctx,
      `Find duplicate identifiers in ${schema}.${table}.${column}`,
      `SELECT count(*) FROM (
         SELECT ${colExpr}
         FROM ${qualified}
         WHERE ${colExpr} IS NOT NULL
         GROUP BY ${colExpr}
         HAVING count(*) > 1
       ) t`,
      issues,
      'data-quality',
      { failureSeverity: 'low' }
    )
    const groups = Number(dups.rows[0]?.[0] ?? 0)
    if (groups > 0) {
      dupCount += groups
      issues.push({
        id: crypto.randomUUID(),
        source: 'data-quality',
        severity: 'high',
        type: 'duplicate_identifiers',
        table: `${schema}.${table}`,
        column,
        rowsAffected: groups,
        description: `${groups.toLocaleString()} ${column} value(s) on "${schema}"."${table}" are used by more than one row — likely a duplicate-entry / import bug.`,
        suggestedSql: `SELECT ${colExpr}, count(*) AS occurrences\nFROM ${qualified}\nGROUP BY ${colExpr}\nHAVING count(*) > 1\nORDER BY 2 DESC\nLIMIT 25;`,
        detectedAt: new Date().toISOString()
      })
    }
  }
  return dupCount
}

async function runIdentifierDuplicateChecksMysql(
  ctx: ScanContext,
  issues: Issue[]
): Promise<number> {
  ctx.reportTask('Looking for duplicate business identifiers…')
  const cols = await tryQuery(
    ctx,
    'List identifier-shaped columns',
    `
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
    `,
    issues,
    'data-quality'
  )
  let dupCount = 0
  for (const row of cols.rows) {
    if (ctx.signal.aborted) break
    const schema = String(row[0])
    const table = String(row[1])
    const column = String(row[2])
    if (!IDENTIFIER_PATTERN.test(column)) continue

    const qualified = `\`${schema}\`.\`${table}\``
    const colExpr = `\`${column}\``
    const dups = await tryQuery(
      ctx,
      `Find duplicate identifiers in ${schema}.${table}.${column}`,
      `SELECT count(*) FROM (
         SELECT ${colExpr}
         FROM ${qualified}
         WHERE ${colExpr} IS NOT NULL
         GROUP BY ${colExpr}
         HAVING count(*) > 1
       ) t`,
      issues,
      'data-quality',
      { failureSeverity: 'low' }
    )
    const groups = Number(dups.rows[0]?.[0] ?? 0)
    if (groups > 0) {
      dupCount += groups
      issues.push({
        id: crypto.randomUUID(),
        source: 'data-quality',
        severity: 'high',
        type: 'duplicate_identifiers',
        table: `${schema}.${table}`,
        column,
        rowsAffected: groups,
        description: `${groups.toLocaleString()} ${column} value(s) on \`${schema}\`.\`${table}\` are used by more than one row — likely a duplicate-entry / import bug.`,
        suggestedSql: `SELECT ${colExpr}, count(*) AS occurrences\nFROM ${qualified}\nGROUP BY ${colExpr}\nHAVING count(*) > 1\nORDER BY 2 DESC\nLIMIT 25;`,
        detectedAt: new Date().toISOString()
      })
    }
  }
  return dupCount
}
