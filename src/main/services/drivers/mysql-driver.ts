import mysql from 'mysql2/promise'
import type {
  FieldPacket,
  Pool,
  PoolOptions,
  ResultSetHeader,
  RowDataPacket
} from 'mysql2/promise'
import { MAX_RESULT_ROWS } from '@shared/types/query'
import type { BatchStatement, ExecuteBatchResult, QueryResultSet } from '@shared/types/query'
import type { ConnectionTestResult, SslMode } from '@shared/types/connection'
import type { SchemaSnapshot } from '@shared/types/schema'
import type {
  TableChangeSet,
  TableDataPage,
  TableMutateResult
} from '@shared/types/table-data'
import { quoteMysqlIdent } from '@main/utils/sql'
import { introspectMysql } from '@main/services/drivers/mysql-introspection'
import {
  applyMysqlTableChanges,
  fetchMysqlTablePage
} from '@main/services/drivers/mysql-table-data'
import { importMysqlDump } from '@main/services/drivers/mysql-sql-import'
import type {
  DatabaseDriver,
  DriverConnectionParams,
  QueryExecuteOptions,
  SqlImportOutcome,
  SqlImportProgressUpdate,
  TableFetchParams
} from './driver.types'

const POOL_DEFAULTS = {
  connectionLimit: 5,
  connectTimeout: 10_000,
  // Return dates and big integers as strings — safe to serialise over IPC and
  // keeps precision for BIGINT / DECIMAL columns.
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true
} satisfies Partial<PoolOptions>

/** Desktop clients hit arbitrary servers — enable TLS without pinning a CA. */
function toSsl(ssl: SslMode): PoolOptions['ssl'] {
  return ssl === 'disable' ? undefined : { rejectUnauthorized: false }
}

function toPoolOptions(params: DriverConnectionParams): PoolOptions {
  return {
    host: params.host,
    port: params.port,
    user: params.username,
    password: params.password,
    database: params.database,
    ssl: toSsl(params.ssl),
    ...POOL_DEFAULTS
  }
}

/** `VERSION()` returns e.g. "8.0.35" or "10.11.2-MariaDB". */
function parseServerVersion(raw: string): string {
  if (!raw) return 'MySQL'
  return raw.includes('MariaDB') ? raw : `MySQL ${raw}`
}

/** Convert a mysql2 result into the engine-agnostic QueryResultSet. */
function buildResultSet(
  rows: unknown,
  fields: FieldPacket[] | undefined,
  durationMs: number
): QueryResultSet {
  if (Array.isArray(rows)) {
    const all = rows as unknown[][]
    const truncated = all.length > MAX_RESULT_ROWS
    const capped = truncated ? all.slice(0, MAX_RESULT_ROWS) : all
    return {
      columns: (fields ?? []).map((field) => ({
        name: field.name,
        dataTypeId: field.columnType ?? 0
      })),
      rows: capped,
      rowCount: capped.length,
      affectedRows: 0,
      command: 'SELECT',
      durationMs,
      truncated
    }
  }
  const header = rows as ResultSetHeader | undefined
  return {
    columns: [],
    rows: [],
    rowCount: 0,
    affectedRows: header?.affectedRows ?? 0,
    command: '',
    durationMs,
    truncated: false
  }
}

interface ConnectionEntry {
  pool: Pool
  params: DriverConnectionParams
}

interface RunningQuery {
  connectionId: string
  threadId: number
}

/** The MySQL adapter — implements the shared DatabaseDriver contract. */
export class MysqlDriver implements DatabaseDriver {
  readonly engine = 'mysql' as const

  private readonly connections = new Map<string, ConnectionEntry>()
  private readonly running = new Map<string, RunningQuery>()

  async testConnection(params: DriverConnectionParams): Promise<ConnectionTestResult> {
    const startedAt = Date.now()
    const connection = await mysql.createConnection({
      host: params.host,
      port: params.port,
      user: params.username,
      password: params.password,
      database: params.database,
      ssl: toSsl(params.ssl),
      connectTimeout: 10_000
    })
    try {
      const [rows] = await connection.query<RowDataPacket[]>('SELECT VERSION() AS version')
      return {
        serverVersion: parseServerVersion(String(rows[0]?.['version'] ?? '')),
        latencyMs: Date.now() - startedAt
      }
    } finally {
      await connection.end()
    }
  }

