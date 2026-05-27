import type { Issue, ScanKind, SummaryStats, TableSizeStats } from '@shared/types/intelligence'

/**
 * Anything the scan engine cares about producing. Each scanner runs to
 * completion and hands back the same partial shape; the engine merges all
 * scanners into one `ScanResult`.
 */
export interface ScannerOutput {
  /** Issues emitted by this scanner. */
  issues: Issue[]
  /** Partial summary fields the scanner is authoritative for. */
  summary?: Partial<SummaryStats>
  /** Per-table sizing; only the schema scanner currently populates this. */
  tableSizes?: TableSizeStats[]
}

/** Implemented per scan kind. */
export interface Scanner {
  /** Matches the ScanKind it implements. */
  readonly kind: Exclude<ScanKind, 'full'>
  /** Short label shown in the progress bar — `"Schema scan"` etc. */
  readonly label: string
  /** Run against a live, already-open connection. */
  run(ctx: ScanContext): Promise<ScannerOutput>
}

/** Carried through every scanner — pool access + cancellation + progress. */
export interface ScanContext {
  scanId: string
  connectionId: string
  /** Aborted by the engine when the user cancels the scan. */
  signal: AbortSignal
  /** Push an in-flight "current task" update — caller throttles. */
  reportTask(label: string): void
}
