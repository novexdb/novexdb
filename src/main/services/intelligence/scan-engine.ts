import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { JsonStore } from '@main/utils/json-store'
import { IpcChannels } from '@shared/ipc-contract'
import { SchemaScanner } from '@main/services/intelligence/scanners/schema-scanner'
import { DataQualityScanner } from '@main/services/intelligence/scanners/data-quality-scanner'
import { PerformanceScanner } from '@main/services/intelligence/scanners/performance-scanner'
import { TransactionScanner } from '@main/services/intelligence/scanners/transaction-scanner'
import { deriveInsightsAndRecommendations } from '@main/services/intelligence/insight-deriver'
import { generateAiInsight } from '@main/services/intelligence/ai-insights'
import type { Scanner, ScanContext, ScannerOutput } from '@main/services/intelligence/scanner-types'
import type {
  HealthCategoryScore,
  HealthScore,
  Issue,
  ScanCancelPayload,
  ScanKind,
  ScanResult,
  ScanStartPayload,
  SummaryStats
} from '@shared/types/intelligence'

interface RunningScan {
  scanId: string
  connectionId: string
  kind: ScanKind
  startedAt: number
  controller: AbortController
}

interface HistoryStore {
  /** Newest-first stack per connection, capped at HISTORY_LIMIT. */
  byConnection: Record<string, ScanResult[]>
}

/** Cap retained scans per connection so the JSON file stays bounded. */
const HISTORY_LIMIT = 30

const ZERO_SUMMARY: SummaryStats = {
  totalTables: 0,
  totalRows: 0,
  databaseSizeBytes: 0,
  duplicateRecordsCount: 0,
  invalidRecordsCount: 0,
  missingForeignKeys: 0,
  missingIndexes: 0,
  activeRisks: 0
}

const PERFECT_SCORE: HealthCategoryScore = { score: 100, issueCount: 0 }
const ZERO_HEALTH: HealthScore = {
  overall: 100,
  schema: PERFECT_SCORE,
  dataQuality: PERFECT_SCORE,
  performance: PERFECT_SCORE,
  transactionSafety: PERFECT_SCORE,
  security: PERFECT_SCORE
}

/** Per-severity weight in the health-score deduction. */
const SEVERITY_WEIGHT: Record<Issue['severity'], number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
  info: 0
}

/**
 * The orchestrator that owns scan lifecycles. The single source of truth on the
 * main side: handles start / cancel, runs scanners, merges output, computes
 * the health score, persists the last result and broadcasts progress events.
 */
class ScanEngine {
  private readonly scanners: Record<Exclude<ScanKind, 'full'>, Scanner> = {
    schema: new SchemaScanner(),
    'data-quality': new DataQualityScanner(),
    transaction: new TransactionScanner(),
    performance: new PerformanceScanner()
  }
  private readonly running = new Map<string, RunningScan>()
  private readonly historyStore = new JsonStore<HistoryStore>(
    'intelligence-history.json',
    { byConnection: {} }
  )

  /** Snapshot of the last completed scan for a connection — null if none yet. */
  async latest(connectionId: string): Promise<ScanResult | null> {
    const series = await this.historyFor(connectionId)
    return series[0] ?? null
  }

  /** Full per-connection history (newest first) — drives the trend charts. */
  async history(connectionId: string): Promise<ScanResult[]> {
    return this.historyFor(connectionId)
  }

  /** Latest result per connection, across every connection. */
  async list(): Promise<ScanResult[]> {
    const store = await this.historyStore.read()
    const out: ScanResult[] = []
    for (const series of Object.values(store.byConnection)) {
      const latest = Array.isArray(series) ? series[0] : (series as ScanResult)
      if (latest) out.push(latest)
    }
    return out
  }

  /** Tolerate the legacy single-object shape from before HISTORY_LIMIT was added. */
  private async historyFor(connectionId: string): Promise<ScanResult[]> {
    const store = await this.historyStore.read()
    const raw = store.byConnection[connectionId]
    if (Array.isArray(raw)) return raw
    if (raw && typeof raw === 'object') return [raw as ScanResult]
    return []
  }

  cancel(payload: ScanCancelPayload): void {
    const scan = this.running.get(payload.scanId)
    if (scan) scan.controller.abort()
  }

  async start(payload: ScanStartPayload): Promise<{ scanId: string }> {
    const scanId = randomUUID()
    const controller = new AbortController()
    const startedAt = Date.now()
    this.running.set(scanId, {
      scanId,
      connectionId: payload.connectionId,
      kind: payload.kind,
      startedAt,
      controller
    })

    // Kick off the work; the renderer is awakened by progress/done events.
    void this.execute(scanId, payload, controller.signal)
    return { scanId }
  }

