import sql from 'mssql'
import type { config as MssqlConfig, IRecordSet, IResult, Request } from 'mssql'
import { MAX_RESULT_ROWS } from '@shared/types/query'
import type { BatchStatement, ExecuteBatchResult, QueryResultSet } from '@shared/types/query'
import type {
  ConnectionOptions,
  ConnectionTestResult,
  SslMode
} from '@shared/types/connection'
import type { SchemaSnapshot } from '@shared/types/schema'
import type {
  TableChangeSet,
  TableDataPage,
  TableMutateResult
} from '@shared/types/table-data'
import { quoteMssqlIdent } from '@main/utils/sql'
import { introspectMssql } from '@main/services/drivers/mssql-introspection'
import {
  applyMssqlTableChanges,
  fetchMssqlTablePage
} from '@main/services/drivers/mssql-table-data'
import type {
  DatabaseDriver,
  DriverConnectionParams,
  QueryExecuteOptions,
  SqlImportOutcome,
  SqlImportProgressUpdate,
  TableFetchParams
} from './driver.types'

const POOL_DEFAULTS = {
  max: 5,
  min: 0,
  idleTimeoutMillis: 30_000
} as const

const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000

/**
 * Map the engine-agnostic SSL mode onto SQL Server's `encrypt` /
 * `trustServerCertificate` pair. Explicit options on the connection win — they
 * are the toggles the user actually sees in the form.
 */
function resolveEncryption(
  ssl: SslMode,
  options: ConnectionOptions | undefined
): { encrypt: boolean; trustServerCertificate: boolean } {
  if (options?.encrypt !== undefined || options?.trustServerCertificate !== undefined) {
    return {
      encrypt: options.encrypt ?? true,
      trustServerCertificate: options.trustServerCertificate ?? false
    }
  }
  switch (ssl) {
    case 'disable':
      return { encrypt: false, trustServerCertificate: false }
    case 'require':
      return { encrypt: true, trustServerCertificate: false }
    case 'prefer':
    default:
      return { encrypt: true, trustServerCertificate: true }
  }
}

function toMssqlConfig(params: DriverConnectionParams): MssqlConfig {
  const { encrypt, trustServerCertificate } = resolveEncryption(params.ssl, params.options)
  return {
    server: params.host,
    port: params.port,
    user: params.username,
    password: params.password,
    database: params.database,
    connectionTimeout: params.options?.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    requestTimeout: 0,
    arrayRowMode: true,
    options: {
      encrypt,
      trustServerCertificate,
      // tedious defaults to false; turning it on prevents the precision loss
      // that bites BIGINT / DECIMAL columns when they cross IPC.
      useUTC: true
    },
    pool: { ...POOL_DEFAULTS }
  }
}

/** `@@VERSION` returns a long banner; keep the leading product/version line. */
function parseServerVersion(raw: string | undefined): string {
  if (!raw) return 'SQL Server'
  const firstLine = raw.split(/\r?\n/)[0].trim()
  const match = firstLine.match(/Microsoft SQL Server\s+\d{4}(?:\s+\([^)]+\))?/i)
  return match?.[0] ?? firstLine
}

/** mssql 12 returns rows of objects by default; we ask for arrays via arrayRowMode. */
function rowsAsArrays(recordset: IRecordSet<unknown> | undefined): unknown[][] {
  if (!recordset) return []
  // arrayRowMode rows are already arrays; the fallback handles older callers.
  return recordset.map((row) => (Array.isArray(row) ? (row as unknown[]) : Object.values(row as object)))
}

