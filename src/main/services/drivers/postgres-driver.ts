import pg from 'pg'
import type { FieldDef, PoolConfig, QueryArrayResult } from 'pg'
import { MAX_RESULT_ROWS } from '@shared/types/query'
import type { BatchStatement, ExecuteBatchResult, QueryResultSet } from '@shared/types/query'
import type { ConnectionTestResult, SslMode } from '@shared/types/connection'
import type { SchemaSnapshot } from '@shared/types/schema'
import type { TableChangeSet, TableDataPage, TableMutateResult } from '@shared/types/table-data'
import { introspectPostgres } from '@main/services/drivers/postgres-introspection'
import { applyTableChanges, fetchTablePage } from '@main/services/drivers/postgres-table-data'
import { importSqlDump as runSqlImport } from '@main/services/drivers/postgres-sql-import'
import { quoteIdent } from '@main/utils/sql'
import type {
  DatabaseDriver,
  DriverConnectionParams,
  QueryExecuteOptions,
  SqlImportOutcome,
  SqlImportProgressUpdate,
  TableFetchParams
} from './driver.types'

const { Pool } = pg

const POOL_DEFAULTS = {
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // TCP keep-alive so idle connections to a remote server survive NAT/firewall
  // idle timeouts and dead sockets are detected promptly — without it (pg
  // defaults keepAlive to false) the next query just fails "connection lost".
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  application_name: 'NovexDB'
} satisfies Partial<PoolConfig>

/**
 * Desktop clients connect to arbitrary, often self-managed servers, so strict
 * CA verification is impractical here — `prefer`/`require` enable TLS without
 * pinning a CA. Hardening this into a per-connection trust store is future work.
 */
function toSslConfig(ssl: SslMode): PoolConfig['ssl'] {
  return ssl === 'disable' ? false : { rejectUnauthorized: false }
}

function toPoolConfig(params: DriverConnectionParams): PoolConfig {
  return {
    host: params.host,
    port: params.port,
    // Blank database = connect to the server; fall back to the standard
    // `postgres` maintenance DB (pg requires *some* database to connect to).
    database: params.database || 'postgres',
    user: params.username,
    password: params.password,
    ssl: toSslConfig(params.ssl),
    ...POOL_DEFAULTS
  }
}

/** `version()` returns a long banner; keep just the "PostgreSQL <n>" prefix. */
function parseServerVersion(raw: string): string {
  const match = raw.match(/PostgreSQL\s+\d+(?:\.\d+)?/i)
  return match?.[0] ?? raw.split(',')[0] ?? 'PostgreSQL'
}

/** Convert a pg result (or the last of a multi-statement batch) into a QueryResultSet. */
function buildResultSet(raw: unknown, durationMs: number): QueryResultSet {
  const result = (Array.isArray(raw) ? raw[raw.length - 1] : raw) as
    | QueryArrayResult<unknown[]>
    | undefined

  const fields: FieldDef[] = result?.fields ?? []
  const allRows: unknown[][] = result?.rows ?? []
  const truncated = allRows.length > MAX_RESULT_ROWS
  const rows = truncated ? allRows.slice(0, MAX_RESULT_ROWS) : allRows

  return {
    columns: fields.map((field) => ({ name: field.name, dataTypeId: field.dataTypeID })),
    rows,
    rowCount: rows.length,
    affectedRows: result?.rowCount ?? 0,
    command: result?.command ?? '',
    durationMs,
    truncated
  }
}

interface RunningQuery {
  connectionId: string
  backendPid: number
}

export class PostgresDriver implements DatabaseDriver {
  readonly engine = 'postgres' as const

  private readonly pools = new Map<string, pg.Pool>()
  private readonly running = new Map<string, RunningQuery>()

  async testConnection(params: DriverConnectionParams): Promise<ConnectionTestResult> {
    const pool = new Pool({ ...toPoolConfig(params), max: 1 })
    const startedAt = Date.now()
    try {
      const result = await pool.query<{ version: string }>('SELECT version()')
      return {
        serverVersion: parseServerVersion(result.rows[0]?.version ?? ''),
        latencyMs: Date.now() - startedAt
      }
    } finally {
      await pool.end()
    }
  }

