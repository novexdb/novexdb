export interface QueryColumn {
  name: string
  dataTypeId: number
}

/** The outcome of running one SQL statement. Rows are row-major arrays. */
export interface QueryResultSet {
  columns: QueryColumn[]
  rows: unknown[][]
  /** Rows returned to the renderer (after the MAX_RESULT_ROWS cap). */
  rowCount: number
  /** Rows affected, for INSERT/UPDATE/DELETE. */
  affectedRows: number
  /** The SQL command tag, e.g. SELECT / INSERT / UPDATE. */
  command: string
  durationMs: number
  /** True when the result was capped at MAX_RESULT_ROWS. */
  truncated: boolean
}

export interface ExecuteQueryPayload {
  connectionId: string
  queryId: string
  sql: string
}

export interface CancelQueryPayload {
  connectionId: string
  queryId: string
}

export interface FileExportPayload {
  defaultName: string
  content: string
}

export interface FileExportResult {
  saved: boolean
  path?: string
}

/** Reads a CSV/JSON/SQL file the user picks via a native open dialog. */
export interface FileOpenPayload {
  format: 'csv' | 'json' | 'sql'
}

export interface FileOpenResult {
  canceled: boolean
  /** The picked file's base name (present only when not canceled). */
  name?: string
  /** The file's UTF-8 contents (present only when not canceled). */
  content?: string
}

/** One parameterized statement in a transactional batch. */
export interface BatchStatement {
  sql: string
  params?: unknown[]
}

/** Runs a list of statements inside a single BEGIN/COMMIT (rolls back on error). */
export interface ExecuteBatchPayload {
  connectionId: string
  statements: BatchStatement[]
}

export interface ExecuteBatchResult {
  statementCount: number
  /** Total rows affected across every statement. */
  affectedRows: number
  durationMs: number
}

/** Hard cap on the rows one result set delivers to the renderer. */
export const MAX_RESULT_ROWS = 10_000

/** How a picked dump file is encoded. */
export type SqlImportKind = 'plain' | 'gzip' | 'archive'

/** Result of picking a .sql dump — a path, never the file's contents. */
export interface SqlImportPickResult {
  canceled: boolean
  /** Absolute path to the picked file (present only when not canceled). */
  path?: string
  name?: string
  /** File size in bytes. */
  size?: number
  /** The first few KB of the file, for an at-a-glance preview. */
  preview?: string
  /** Plain SQL, gzip-compressed SQL, or a binary pg_dump archive. */
  kind?: SqlImportKind
}

/** Starts a streaming import of a .sql dump file. */
export interface SqlImportStartPayload {
  importId: string
  connectionId: string
  path: string
}

/** Throttled progress for an in-flight dump import. */
export interface SqlImportProgress {
  importId: string
  bytesProcessed: number
  totalBytes: number
  statementCount: number
}

/** Terminal success (or cancellation) of a dump import. */
export interface SqlImportDone {
  importId: string
  statementCount: number
  affectedRows: number
  /** Statements that errored and were skipped (the import continued past them). */
  failedCount: number
  /** A capped sample of the errors encountered, for display. */
  errors: string[]
  durationMs: number
  /** True when the user cancelled — already-applied statements remain. */
  cancelled: boolean
}

export interface SqlImportFailure {
  importId: string
  error: string
}

export interface SqlImportCancelPayload {
  importId: string
}
