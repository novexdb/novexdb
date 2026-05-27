/**
 * Shared types for the AI Database Intelligence dashboard.
 *
 * The dashboard is engine-agnostic — every shape here is defined in terms
 * of the existing `DatabaseEngine` union and crosses the main/renderer
 * boundary unchanged.
 */

/** The kinds of scan a user can run from the dashboard. */
export type ScanKind =
  | 'full'
  | 'schema'
  | 'data-quality'
  | 'transaction'
  | 'performance'

/** Lifecycle of an active scan, as reported to the renderer. */
export type ScanStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'

/** Severity buckets — drive the colour + sort order of issues + insights. */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/** A single finding produced by a scanner. */
export interface Issue {
  /** Stable id — newly generated per scan run. */
  id: string
  /** Which scanner emitted this finding. */
  source: ScanKind
  severity: Severity
  /** A short category, e.g. `'missing_index'`, `'duplicate_rows'`. */
  type: string
  /** Schema-qualified table, or `null` for cross-table issues. */
  table: string | null
  /** Optional column name when the issue is column-scoped. */
  column?: string
  /** Short, human-readable description of the issue. */
  description: string
  /** Rows affected, when known. */
  rowsAffected?: number
  /** A suggested fix as a SQL snippet — surfaced in the Recommendations panel. */
  suggestedSql?: string
  /** ISO timestamp of detection. */
  detectedAt: string
}

/** A free-form AI-generated observation. */
export interface AiInsight {
  id: string
  severity: Severity
  title: string
  /** Markdown body — the panel renders it with the existing Markdown component. */
  body: string
  detectedAt: string
}

/** An actionable recommendation surfaced separately from the raw issues table. */
export interface Recommendation {
  id: string
  severity: Severity
  title: string
  rationale: string
  sql: string
  /** Source issue id, when this recommendation is derived from one. */
  sourceIssueId?: string
}

/** One slice of the health-score breakdown. */
export interface HealthCategoryScore {
  /** 0–100 inclusive. */
  score: number
  /** Number of issues that fed into the score, for the side panel. */
  issueCount: number
}

/** Composite database-health rollup. */
export interface HealthScore {
  /** Weighted average of the categories below, 0–100. */
  overall: number
  schema: HealthCategoryScore
  dataQuality: HealthCategoryScore
  performance: HealthCategoryScore
  transactionSafety: HealthCategoryScore
  security: HealthCategoryScore
}

/** Top-of-dashboard summary metrics — populated by the schema/data scanners. */
export interface SummaryStats {
  totalTables: number
  totalRows: number
  databaseSizeBytes: number
  duplicateRecordsCount: number
  invalidRecordsCount: number
  missingForeignKeys: number
  missingIndexes: number
  activeRisks: number
}

/** Per-table size + row data for the Table Size Distribution chart. */
export interface TableSizeStats {
  schema: string
  table: string
  rowEstimate: number
  bytes: number
}

/** Progress event broadcast while a scan is running. */
export interface ScanProgress {
  /** The id of the scan run, so the renderer can correlate events. */
  scanId: string
  /** Connection the scan belongs to — carried in every event so the renderer
   *  never has to look it up (races with optimistic store updates). */
  connectionId: string
  status: ScanStatus
  /** 0–1 fractional completion. */
  progress: number
  /** Free-form label for the current task ("Inspecting public.invoices…"). */
  currentTask: string
  /** Wall-clock ms since the scan started. */
  elapsedMs: number
}

/** The full result of a finished scan — broadcast on completion and persisted. */
export interface ScanResult {
  scanId: string
  connectionId: string
  kind: ScanKind
  startedAt: string
  finishedAt: string
  durationMs: number
  status: Exclude<ScanStatus, 'idle' | 'running'>
  /** Populated when status === 'error'. */
  errorMessage?: string
  summary: SummaryStats
  health: HealthScore
  issues: Issue[]
  insights: AiInsight[]
  recommendations: Recommendation[]
  tableSizes: TableSizeStats[]
}

/** Argument to `intel:scan:start`. */
export interface ScanStartPayload {
  connectionId: string
  kind: ScanKind
}

/** Argument to `intel:scan:cancel`. */
export interface ScanCancelPayload {
  scanId: string
}
