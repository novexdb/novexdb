import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { DriverConnectionParams } from '@main/services/drivers/driver.types'
import type { SqlImportOutcome, SqlImportProgressUpdate } from '@main/services/drivers/driver.types'

/** Common install locations — checked first, since a packaged app has a bare PATH. */
const PG_RESTORE_CANDIDATES = [
  '/opt/homebrew/opt/libpq/bin/pg_restore',
  '/opt/homebrew/bin/pg_restore',
  '/usr/local/opt/libpq/bin/pg_restore',
  '/usr/local/bin/pg_restore',
  '/Applications/Postgres.app/Contents/Versions/latest/bin/pg_restore',
  '/usr/bin/pg_restore',
  '/usr/pgsql/bin/pg_restore'
]

/** Sibling `pg_dump` binaries — paired with each `pg_restore` candidate. */
const PG_DUMP_CANDIDATES = PG_RESTORE_CANDIDATES.map((p) => p.replace(/pg_restore$/, 'pg_dump'))

const MAX_ERROR_SAMPLES = 25
const ERROR_MESSAGE_MAX = 300

/** Resolve a pg_restore binary — a known path if present, else rely on PATH. */
function resolvePgRestore(): string {
  for (const candidate of PG_RESTORE_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return 'pg_restore'
}

/** Resolve a pg_dump binary — same candidate set as pg_restore. */
export function resolvePgDump(): string {
  for (const candidate of PG_DUMP_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return 'pg_dump'
}

/**
 * Restore a binary pg_dump archive (custom or tar format) by shelling out to
 * `pg_restore`. `--no-owner --no-privileges` skips role/ACL statements so a
 * cross-server restore does not fail on missing roles; pg_restore continues
 * past per-object errors by default. Progress and errors are parsed from its
 * `--verbose` stderr.
 *
 * When `clean` is set, `--clean --if-exists` drops each object before
 * recreating it — used to REPLACE the contents of a database that already has
 * these tables (otherwise every CREATE fails with "already exists"). This
 * overwrites existing data for the archive's objects, so it is opt-in.
 */
export function runPgRestore(
  params: DriverConnectionParams,
  filePath: string,
  onProgress: (update: SqlImportProgressUpdate) => void,
  signal: AbortSignal,
  clean = false
): Promise<SqlImportOutcome> {
  return new Promise((resolve, reject) => {
    const bin = resolvePgRestore()
    const args = [
      '--host',
      params.host,
      '--port',
      String(params.port),
      '--username',
      params.username,
      '--dbname',
      params.database,
      '--no-owner',
      '--no-privileges',
      // Drop-and-recreate each object so a restore into a non-empty database
      // replaces it instead of failing on "already exists".
      ...(clean ? ['--clean', '--if-exists'] : []),
      '--verbose',
      filePath
    ]
    const child = spawn(bin, args, {
      env: {
        ...process.env,
        PGPASSWORD: params.password,
        PGSSLMODE: params.ssl === 'disable' ? 'disable' : params.ssl
      }
    })

    let items = 0
    let failedCount = 0
    const errors: string[] = []
    let stderrTail = ''

    const onAbort = (): void => {
      child.kill('SIGTERM')
    }
    signal.addEventListener('abort', onAbort)

    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-4_000)
      for (const raw of chunk.split('\n')) {
        const line = raw.trim()
        if (!line.startsWith('pg_restore:')) continue
        if (/pg_restore:\s*(error|warning):/i.test(line)) {
          failedCount += 1
          if (errors.length < MAX_ERROR_SAMPLES) {
            errors.push(line.slice(0, ERROR_MESSAGE_MAX))
          }
        } else {
          items += 1
        }
      }
      onProgress({ bytesProcessed: 0, statementCount: items })
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      signal.removeEventListener('abort', onAbort)
      reject(
        new Error(
          err.code === 'ENOENT'
            ? 'pg_restore was not found. Install the PostgreSQL client tools ' +
                '(e.g. `brew install libpq`) to import .dump / .tar archives.'
            : err.message
        )
      )
    })

    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) {
        reject(new Error('Import cancelled'))
        return
      }
      // pg_restore exits non-zero when it hit per-object errors but may still
      // have restored most of the archive — only a zero-progress failure
      // (bad credentials, unreachable host) is treated as a hard error.
      if (code !== 0 && items === 0) {
        reject(new Error(stderrTail.trim() || `pg_restore exited with code ${code}`))
        return
      }
      resolve({ statementCount: items, affectedRows: 0, failedCount, errors })
    })
  })
}

/**
 * Shells out to `pg_dump --schema-only` for a single relation and returns the
 * captured DDL. Reuses the libpq binary candidate set + PGPASSWORD/PGSSLMODE
 * env pattern so it works in packaged builds with a bare PATH.
 */
export function runPgDumpSchema(
  params: DriverConnectionParams,
  schema: string,
  table: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = resolvePgDump()
    const args = [
      '--host',
      params.host,
      '--port',
      String(params.port),
      '--username',
      params.username,
      '--dbname',
      params.database,
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '--table',
      `${schema}.${table}`
    ]
    const child = spawn(bin, args, {
      env: {
        ...process.env,
        PGPASSWORD: params.password,
        PGSSLMODE: params.ssl === 'disable' ? 'disable' : params.ssl
      }
    })

    let stdout = ''
    let stderrTail = ''

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-4_000)
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        new Error(
          err.code === 'ENOENT'
            ? 'pg_dump was not found. Install the PostgreSQL client tools ' +
                '(e.g. `brew install libpq`) to copy table DDL.'
            : err.message
        )
      )
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderrTail.trim() || `pg_dump exited with code ${code}`))
        return
      }
      resolve(stdout)
    })
  })
}
