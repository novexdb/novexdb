import { connectionStore } from '@main/services/connection-store'
import { settingsStore } from '@main/services/settings-store'
import { queryHistoryStore } from '@main/services/query-history-store'
import { PostgresDriver } from '@main/services/drivers/postgres-driver'
import { MysqlDriver } from '@main/services/drivers/mysql-driver'
import { MssqlDriver } from '@main/services/drivers/mssql-driver'
import { runPgDumpSchema, runPgRestore } from '@main/services/drivers/pg-restore'
import type {
  DatabaseDriver,
  DriverConnectionParams,
  SqlImportOutcome,
  SqlImportProgressUpdate
} from '@main/services/drivers/driver.types'
import type {
  Connection,
  ConnectionInput,
  ConnectionTestResult,
  DatabaseEngine
} from '@shared/types/connection'
import type { ActiveConnectionInfo } from '@shared/types/database'
import type { SchemaSnapshot } from '@shared/types/schema'
import type { BatchStatement, ExecuteBatchResult, QueryResultSet } from '@shared/types/query'
import type {
  TableDataPage,
  TableFetchPayload,
  TableMutatePayload,
  TableMutateResult
} from '@shared/types/table-data'

function toDriverParams(source: Connection | ConnectionInput, password: string): DriverConnectionParams {
  return {
    host: source.host,
    port: source.port,
    database: source.database,
    username: source.username,
    password,
    ssl: source.ssl,
    options: source.options
  }
}

/**
 * The single orchestration point for live database connections. It resolves the
 * right driver per engine, hydrates credentials from the encrypted store, and
 * owns the lifecycle of every open pool.
 */
class ConnectionManager {
  private readonly drivers: Record<DatabaseEngine, DatabaseDriver | undefined> = {
    postgres: new PostgresDriver(),
    mysql: new MysqlDriver(),
    mssql: new MssqlDriver()
  }

  private driverFor(engine: DatabaseEngine): DatabaseDriver {
    const driver = this.drivers[engine]
    if (!driver) throw new Error(`The "${engine}" engine is not supported yet`)
    return driver
  }

  /** Verifies credentials supplied in a form, before the connection is saved. */
  test(input: ConnectionInput): Promise<ConnectionTestResult> {
    return this.driverFor(input.engine).testConnection(toDriverParams(input, input.password))
  }

  /** Opens a pooled connection for a saved connection id. */
  async connect(connectionId: string): Promise<ActiveConnectionInfo> {
    const record = await connectionStore.getRecord(connectionId)
    const password = await connectionStore.getPassword(connectionId)
    const serverVersion = await this.driverFor(record.engine).connect(
      connectionId,
      toDriverParams(record, password)
    )
    return {
      connectionId,
      serverVersion,
      connectedAt: new Date().toISOString()
    }
  }

  /** Reads the structure of an open connection's database. */
  async introspect(connectionId: string): Promise<SchemaSnapshot> {
    const record = await connectionStore.getRecord(connectionId)
    return this.driverFor(record.engine).introspect(connectionId)
  }

  /** Lists every database on the connected server. */
  async listDatabases(connectionId: string): Promise<string[]> {
    const record = await connectionStore.getRecord(connectionId)
    return this.driverFor(record.engine).listDatabases(connectionId)
  }

  /** Creates a new database on the connected server. */
  async createDatabase(connectionId: string, name: string): Promise<void> {
    const record = await connectionStore.getRecord(connectionId)
    await this.driverFor(record.engine).createDatabase(connectionId, name)
  }

  /**
   * Switches a connection to a different database. PostgreSQL cannot re-target a
   * live connection, so this persists the new database and re-opens the pool.
   */
  async switchDatabase(connectionId: string, database: string): Promise<Connection> {
    const connection = await connectionStore.update({
      id: connectionId,
      changes: { database }
    })
    await this.connect(connectionId)
    return connection
  }

  /** Runs a user query, applying the configured timeout and recording history. */
  async execute(
    connectionId: string,
    queryId: string,
    sql: string
  ): Promise<QueryResultSet> {
    const record = await connectionStore.getRecord(connectionId)
    const settings = await settingsStore.get()
    const executedAt = new Date().toISOString()
    try {
      const result = await this.driverFor(record.engine).execute(connectionId, queryId, sql, {
        timeoutMs: settings.queryTimeoutMs
      })
      await queryHistoryStore.add({
        connectionId,
        connectionName: record.name,
        sql,
        status: 'success',
        rowCount: result.rowCount,
        durationMs: result.durationMs,
        executedAt
      })
      return result
    } catch (err) {
      await queryHistoryStore.add({
        connectionId,
        connectionName: record.name,
        sql,
        status: 'error',
        rowCount: 0,
        durationMs: 0,
        executedAt,
        errorMessage: err instanceof Error ? err.message : String(err)
      })
      throw err
    }
  }

  /** Engine of the connection — useful for internal tooling that branches per engine. */
  async getEngine(connectionId: string): Promise<DatabaseEngine> {
    const record = await connectionStore.getRecord(connectionId)
    return record.engine
  }

