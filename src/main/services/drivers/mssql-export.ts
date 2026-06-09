import { createWriteStream, promises as fs } from 'node:fs'
import type { Writable } from 'node:stream'
import { createGzip } from 'node:zlib'
import type { ConnectionPool } from 'mssql'
import { quoteMssqlIdent, quoteMssqlQualified } from '@main/utils/sql'
import { introspectMssql } from '@main/services/drivers/mssql-introspection'
import { fetchMssqlTablePage } from '@main/services/drivers/mssql-table-data'
import type {
  ExportOptions,
  ExportOutcome,
  ExportProgressUpdate
} from '@main/services/drivers/driver.types'
import type { RelationInfo } from '@shared/types/schema'
import type { TableColumn } from '@shared/types/table-data'

/**
 * SQL Server has no cross-platform CLI dump tool, so we generate plain SQL by
 * introspecting the schema and paging rows into INSERT statements. The DDL is
 * best-effort — columns + primary key only. Foreign keys, indexes, identity
 * seeds, computed columns, triggers and routines are NOT emitted. (Re-import via
 * sqlcmd/SSMS; the app's MSSQL SQL-import is not supported.)
 */

const ROW_PAGE_SIZE = 500
const PROGRESS_INTERVAL_MS = 150

/** A single T-SQL literal — `N'…'` for text (escaping `'`), `0x…` for binary, etc. */
export function mssqlSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof Date) {
    return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`
  }
  // ArrayBuffer.isView is realm-safe (a Node Buffer passes it even under jsdom,
  // unlike `instanceof Uint8Array`), and covers every typed-array binary value.
  if (ArrayBuffer.isView(value)) {
    return `0x${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('hex')}`
  }
  if (typeof value === 'object') {
    return `N'${JSON.stringify(value).replace(/'/g, "''")}'`
  }
  return `N'${String(value).replace(/'/g, "''")}'`
}

/** Best-effort `CREATE TABLE` from introspected columns (+ PK). */
export function buildMssqlCreateTable(relation: RelationInfo): string {
  const columnDefs = relation.columns.map((column) => {
    const parts = [`  ${quoteMssqlIdent(column.name)} ${column.dataType}`]
    parts.push(column.nullable ? 'NULL' : 'NOT NULL')
    if (column.defaultValue) parts.push(`DEFAULT ${column.defaultValue}`)
    return parts.join(' ')
  })
  const pk = relation.columns
    .filter((column) => column.isPrimaryKey)
    .map((column) => quoteMssqlIdent(column.name))
  const lines = [...columnDefs]
  if (pk.length > 0) lines.push(`  PRIMARY KEY (${pk.join(', ')})`)
  return `CREATE TABLE ${quoteMssqlQualified(relation.schema, relation.name)} (\n${lines.join(',\n')}\n);\nGO\n`
}

/** One `INSERT … VALUES …;` per row. Returns '' for an empty page. */
export function buildMssqlInserts(
  schema: string,
  table: string,
  columns: TableColumn[],
  rows: unknown[][]
): string {
  if (rows.length === 0) return ''
  const qualified = quoteMssqlQualified(schema, table)
  const columnList = columns.map((column) => quoteMssqlIdent(column.name)).join(', ')
  return (
    rows
      .map((row) => {
        const values = columns.map((_, index) => mssqlSqlLiteral(row[index])).join(', ')
        return `INSERT INTO ${qualified} (${columnList}) VALUES (${values});`
      })
      .join('\n') + '\n'
  )
}

/**
 * Stream a generated SQL dump of every table in the connected SQL Server
 * database to `filePath` (gzipped for the `gzip` format). Runs over the live
 * pool, so the SSH tunnel (if any) is reused transparently. Removes the partial
 * file on error/cancel.
 */
export async function exportMssqlDatabase(
  pool: ConnectionPool,
  filePath: string,
  options: ExportOptions,
  onProgress: (update: ExportProgressUpdate) => void,
  signal: AbortSignal
): Promise<ExportOutcome> {
  if (options.format === 'custom') {
    throw new Error('The custom archive format is only available for PostgreSQL.')
  }

  const out = createWriteStream(filePath)
  const gzip = options.format === 'gzip' ? createGzip() : null
  const sink: Writable = gzip ?? out
  if (gzip) gzip.pipe(out)

  let approxBytes = 0
  let objectCount = 0
  let lastProgressAt = 0

  const write = (text: string): Promise<void> =>
    new Promise((resolve, reject) => {
      approxBytes += Buffer.byteLength(text)
      sink.write(text, (err) => (err ? reject(err) : resolve()))
    })

  const cleanup = async (): Promise<void> => {
    out.destroy()
    gzip?.destroy()
    await fs.rm(filePath, { force: true }).catch(() => undefined)
  }

  const report = (force: boolean): void => {
    const now = Date.now()
    if (force || now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
      lastProgressAt = now
      onProgress({ bytesWritten: approxBytes, objectCount })
    }
  }

  try {
    const snapshot = await introspectMssql(pool)
    const tables = snapshot.relations.filter((relation) => relation.kind === 'table')

    await write(`-- NovexDB database export — ${new Date().toISOString()}\n`)
    await write(`-- ${tables.length} table(s)\n\n`)

    for (const relation of tables) {
      if (signal.aborted) throw new Error('Export cancelled')

      if (options.contents !== 'data') {
        await write(buildMssqlCreateTable(relation) + '\n')
      }

      if (options.contents !== 'schema') {
        let offset = 0
        for (;;) {
          if (signal.aborted) throw new Error('Export cancelled')
          const page = await fetchMssqlTablePage(pool, {
            schema: relation.schema,
            table: relation.name,
            limit: ROW_PAGE_SIZE,
            offset,
            orderBy: null,
            orderDir: 'asc',
            search: ''
          })
          if (page.rows.length === 0) break
          await write(buildMssqlInserts(relation.schema, relation.name, page.columns, page.rows))
          offset += page.rows.length
          report(false)
          if (page.rows.length < ROW_PAGE_SIZE) break
        }
        await write('\n')
      }

      objectCount += 1
      report(true)
    }

    await new Promise<void>((resolve, reject) => {
      out.on('finish', resolve)
      out.on('error', reject)
      sink.end()
    })

    // Report the true on-disk size (gzip makes it smaller than the byte estimate).
    const stat = await fs.stat(filePath)
    onProgress({ bytesWritten: stat.size, objectCount })
    return { bytesWritten: stat.size }
  } catch (err) {
    await cleanup()
    throw err
  }
}
