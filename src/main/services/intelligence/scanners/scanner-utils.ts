import { randomUUID } from 'node:crypto'
import { connectionManager } from '@main/services/connection-manager'
import type { Issue, ScanKind, Severity } from '@shared/types/intelligence'
import type { ScanContext } from '@main/services/intelligence/scanner-types'

/** Factory for engine-agnostic Issues that all share a source + timestamp. */
export function issueFactory(source: ScanKind) {
  return (
    partial: Omit<Issue, 'id' | 'source' | 'detectedAt'>
  ): Issue => ({
    id: randomUUID(),
    source,
    detectedAt: new Date().toISOString(),
    ...partial
  })
}

interface TryQueryOptions {
  /** Severity for the surfaced `scanner_query_failure` issue. */
  failureSeverity?: Severity
}

/**
 * Run one scan query with built-in fault tolerance — on failure, push a
 * `scanner_query_failure` issue (carrying the offending SQL) and return
 * empty rows so the caller can continue with the next step.
 */
export async function tryQuery(
  ctx: ScanContext,
  step: string,
  sql: string,
  bag: Issue[],
  source: ScanKind,
  options: TryQueryOptions = {}
): Promise<{ rows: unknown[][] }> {
  try {
    const result = await connectionManager.runScanQuery(ctx.connectionId, sql)
    return { rows: result.rows }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[scanner:${source}] "${step}" failed:`, err)
    bag.push(
      issueFactory(source)({
        severity: options.failureSeverity ?? 'medium',
        type: 'scanner_query_failure',
        table: null,
        description: `${step} failed: ${message}`,
        suggestedSql: sql.trim()
      })
    )
    return { rows: [] }
  }
}
