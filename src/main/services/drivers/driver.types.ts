import type {
  ConnectionOptions,
  ConnectionTestResult,
  DatabaseEngine,
  SslMode
} from '@shared/types/connection'
import type { SchemaSnapshot } from '@shared/types/schema'
import type { BatchStatement, ExecuteBatchResult, QueryResultSet } from '@shared/types/query'
import type {
  TableChangeSet,
  TableDataPage,
  TableMutateResult
} from '@shared/types/table-data'

/** The minimal parameter set a driver needs to open a connection. */
export interface DriverConnectionParams {
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl: SslMode
  /** Engine-specific extras (SQL Server today; postgres/mysql ignore it). */
  options?: ConnectionOptions
}

export interface QueryExecuteOptions {
  /** Per-statement timeout in milliseconds; 0 disables it. */
  timeoutMs: number
}

export interface TableFetchParams {
  schema: string
  table: string
  limit: number
  offset: number
  orderBy: string | null
  orderDir: 'asc' | 'desc'
  /** Substring matched against every column cast to text. Empty = no filter. */
  search: string
}

/** Progress for an in-flight dump import (the caller adds the total size). */
export interface SqlImportProgressUpdate {
  bytesProcessed: number
  statementCount: number
}

export interface SqlImportOutcome {
  statementCount: number
  affectedRows: number
  /** Statements that errored and were skipped (the import continued past them). */
  failedCount: number
  /** A capped sample of error messages, for display. */
  errors: string[]
}

/**
 * The engine-agnostic contract every database backend implements. PostgreSQL
 * is the first implementation; adding MySQL/MSSQL later means writing a new
 * class against this interface — nothing upstream changes.
 */
export interface DatabaseDriver {
  readonly engine: DatabaseEngine

  /** Opens a throwaway connection to verify credentials; returns server info. */
  testConnection(params: DriverConnectionParams): Promise<ConnectionTestResult>

  /** Opens (or replaces) a pooled connection; resolves to the server version. */
  connect(connectionId: string, params: DriverConnectionParams): Promise<string>

  /** Closes a pooled connection if one is open; a no-op otherwise. */
  disconnect(connectionId: string): Promise<void>

  /** Runs a user SQL statement. The queryId lets an in-flight query be cancelled. */
  execute(
    connectionId: string,
    queryId: string,
    sql: string,
    options: QueryExecuteOptions
  ): Promise<QueryResultSet>

  /** Requests cancellation of an in-flight query; a no-op if it already finished. */
  cancel(connectionId: string, queryId: string): Promise<void>

  /** Runs a list of statements inside a single transaction (rolls back on error). */
  executeBatch(
    connectionId: string,
    statements: BatchStatement[]
  ): Promise<ExecuteBatchResult>

  /** Streams a .sql dump file into the database inside one transaction. */
  importSqlDump(
    connectionId: string,
    filePath: string,
    onProgress: (update: SqlImportProgressUpdate) => void,
    signal: AbortSignal
  ): Promise<SqlImportOutcome>

  /** Reads the database structure (schemas, tables, routines, triggers, indexes). */
  introspect(connectionId: string): Promise<SchemaSnapshot>

  /** Lists the databases available on the connected server. */
  listDatabases(connectionId: string): Promise<string[]>

  /** Creates a new database on the connected server. */
  createDatabase(connectionId: string, name: string): Promise<void>

  /** Fetches one page of a table's rows for the data viewer. */
  fetchTable(connectionId: string, params: TableFetchParams): Promise<TableDataPage>

  /** Applies staged row inserts/updates/deletes inside a transaction. */
  mutateTable(
    connectionId: string,
    schema: string,
    table: string,
    changes: TableChangeSet
  ): Promise<TableMutateResult>

  /** Runs EXPLAIN (planner estimates only — never executes the query). */
  explain(connectionId: string, sql: string): Promise<unknown>

  isConnected(connectionId: string): boolean

  /** The ids of every connection this driver currently has an open pool for. */
  activeConnectionIds(): string[]

  /** Closes every pool this driver owns — called on app quit. */
  dispose(): Promise<void>
}
