import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectionStore } from '@main/services/connection-store'
import { settingsStore } from '@main/services/settings-store'
import { queryHistoryStore } from '@main/services/query-history-store'
import { PostgresDriver } from '@main/services/drivers/postgres-driver'
import { MysqlDriver } from '@main/services/drivers/mysql-driver'
import { MssqlDriver } from '@main/services/drivers/mssql-driver'
import { runPgDumpSchema, runPgRestore } from '@main/services/drivers/pg-restore'
import { runPgDump } from '@main/services/drivers/pg-dump'
import { runMysqldump } from '@main/services/drivers/mysqldump'
import { sshTunnelManager } from '@main/services/ssh/ssh-tunnel-manager'
import type { SshTunnelConfig } from '@main/services/ssh/ssh-tunnel'
import type {
  DatabaseDriver,
  DriverConnectionParams,
  ExportOptions,
  ExportOutcome,
  ExportProgressUpdate,
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

/**
 * Builds driver params. When an SSH tunnel is active, `endpoint` carries its
 * local 127.0.0.1:<port> so the driver dials the tunnel instead of the remote
 * host/port (which is the address as seen *from the bastion*).
 */
function toDriverParams(
  source: Connection | ConnectionInput,
  password: string,
  endpoint?: { host: string; port: number }
): DriverConnectionParams {
  return {
    host: endpoint?.host ?? source.host,
    port: endpoint?.port ?? source.port,
    database: source.database,
    username: source.username,
    password,
    ssl: source.ssl,
    options: source.options
  }
}

/** SSH tunnel config from a record/input + decrypted secrets, or null when off. */
function toTunnelConfig(
  source: Connection | ConnectionInput,
  secrets: { password?: string; passphrase?: string }
): SshTunnelConfig | null {
  const ssh = source.ssh
  if (!ssh?.enabled) return null
  return {
    sshHost: ssh.host,
    sshPort: ssh.port,
    sshUsername: ssh.username,
    auth:
      ssh.authMethod === 'password'
        ? { method: 'password', password: secrets.password ?? '' }
        : {
            method: 'privateKey',
            privateKeyPath: ssh.privateKeyPath ?? '',
            passphrase: secrets.passphrase
          },
    destHost: source.host,
    destPort: source.port
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
  async test(input: ConnectionInput): Promise<ConnectionTestResult> {
    const cfg = toTunnelConfig(input, {
      password: input.ssh?.password,
      passphrase: input.ssh?.passphrase
    })
    if (!cfg) {
      return this.driverFor(input.engine).testConnection(toDriverParams(input, input.password))
    }
    // Stand up a throwaway tunnel just for the probe, and always tear it down.
    const tunnel = await sshTunnelManager.openEphemeral(cfg)
    try {
      return await this.driverFor(input.engine).testConnection(
        toDriverParams(input, input.password, { host: tunnel.localHost, port: tunnel.localPort })
      )
    } finally {
      await tunnel.close()
    }
  }

  /** Opens a pooled connection for a saved connection id. */
  async connect(connectionId: string): Promise<ActiveConnectionInfo> {
    const record = await connectionStore.getRecord(connectionId)
    const password = await connectionStore.getPassword(connectionId)
    const cfg = toTunnelConfig(record, await connectionStore.getSshSecrets(connectionId))

    let endpoint: { host: string; port: number } | undefined
    if (cfg) {
      const tunnel = await sshTunnelManager.open(connectionId, cfg)
      endpoint = { host: tunnel.localHost, port: tunnel.localPort }
    }
    try {
      const serverVersion = await this.driverFor(record.engine).connect(
        connectionId,
        toDriverParams(record, password, endpoint)
      )
      return {
        connectionId,
        serverVersion,
        connectedAt: new Date().toISOString()
      }
    } catch (err) {
      // The DB failed to come up — don't leave the tunnel dangling.
      if (cfg) await sshTunnelManager.close(connectionId)
      throw err
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
  async execute(connectionId: string, queryId: string, sql: string): Promise<QueryResultSet> {
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
    return this.driverFor(record.engine).execute(connectionId, `scan-${crypto.randomUUID()}`, sql, {
      timeoutMs: settings.queryTimeoutMs
    })
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
    return this.driverFor(record.engine).importSqlDump(connectionId, filePath, onProgress, signal)
  }

  /**
   * Returns the `CREATE TABLE` / `CREATE VIEW` DDL for a relation. PostgreSQL
   * shells out to `pg_dump --schema-only -t`; MySQL uses `SHOW CREATE TABLE`.
   */
  async scriptCreateTable(connectionId: string, schema: string, table: string): Promise<string> {
    const record = await connectionStore.getRecord(connectionId)
    if (record.engine === 'postgres') {
      const password = await connectionStore.getPassword(connectionId)
      const endpoint = sshTunnelManager.endpointFor(connectionId) ?? undefined
      return runPgDumpSchema(toDriverParams(record, password, endpoint), schema, table)
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

  /**
   * Restores a binary pg_dump archive (.dump / .tar) by running pg_restore.
   * `clean` (→ `--clean --if-exists`) drops & recreates existing objects so the
   * restore replaces a non-empty database instead of erroring on "already
   * exists". Off by default (and for clones, which target a fresh database).
   */
  async restoreArchive(
    connectionId: string,
    filePath: string,
    onProgress: (update: SqlImportProgressUpdate) => void,
    signal: AbortSignal,
    clean = false
  ): Promise<SqlImportOutcome> {
    const record = await connectionStore.getRecord(connectionId)
    if (record.engine !== 'postgres') {
      throw new Error('pg_dump archives can only be restored to a PostgreSQL connection.')
    }
    const password = await connectionStore.getPassword(connectionId)
    const endpoint = sshTunnelManager.endpointFor(connectionId) ?? undefined
    return runPgRestore(
      toDriverParams(record, password, endpoint),
      filePath,
      onProgress,
      signal,
      clean
    )
  }

  /**
   * Exports a whole database to a file. Postgres/MySQL shell out to
   * pg_dump/mysqldump (through the SSH tunnel endpoint when one is open); SQL
   * Server generates SQL over its live pool. The custom archive format is
   * Postgres-only.
   */
  async exportDatabase(
    connectionId: string,
    filePath: string,
    options: ExportOptions,
    onProgress: (update: ExportProgressUpdate) => void,
    signal: AbortSignal
  ): Promise<ExportOutcome> {
    const record = await connectionStore.getRecord(connectionId)
    if (options.format === 'custom' && record.engine !== 'postgres') {
      throw new Error('The custom archive format is only available for PostgreSQL.')
    }
    if (record.engine === 'mssql') {
      const driver = this.drivers.mssql
      if (!(driver instanceof MssqlDriver)) throw new Error('SQL Server driver is not registered')
      return driver.exportDatabase(connectionId, filePath, options, onProgress, signal)
    }
    const password = await connectionStore.getPassword(connectionId)
    const endpoint = sshTunnelManager.endpointFor(connectionId) ?? undefined
    const params = toDriverParams(record, password, endpoint)
    if (record.engine === 'postgres') {
      return runPgDump(params, filePath, options, onProgress, signal)
    }
    if (record.engine === 'mysql') {
      return runMysqldump(params, filePath, options, onProgress, signal)
    }
    throw new Error(`Export is not supported for "${record.engine}" yet`)
  }

  /**
   * Clones the source connection's current database into `targetDatabase` on the
   * target connection (which may be the source). Dumps the source to a temp file,
   * ensures the target pool is open, creates + switches to the new DB, and imports
   * — a full, lossless copy. Same-engine only; SQL Server unsupported. Returns the
   * updated target Connection (post switchDatabase).
   */
  async cloneDatabase(
    sourceId: string,
    targetId: string,
    targetDatabase: string,
    onProgress: (update: { phase: 'export' | 'import'; bytes: number; count: number }) => void,
    signal: AbortSignal
  ): Promise<Connection> {
    const source = await connectionStore.getRecord(sourceId)
    if (source.engine === 'mssql') {
      throw new Error("Cloning isn't supported for SQL Server yet.")
    }
    const target = await connectionStore.getRecord(targetId)
    if (target.engine !== source.engine) {
      throw new Error('The clone target must use the same database engine as the source.')
    }

    const engine = source.engine
    const format = engine === 'postgres' ? 'custom' : 'plain'
    const tempDir = await mkdtemp(join(tmpdir(), 'novex-clone-'))
    const dumpPath = join(tempDir, engine === 'postgres' ? 'clone.dump' : 'clone.sql')

    try {
      // 1) Full dump of the source database (schema + all data + objects).
      await this.exportDatabase(
        sourceId,
        dumpPath,
        { format, contents: 'all' },
        (u) => onProgress({ phase: 'export', bytes: u.bytesWritten, count: u.objectCount }),
        signal
      )

      // 2) The target needs an open pool to create the DB and import.
      if (!this.driverFor(engine).isConnected(targetId)) {
        await this.connect(targetId)
      }

      // 3) Create the target DB (skip if it already exists) and switch to it.
      const databases = await this.listDatabases(targetId)
      if (!databases.includes(targetDatabase)) {
        await this.createDatabase(targetId, targetDatabase)
      }
      const updated = await this.switchDatabase(targetId, targetDatabase)

      // 4) Import the dump into the now-current database.
      const onImport = (u: SqlImportProgressUpdate): void =>
        onProgress({ phase: 'import', bytes: u.bytesProcessed, count: u.statementCount })
      if (engine === 'postgres') {
        await this.restoreArchive(targetId, dumpPath, onImport, signal)
      } else {
        await this.importSqlDump(targetId, dumpPath, onImport, signal)
      }

      return updated
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
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
    await sshTunnelManager.close(connectionId)
  }

  /** Closes every open pool — invoked when the app is quitting. */
  async disposeAll(): Promise<void> {
    await Promise.allSettled(Object.values(this.drivers).map((driver) => driver?.dispose()))
    await sshTunnelManager.closeAll()
  }
}

export const connectionManager = new ConnectionManager()