function buildResultSet(result: IResult<unknown>, durationMs: number): QueryResultSet {
  const recordset = result.recordsets?.[result.recordsets.length - 1] as
    | IRecordSet<unknown>
    | undefined
  const allRows = rowsAsArrays(recordset)
  const truncated = allRows.length > MAX_RESULT_ROWS
  const rows = truncated ? allRows.slice(0, MAX_RESULT_ROWS) : allRows

  const columnMeta = recordset?.columns ?? {}
  const columns = Object.values(columnMeta)
    .sort((a, b) => a.index - b.index)
    .map((column) => ({
      name: column.name,
      // tedious tags every column with a numeric type id; absent it we fall back to 0.
      dataTypeId:
        (typeof column.type === 'function' ? (column.type as unknown as { id?: number }).id : (column.type as { id?: number })?.id) ?? 0
    }))

  // SQL Server returns one rowsAffected entry per statement; summing matches the
  // affectedRows semantics every other driver exposes.
  const affectedRows = (result.rowsAffected ?? []).reduce((sum, n) => sum + (n ?? 0), 0)

  return {
    columns,
    rows,
    rowCount: rows.length,
    affectedRows,
    command: columns.length > 0 ? 'SELECT' : '',
    durationMs,
    truncated
  }
}

interface ConnectionEntry {
  pool: sql.ConnectionPool
  params: DriverConnectionParams
}

interface RunningQuery {
  connectionId: string
  request: Request
}

/** The SQL Server adapter — implements the shared DatabaseDriver contract. */
export class MssqlDriver implements DatabaseDriver {
  readonly engine = 'mssql' as const

  private readonly connections = new Map<string, ConnectionEntry>()
  private readonly running = new Map<string, RunningQuery>()

  async testConnection(params: DriverConnectionParams): Promise<ConnectionTestResult> {
    const config = { ...toMssqlConfig(params), pool: { max: 1, min: 0, idleTimeoutMillis: 1_000 } }
    const pool = new sql.ConnectionPool(config)
    const startedAt = Date.now()
    try {
      await pool.connect()
      const result = await pool.request().query<{ version: string }>('SELECT @@VERSION AS version')
      const version = (result.recordset?.[0] as { version?: string } | undefined)?.version
      return {
        serverVersion: parseServerVersion(version),
        latencyMs: Date.now() - startedAt
      }
    } finally {
      await pool.close().catch(() => undefined)
    }
  }