  async connect(connectionId: string, params: DriverConnectionParams): Promise<string> {
    await this.disconnect(connectionId)

    const pool = mysql.createPool(toPoolOptions(params))
    try {
      const [rows] = await pool.query<RowDataPacket[]>('SELECT VERSION() AS version')
      this.connections.set(connectionId, { pool, params })
      return parseServerVersion(String(rows[0]?.['version'] ?? ''))
    } catch (err) {
      await pool.end()
      throw err
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const entry = this.connections.get(connectionId)
    if (!entry) return
    this.connections.delete(connectionId)
    await entry.pool.end()
  }

  async execute(
    connectionId: string,
    queryId: string,
    sql: string,
    options: QueryExecuteOptions
  ): Promise<QueryResultSet> {
    const pool = this.requirePool(connectionId)
    const connection = await pool.getConnection()
    this.running.set(queryId, { connectionId, threadId: connection.threadId ?? 0 })

    const startedAt = Date.now()
    const applyTimeout = options.timeoutMs > 0
    try {
      if (applyTimeout) {
        // Best-effort — `max_execution_time` only exists on MySQL 5.7.8+ and
        // bounds SELECTs only; older servers / MariaDB just ignore the failure.
        try {
          await connection.query(
            `SET SESSION max_execution_time = ${Math.floor(options.timeoutMs)}`
          )
        } catch {
          /* unsupported — cancellation is still available */
        }
      }
      const [rows, fields] = await connection.query({ sql, rowsAsArray: true })
      return buildResultSet(rows, fields as FieldPacket[] | undefined, Date.now() - startedAt)
    } finally {
      this.running.delete(queryId)
      if (applyTimeout) {
        try {
          await connection.query('SET SESSION max_execution_time = 0')
        } catch {
          /* connection may be broken — the pool will recycle it */
        }
      }
      connection.release()
    }
  }

  async cancel(connectionId: string, queryId: string): Promise<void> {
    const running = this.running.get(queryId)
    if (!running) return
    const pool = this.connections.get(connectionId)?.pool
    if (!pool) return
    // KILL QUERY aborts the running statement without dropping the connection.
    await pool.query(`KILL QUERY ${running.threadId}`).catch(() => undefined)
  }

  async executeBatch(
    connectionId: string,
    statements: BatchStatement[]
  ): Promise<ExecuteBatchResult> {
    const pool = this.requirePool(connectionId)
    const connection = await pool.getConnection()
    const startedAt = Date.now()
    let affectedRows = 0
    try {
      await connection.beginTransaction()
      for (const statement of statements) {
        const [result] = await connection.query(statement.sql, statement.params ?? [])
        affectedRows += (result as ResultSetHeader | undefined)?.affectedRows ?? 0
      }
      await connection.commit()
      return {
        statementCount: statements.length,
        affectedRows,
        durationMs: Date.now() - startedAt
      }
    } catch (err) {
      await connection.rollback().catch(() => undefined)
      throw err
    } finally {
      connection.release()
    }
  }

  async importSqlDump(
    connectionId: string,
    filePath: string,
    onProgress: (update: SqlImportProgressUpdate) => void,
    signal: AbortSignal
  ): Promise<SqlImportOutcome> {
    const entry = this.connections.get(connectionId)
    if (!entry) throw new Error('Connection is not open')
    // A dedicated connection with multi-statement support — kept off the shared
    // pool so ordinary query execution stays single-statement.
    const connection = await mysql.createConnection({
      ...toPoolOptions(entry.params),
      multipleStatements: true
    })
    try {
      return await importMysqlDump(connection, filePath, onProgress, signal)
    } finally {
      await connection.end()
    }
  }

  introspect(connectionId: string): Promise<SchemaSnapshot> {
    return introspectMysql(this.requirePool(connectionId))
  }

  async listDatabases(connectionId: string): Promise<string[]> {
    const pool = this.requirePool(connectionId)
    const [rows] = await pool.query<RowDataPacket[]>('SHOW DATABASES')
    return rows.map((row) => String(row['Database']))
  }

  async createDatabase(connectionId: string, name: string): Promise<void> {
    const pool = this.requirePool(connectionId)
    await pool.query(`CREATE DATABASE ${quoteMysqlIdent(name)}`)
  }

  /** Returns the `CREATE TABLE`/`CREATE VIEW` DDL via `SHOW CREATE TABLE`. */
  async scriptCreateTable(
    connectionId: string,
    schema: string,
    table: string
  ): Promise<string> {
    const pool = this.requirePool(connectionId)
    const qualified = `${quoteMysqlIdent(schema)}.${quoteMysqlIdent(table)}`
    const [rows] = await pool.query<RowDataPacket[]>(`SHOW CREATE TABLE ${qualified}`)
    const row = rows[0] ?? {}
    // The DDL column is named `Create Table` for tables and `Create View` for views.
    const ddl = row['Create Table'] ?? row['Create View']
    if (typeof ddl !== 'string') {
      throw new Error(`No DDL returned for ${qualified}`)
    }
    return `${ddl};\n`
  }

  fetchTable(connectionId: string, params: TableFetchParams): Promise<TableDataPage> {
    return fetchMysqlTablePage(this.requirePool(connectionId), params)
  }

  mutateTable(
    connectionId: string,
    schema: string,
    table: string,
    changes: TableChangeSet
  ): Promise<TableMutateResult> {
    return applyMysqlTableChanges(this.requirePool(connectionId), schema, table, changes)
  }

  async explain(connectionId: string, sql: string): Promise<unknown> {
    const pool = this.requirePool(connectionId)
    const [rows] = await pool.query<RowDataPacket[]>(`EXPLAIN FORMAT=JSON ${sql}`)
    const raw = rows[0]?.['EXPLAIN']
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return raw
      }
    }
    return raw ?? null
  }

  isConnected(connectionId: string): boolean {
    return this.connections.has(connectionId)
  }

  activeConnectionIds(): string[] {
    return [...this.connections.keys()]
  }

  private requirePool(connectionId: string): Pool {
    const entry = this.connections.get(connectionId)
    if (!entry) throw new Error('Connection is not open')
    return entry.pool
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([...this.connections.values()].map((entry) => entry.pool.end()))
    this.connections.clear()
    this.running.clear()
  }
}