  async connect(connectionId: string, params: DriverConnectionParams): Promise<string> {
    await this.disconnect(connectionId)

    const pool = new Pool(toPoolConfig(params))
    pool.on('error', (err) => {
      console.error(`[pg pool ${connectionId}]`, err.message)
    })

    try {
      const result = await pool.query<{ version: string }>('SELECT version()')
      this.pools.set(connectionId, pool)
      return parseServerVersion(result.rows[0]?.version ?? '')
    } catch (err) {
      await pool.end()
      throw err
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const pool = this.pools.get(connectionId)
    if (!pool) return
    this.pools.delete(connectionId)
    await pool.end()
  }

  async execute(
    connectionId: string,
    queryId: string,
    sql: string,
    options: QueryExecuteOptions
  ): Promise<QueryResultSet> {
    const pool = this.pools.get(connectionId)
    if (!pool) throw new Error('Connection is not open')

    const client = await pool.connect()
    // Record the backend PID so a parallel connection can cancel this query.
    const pidResult = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    this.running.set(queryId, { connectionId, backendPid: pidResult.rows[0]?.pid ?? 0 })

    const startedAt = Date.now()
    const applyTimeout = options.timeoutMs > 0
    try {
      if (applyTimeout) {
        await client.query(`SET statement_timeout = ${Math.floor(options.timeoutMs)}`)
      }
      const raw = await client.query({ text: sql, rowMode: 'array' })
      return buildResultSet(raw, Date.now() - startedAt)
    } finally {
      this.running.delete(queryId)
      if (applyTimeout) {
        // Reset so the pooled client does not carry the timeout to its next use.
        try {
          await client.query('SET statement_timeout = DEFAULT')
        } catch {
          /* connection may be broken — the pool will recycle it */
        }
      }
      client.release()
    }
  }

  async cancel(connectionId: string, queryId: string): Promise<void> {
    const running = this.running.get(queryId)
    if (!running) return
    const pool = this.pools.get(connectionId)
    if (!pool) return
    // The cancel request must travel on a separate connection.
    await pool.query('SELECT pg_cancel_backend($1)', [running.backendPid])
  }

  async executeBatch(
    connectionId: string,
    statements: BatchStatement[]
  ): Promise<ExecuteBatchResult> {
    const pool = this.requirePool(connectionId)
    const client = await pool.connect()
    const startedAt = Date.now()
    let affectedRows = 0
    try {
      await client.query('BEGIN')
      for (const statement of statements) {
        const result = await client.query(statement.sql, statement.params ?? [])
        affectedRows += result.rowCount ?? 0
      }
      await client.query('COMMIT')
      return {
        statementCount: statements.length,
        affectedRows,
        durationMs: Date.now() - startedAt
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw err
    } finally {
      client.release()
    }
  }

  importSqlDump(
    connectionId: string,
    filePath: string,
    onProgress: (update: SqlImportProgressUpdate) => void,
    signal: AbortSignal
  ): Promise<SqlImportOutcome> {
    return runSqlImport(this.requirePool(connectionId), filePath, onProgress, signal)
  }

  introspect(connectionId: string): Promise<SchemaSnapshot> {
    return introspectPostgres(this.requirePool(connectionId))
  }

  async listDatabases(connectionId: string): Promise<string[]> {
    const pool = this.requirePool(connectionId)
    const result = await pool.query<{ datname: string }>(
      `SELECT datname FROM pg_database
       WHERE datistemplate = false AND datallowconn = true
       ORDER BY datname`
    )
    return result.rows.map((row) => row.datname)
  }

  async createDatabase(connectionId: string, name: string): Promise<void> {
    const pool = this.requirePool(connectionId)
    const client = await pool.connect()
    try {
      // CREATE DATABASE cannot run inside a transaction block.
      await client.query(`CREATE DATABASE ${quoteIdent(name)}`)
    } finally {
      client.release()
    }
  }

  fetchTable(connectionId: string, params: TableFetchParams): Promise<TableDataPage> {
    return fetchTablePage(this.requirePool(connectionId), params)
  }

  mutateTable(
    connectionId: string,
    schema: string,
    table: string,
    changes: TableChangeSet
  ): Promise<TableMutateResult> {
    return applyTableChanges(this.requirePool(connectionId), schema, table, changes)
  }

  async explain(connectionId: string, sql: string): Promise<unknown> {
    const pool = this.requirePool(connectionId)
    // EXPLAIN without ANALYZE only plans the query — it never executes it.
    const result = await pool.query<{ 'QUERY PLAN': unknown }>(`EXPLAIN (FORMAT JSON) ${sql}`)
    return result.rows[0]?.['QUERY PLAN'] ?? null
  }

  isConnected(connectionId: string): boolean {
    return this.pools.has(connectionId)
  }

  activeConnectionIds(): string[] {
    return [...this.pools.keys()]
  }

  private requirePool(connectionId: string): pg.Pool {
    const pool = this.pools.get(connectionId)
    if (!pool) throw new Error('Connection is not open')
    return pool
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([...this.pools.values()].map((pool) => pool.end()))
    this.pools.clear()
    this.running.clear()
  }
}