  private async execute(
    scanId: string,
    payload: ScanStartPayload,
    signal: AbortSignal
  ): Promise<void> {
    const startedAtMs = Date.now()
    const startedAt = new Date(startedAtMs).toISOString()

    const scanners = this.scannersFor(payload.kind)
    this.broadcast(IpcChannels.intelligenceScanProgress, {
      scanId,
      status: 'running',
      progress: 0,
      currentTask: `Preparing ${payload.kind} scan…`,
      elapsedMs: 0
    })

    const merged: ScannerOutput = { issues: [], summary: {}, tableSizes: [] }
    let abortedEarly = false

    for (let index = 0; index < scanners.length; index += 1) {
      const scanner = scanners[index]
      if (signal.aborted) {
        abortedEarly = true
        break
      }
      const ctx: ScanContext = {
        scanId,
        connectionId: payload.connectionId,
        signal,
        reportTask: (label) =>
          this.broadcast(IpcChannels.intelligenceScanProgress, {
            scanId,
            connectionId: payload.connectionId,
            status: 'running',
            progress: (index + 0.5) / scanners.length,
            currentTask: label,
            elapsedMs: Date.now() - startedAtMs
          })
      }
      ctx.reportTask(`${scanner.label}…`)

      try {
        const out = await scanner.run(ctx)
        merged.issues.push(...out.issues)
        merged.summary = { ...merged.summary, ...out.summary }
        if (out.tableSizes) merged.tableSizes = out.tableSizes
      } catch (err) {
        // A single scanner's failure shouldn't poison the whole run — surface
        // it as a high-severity issue so the user sees the cause in the table.
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[scan-engine] ${scanner.label} failed:`, err)
        merged.issues.push({
          id: randomUUID(),
          source: scanner.kind,
          severity: 'critical',
          type: 'scanner_failure',
          table: null,
          description: `${scanner.label} failed: ${message}`,
          detectedAt: new Date().toISOString()
        })
      }

      this.broadcast(IpcChannels.intelligenceScanProgress, {
        scanId,
        connectionId: payload.connectionId,
        status: 'running',
        progress: (index + 1) / scanners.length,
        currentTask: `${scanner.label} complete`,
        elapsedMs: Date.now() - startedAtMs
      })
    }

    this.running.delete(scanId)

    if (abortedEarly) {
      this.broadcast(IpcChannels.intelligenceScanError, {
        scanId,
        connectionId: payload.connectionId,
        status: 'cancelled',
        message: 'Scan cancelled'
      })
      return
    }

    // After scanners — try the AI insight generator. Failure is silent and
    // the mechanical insights stay in place.
    this.broadcast(IpcChannels.intelligenceScanProgress, {
      scanId,
      connectionId: payload.connectionId,
      status: 'running',
      progress: 0.95,
      currentTask: 'Generating AI insights…',
      elapsedMs: Date.now() - startedAtMs
    })
    const aiInsight = await generateAiInsight(payload.connectionId, merged.issues, signal)

    const finishedAtMs = Date.now()
    const result = this.assemble(scanId, payload, startedAt, startedAtMs, finishedAtMs, merged)
    if (aiInsight) {
      // Show the AI summary at the top of the insights list.
      result.insights = [aiInsight, ...result.insights]
    }
    try {
      await this.persist(result)
    } catch (err) {
      console.error('[scan-engine] persist failed:', err)
    }
    this.broadcast(IpcChannels.intelligenceScanDone, result)
  }

  private scannersFor(kind: ScanKind): Scanner[] {
    if (kind === 'full') return Object.values(this.scanners)
    return [this.scanners[kind]]
  }

  private assemble(
    scanId: string,
    payload: ScanStartPayload,
    startedAt: string,
    startedAtMs: number,
    finishedAtMs: number,
    merged: ScannerOutput
  ): ScanResult {
    const summary: SummaryStats = {
      ...ZERO_SUMMARY,
      ...merged.summary,
      activeRisks: merged.issues.filter((i) => i.severity !== 'info').length
    }
    const health = computeHealth(merged.issues)
    const { insights, recommendations } = deriveInsightsAndRecommendations(merged.issues)
    return {
      scanId,
      connectionId: payload.connectionId,
      kind: payload.kind,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      status: 'success',
      summary,
      health,
      issues: merged.issues,
      insights,
      recommendations,
      tableSizes: merged.tableSizes ?? []
    }
  }

  private async persist(result: ScanResult): Promise<void> {
    const store = await this.historyStore.read()
    const previous = await this.historyFor(result.connectionId)
    store.byConnection[result.connectionId] = [result, ...previous].slice(0, HISTORY_LIMIT)
    await this.historyStore.write(store)
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload)
    }
  }
}

/** Map issues → per-category and overall health scores. */
function computeHealth(issues: Issue[]): HealthScore {
  // Each source contributes to exactly one category. Issues with unknown
  // sources fall through to the schema bucket so they're still counted.
  const buckets: Record<keyof Omit<HealthScore, 'overall'>, Issue[]> = {
    schema: [],
    dataQuality: [],
    performance: [],
    transactionSafety: [],
    security: []
  }
  for (const issue of issues) {
    if (issue.source === 'data-quality') buckets.dataQuality.push(issue)
    else if (issue.source === 'transaction') buckets.transactionSafety.push(issue)
    else if (issue.source === 'performance') buckets.performance.push(issue)
    else buckets.schema.push(issue)
  }
  const score = (group: Issue[]): HealthCategoryScore => {
    const deduction = group.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0)
    return { score: Math.max(0, 100 - deduction), issueCount: group.length }
  }
  const schema = score(buckets.schema)
  const dataQuality = score(buckets.dataQuality)
  const performance = score(buckets.performance)
  const transactionSafety = score(buckets.transactionSafety)
  const security = score(buckets.security)
  // Equal weighting for now — easy to swap to a weighted average later.
  const overall = Math.round(
    (schema.score + dataQuality.score + performance.score + transactionSafety.score + security.score) /
      5
  )
  return { overall, schema, dataQuality, performance, transactionSafety, security }
}

export const scanEngine = new ScanEngine()
export { ZERO_HEALTH, ZERO_SUMMARY }