  async connect(connectionId: string, params: DriverConnectionParams): Promise<string> {
    await this.disconnect(connectionId)

    const pool = new sql.ConnectionPool(toMssqlConfig(params))
    pool.on('error', (err: Error) => {
      console.error(`[mssql pool ${connectionId}]`, err.message)
    })

    try {
      await pool.connect()
      const result = await pool.request().query<{ version: string }>('SELECT @@VERSION AS version')
      this.connections.set(connectionId, { pool, params })
      const version = (result.recordset?.[0] as { version?: string } | undefined)?.version
      return parseServerVersion(version)
    } catch (err) {
      await pool.close().catch(() => undefined)
      throw err
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const entry = this.connections.get(connectionId)
    if (!entry) return
    this.connections.delete(connectionId)
    await entry.pool.close().catch(() => undefined)
  }

  async execute(
    connectionId: string,
    queryId: string,
    sqlText: string,
    options: QueryExecuteOptions
  ): Promise<QueryResultSet> {
    const pool = this.requirePool(connectionId)
    const request = pool.request()
    request.arrayRowMode = true

    // mssql doesn't expose a per-request timeout in its typings, so we drive
    // cancellation from a timer. `request.cancel()` issues an attention token,
    // and the in-flight `batch` rejects with ECANCEL — same path the user-
    // triggered cancel takes.
    const timeoutId =
      options.timeoutMs > 0
        ? setTimeout(() => {
            try {
              request.cancel()
            } catch {
              /* request may have already finished */
            }
          }, Math.floor(options.timeoutMs))
        : undefined

    this.running.set(queryId, { connectionId, request })
    const startedAt = Date.now()
    try {
      // `batch` (as opposed to `query`) keeps GO-separated multi-statement
      // scripts intact and preserves SQL Server's batch semantics.
      const result = await request.batch(sqlText)
      return buildResultSet(result, Date.now() - startedAt)
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      this.running.delete(queryId)
    }
  }

  async cancel(_connectionId: string, queryId: string): Promise<void> {
    const running = this.running.get(queryId)
    if (!running) return
    // mssql.Request.cancel issues an attention token on the same connection;
    // the in-flight `batch` rejects with an ECANCEL error which the caller
    // surfaces as a normal query failure.
    running.request.cancel()
  }

  async executeBatch(
    connectionId: string,
    statements: BatchStatement[]
  ): Promise<ExecuteBatchResult> {
    const pool = this.requirePool(connectionId)
    const transaction = new sql.Transaction(pool)
    const startedAt = Date.now()
    let affectedRows = 0
    try {
      await transaction.begin()
      for (const statement of statements) {
        const request = transaction.request()
        for (const [index, value] of (statement.params ?? []).entries()) {
          // SQL Server names parameters; map positional `?`-style params onto
          // @p0, @p1, … the caller is expected to use the same convention.
          request.input(`p${index}`, value)
        }
        const result = await request.query(statement.sql)
        affectedRows += (result.rowsAffected ?? []).reduce((sum, n) => sum + (n ?? 0), 0)
      }
      await transaction.commit()
      return {
        statementCount: statements.length,
        affectedRows,
        durationMs: Date.now() - startedAt
      }
    } catch (err) {
      await transaction.rollback().catch(() => undefined)
      throw err
    }
  }

  async importSqlDump(
    _connectionId: string,
    _filePath: string,
    _onProgress: (update: SqlImportProgressUpdate) => void,
    _signal: AbortSignal
  ): Promise<SqlImportOutcome> {
    // .sql dump import is postgres/mysql-specific today (different dialects of
    // delimiter handling and tokenizer state). Surface a clear error rather
    // than silently doing nothing.
    throw new Error('SQL dump import is not yet supported for SQL Server connections')
  }

  introspect(connectionId: string): Promise<SchemaSnapshot> {
    return introspectMssql(this.requirePool(connectionId))
  }

  async listDatabases(connectionId: string): Promise<string[]> {
    const pool = this.requirePool(connectionId)
    const result = await pool.request().query<{ name: string }>(
      `SELECT name FROM sys.databases
       WHERE database_id > 4 OR name = 'master'
       ORDER BY name`
    )
    return result.recordset.map((row) => row.name)
  }

  async createDatabase(connectionId: string, name: string): Promise<void> {
    const pool = this.requirePool(connectionId)
    // CREATE DATABASE cannot run inside a transaction; the pool already runs
    // each request on its own connection so we don't need to escape one.
    await pool.request().batch(`CREATE DATABASE ${quoteMssqlIdent(name)}`)
  }

  fetchTable(connectionId: string, params: TableFetchParams): Promise<TableDataPage> {
    return fetchMssqlTablePage(this.requirePool(connectionId), params)
  }

  mutateTable(
    connectionId: string,
    schema: string,
    table: string,
    changes: TableChangeSet
  ): Promise<TableMutateResult> {
    return applyMssqlTableChanges(this.requirePool(connectionId), schema, table, changes)
  }

  async explain(connectionId: string, sqlText: string): Promise<unknown> {
    const pool = this.requirePool(connectionId)
    // SHOWPLAN_XML is a session-level switch and must be the only statement in
    // its batch; we toggle it, capture the plan, then turn it back off.
    const request = pool.request()
    request.arrayRowMode = true
    try {
      await request.batch('SET SHOWPLAN_XML ON')
      const result = await pool.request().batch(sqlText)
      const recordsets = result.recordsets as IRecordSet<unknown>[] | undefined
      const recordset = recordsets?.[0]
      const firstRow = recordset?.[0]
      if (Array.isArray(firstRow)) return firstRow[0] ?? null
      if (firstRow && typeof firstRow === 'object') {
        return Object.values(firstRow as object)[0] ?? null
      }
      return null
    } finally {
      await pool.request().batch('SET SHOWPLAN_XML OFF').catch(() => undefined)
    }
  }

  isConnected(connectionId: string): boolean {
    return this.connections.has(connectionId)
  }

  activeConnectionIds(): string[] {
    return [...this.connections.keys()]
  }

  private requirePool(connectionId: string): sql.ConnectionPool {
    const entry = this.connections.get(connectionId)
    if (!entry) throw new Error('Connection is not open')
    return entry.pool
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([...this.connections.values()].map((entry) => entry.pool.close()))
    this.connections.clear()
    this.running.clear()
  }
}
