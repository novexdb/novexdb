import { connectionManager } from '@main/services/connection-manager'
import type { Issue, Severity } from '@shared/types/intelligence'
import type { Scanner, ScannerOutput, ScanContext } from '@main/services/intelligence/scanner-types'
import { issueFactory, tryQuery } from '@main/services/intelligence/scanners/scanner-utils'

const issue = issueFactory('performance')

/** Cap how many slow queries we surface — newest dashboards are noisy enough. */
const SLOW_QUERY_LIMIT = 15

/**
 * Slow-query inspector. Reads `pg_stat_statements` on PostgreSQL and the
 * `performance_schema` digest table on MySQL. Either source may be disabled
 * on the server — the scanner surfaces a `tracking_unavailable` info-level
 * issue in that case instead of crashing.
 */
export class PerformanceScanner implements Scanner {
  readonly kind = 'performance' as const
  readonly label = 'Performance scan'

  async run(ctx: ScanContext): Promise<ScannerOutput> {
    const engine = await connectionManager.getEngine(ctx.connectionId)
    if (engine === 'postgres') return runPostgres(ctx)
    if (engine === 'mysql') return runMysql(ctx)
    throw new Error(`Performance scan is not yet supported for engine "${engine}".`)
  }
}

/** Decide severity from mean execution time (ms). */
function severityFor(meanMs: number): Severity {
  if (meanMs > 5_000) return 'critical'
  if (meanMs > 1_000) return 'high'
  if (meanMs > 250) return 'medium'
  return 'low'
}

function shorten(sql: string, max = 240): string {
  const flat = sql.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

// ────────────────────────────────────────────────────────────── PostgreSQL ──

async function runPostgres(ctx: ScanContext): Promise<ScannerOutput> {
  const issues: Issue[] = []

  // First — is the extension installed at all? Probe with a fault-tolerant
  // SELECT that will throw if pg_stat_statements isn't reachable.
  ctx.reportTask('Looking for pg_stat_statements…')
  const probe = await connectionManager
    .runScanQuery(
      ctx.connectionId,
      `SELECT extname FROM pg_extension WHERE extname = 'pg_stat_statements'`
    )
    .catch(() => null)

  if (!probe || probe.rows.length === 0) {
    issues.push(
      issue({
        severity: 'info',
        type: 'tracking_unavailable',
        table: null,
        description:
          'pg_stat_statements is not installed — enable it to surface slow queries here.',
        suggestedSql: `-- As a superuser:\nCREATE EXTENSION pg_stat_statements;\n-- Then add to postgresql.conf:\n--   shared_preload_libraries = 'pg_stat_statements'\n-- and restart the server.`
      })
    )
    return { issues }
  }

  ctx.reportTask('Collecting slow queries…')
  const slow = await tryQuery(
    ctx,
    'Read pg_stat_statements',
    `
      SELECT query,
             calls,
             total_exec_time AS total_ms,
             mean_exec_time AS mean_ms,
             rows
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
        AND query NOT LIKE 'EXPLAIN%'
      ORDER BY mean_exec_time DESC
      LIMIT ${SLOW_QUERY_LIMIT}
    `,
    issues,
    'performance'
  )
  ctx.signal.throwIfAborted()

  for (const row of slow.rows) {
    const query = shorten(String(row[0] ?? ''))
    const calls = Number(row[1] ?? 0)
    const meanMs = Number(row[3] ?? 0)
    if (meanMs < 100) continue // Skip noise.
    issues.push(
      issue({
        severity: severityFor(meanMs),
        type: 'slow_query',
        table: null,
        rowsAffected: calls,
        description: `Mean execution ${meanMs.toFixed(1)} ms across ${calls.toLocaleString()} calls — ${query}`,
        suggestedSql: `EXPLAIN ANALYZE ${row[0] as string};`
      })
    )
  }

  return { issues }
}

// ─────────────────────────────────────────────────────────────────── MySQL ──

async function runMysql(ctx: ScanContext): Promise<ScannerOutput> {
  const issues: Issue[] = []

  ctx.reportTask('Probing performance_schema…')
  const probe = await connectionManager
    .runScanQuery(
      ctx.connectionId,
      `SELECT @@performance_schema AS enabled`
    )
    .catch(() => null)
  if (!probe || Number(probe.rows[0]?.[0] ?? 0) === 0) {
    issues.push(
      issue({
        severity: 'info',
        type: 'tracking_unavailable',
        table: null,
        description:
          'performance_schema is disabled — enable it to surface slow queries here.',
        suggestedSql: `-- Add to my.cnf and restart the server:\n[mysqld]\nperformance_schema = ON`
      })
    )
    return { issues }
  }

  ctx.reportTask('Collecting slow queries…')
  const slow = await tryQuery(
    ctx,
    'Read events_statements_summary_by_digest',
    `
      SELECT digest_text,
             count_star AS calls,
             sum_timer_wait / 1000000 AS total_ms,
             avg_timer_wait / 1000000 AS mean_ms,
             sum_rows_examined AS rows_examined
      FROM performance_schema.events_statements_summary_by_digest
      WHERE digest_text IS NOT NULL
        AND digest_text NOT LIKE 'EXPLAIN%'
        AND digest_text NOT LIKE 'SELECT @@%'
      ORDER BY avg_timer_wait DESC
      LIMIT ${SLOW_QUERY_LIMIT}
    `,
    issues,
    'performance'
  )
  ctx.signal.throwIfAborted()

  for (const row of slow.rows) {
    const query = shorten(String(row[0] ?? ''))
    const calls = Number(row[1] ?? 0)
    const meanMs = Number(row[3] ?? 0) / 1_000 // mean is in microseconds.
    if (meanMs < 100) continue
    issues.push(
      issue({
        severity: severityFor(meanMs),
        type: 'slow_query',
        table: null,
        rowsAffected: calls,
        description: `Mean execution ${meanMs.toFixed(1)} ms across ${calls.toLocaleString()} calls — ${query}`,
        suggestedSql: `EXPLAIN ${row[0] as string};`
      })
    )
  }

  return { issues }
}