  /**
   * Runs a read-only query on behalf of an internal scanner / inspector — same
   * timeout policy as `execute`, but never written to query history.
   */
  async runScanQuery(connectionId: string, sql: string): Promise<QueryResultSet> {
    const record = await connectionStore.getRecord(connectionId)
    const settings = await settingsStore.get()
    return this.driverFor(record.engine).execute(
      connectionId,
      `scan-${crypto.randomUUID()}`,
      sql,
      { timeoutMs: settings.queryTimeoutMs }
    )
  }

  /**
   * Runs a list of statements in one transaction. Used for DDL and bulk inserts;
   * unlike `execute` it is not recorded in query history.
   */
  async executeStatements(
    connectionId: string,
    statements: BatchStatement[]
  ): Promise<ExecuteBatchResult> {
    const record = await connectionStore.getRecord(connectionId)
    return this.driverFor(record.engine).executeBatch(connectionId, statements)
  }

  /** Streams a .sql dump file into the database inside one transaction. */
  async importSqlDump(
    connectionId: string,
    filePath: string,
    onProgress: (update: SqlImportProgressUpdate) => void,
    signal: AbortSignal
  ): Promise<SqlImportOutcome> {
    const record = await connectionStore.getRecord(connectionId)
    return this.driverFor(record.engine).importSqlDump(
      connectionId,
      filePath,
      onProgress,
      signal
    )
  }

  /**
   * Returns the `CREATE TABLE` / `CREATE VIEW` DDL for a relation. PostgreSQL
   * shells out to `pg_dump --schema-only -t`; MySQL uses `SHOW CREATE TABLE`.
   */
  async scriptCreateTable(
    connectionId: string,
    schema: string,
    table: string
  ): Promise<string> {
    const record = await connectionStore.getRecord(connectionId)
    if (record.engine === 'postgres') {
      const password = await connectionStore.getPassword(connectionId)
      return runPgDumpSchema(toDriverParams(record, password), schema, table)
    }
    if (record.engine === 'mysql') {
      const driver = this.drivers.mysql
      if (!(driver instanceof MysqlDriver)) {
        throw new Error('MySQL driver is not registered')
      }
      return driver.scriptCreateTable(connectionId, schema, table)
    }
    throw new Error(`Copy Creation SQL is not supported for "${record.engine}" yet`)
  }

  /** Restores a binary pg_dump archive (.dump / .tar) by running pg_restore. */
  async restoreArchive(
    connectionId: string,
    filePath: string,
    onProgress: (update: SqlImportProgressUpdate) => void,
    signal: AbortSignal
  ): Promise<SqlImportOutcome> {
    const record = await connectionStore.getRecord(connectionId)
    if (record.engine !== 'postgres') {
      throw new Error('pg_dump archives can only be restored to a PostgreSQL connection.')
    }
    const password = await connectionStore.getPassword(connectionId)
    return runPgRestore(toDriverParams(record, password), filePath, onProgress, signal)
  }

  /** Requests cancellation of an in-flight query. */
  async cancelQuery(connectionId: string, queryId: string): Promise<void> {
    const record = await connectionStore.getRecord(connectionId)
    await this.driverFor(record.engine).cancel(connectionId, queryId)
  }

  /** Fetches one page of a table's data. */
  async fetchTable(payload: TableFetchPayload): Promise<TableDataPage> {
    const record = await connectionStore.getRecord(payload.connectionId)
    return this.driverFor(record.engine).fetchTable(payload.connectionId, {
      schema: payload.schema,
      table: payload.table,
      limit: payload.limit,
      offset: payload.offset,
      orderBy: payload.orderBy,
      orderDir: payload.orderDir,
      search: payload.search
    })
  }

  /** Applies staged table edits inside a transaction. */
  async mutateTable(payload: TableMutatePayload): Promise<TableMutateResult> {
    const record = await connectionStore.getRecord(payload.connectionId)
    return this.driverFor(record.engine).mutateTable(
      payload.connectionId,
      payload.schema,
      payload.table,
      payload.changes
    )
  }

  /** Runs EXPLAIN for a query (used by the AI optimizer; never executes it). */
  async explain(connectionId: string, sql: string): Promise<unknown> {
    const record = await connectionStore.getRecord(connectionId)
    return this.driverFor(record.engine).explain(connectionId, sql)
  }

  /** Every connection that has a live pool open right now, across all drivers. */
  activeConnectionIds(): string[] {
    return Object.values(this.drivers).flatMap((driver) =>
      driver ? driver.activeConnectionIds() : []
    )
  }

  /** Closes a pooled connection. Safe to call on an already-closed connection. */
  async disconnect(connectionId: string): Promise<void> {
    await Promise.allSettled(
      Object.values(this.drivers).map((driver) => driver?.disconnect(connectionId))
    )
  }

  /** Closes every open pool — invoked when the app is quitting. */
  async disposeAll(): Promise<void> {
    await Promise.allSettled(Object.values(this.drivers).map((driver) => driver?.dispose()))
  }
}

export const connectionManager = new ConnectionManager()
