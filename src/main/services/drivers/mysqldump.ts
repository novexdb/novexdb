import { existsSync } from 'node:fs'
import { runDumpProcess } from '@main/services/drivers/dump-stream'
import type {
  DriverConnectionParams,
  ExportOptions,
  ExportOutcome,
  ExportProgressUpdate
} from '@main/services/drivers/driver.types'

/** Common install locations — checked first, since a packaged app has a bare PATH. */
const MYSQLDUMP_CANDIDATES = [
  '/opt/homebrew/bin/mysqldump',
  '/opt/homebrew/opt/mysql-client/bin/mysqldump',
  '/usr/local/bin/mysqldump',
  '/usr/local/mysql/bin/mysqldump',
  '/usr/bin/mysqldump'
]

function resolveMysqldump(): string {
  for (const candidate of MYSQLDUMP_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return 'mysqldump'
}

/**
 * Dump a whole MySQL database with `mysqldump`, streaming stdout to a file
 * (gzipped on the way to disk for the `gzip` format). The password is passed via
 * `MYSQL_PWD` rather than argv so it doesn't leak into the process list. The
 * custom archive format is PostgreSQL-only and is rejected here.
 */
export function runMysqldump(
  params: DriverConnectionParams,
  filePath: string,
  options: ExportOptions,
  onProgress: (update: ExportProgressUpdate) => void,
  signal: AbortSignal
): Promise<ExportOutcome> {
  if (options.format === 'custom') {
    return Promise.reject(new Error('The custom archive format is only available for PostgreSQL.'))
  }

  const args = [
    '--host',
    params.host,
    '--port',
    String(params.port),
    '--user',
    params.username,
    // Consistent snapshot of InnoDB tables without locking the whole DB.
    '--single-transaction',
    '--routines',
    '--triggers'
  ]
  if (options.contents === 'schema') args.push('--no-data')
  else if (options.contents === 'data') args.push('--no-create-info')
  args.push(params.database)

  return runDumpProcess({
    bin: resolveMysqldump(),
    args,
    env: { ...process.env, MYSQL_PWD: params.password },
    filePath,
    gzip: options.format === 'gzip',
    notFoundMessage:
      'mysqldump was not found. Install the MySQL client tools ' +
      '(e.g. `brew install mysql-client`) to export a database.',
    // mysqldump has no per-object progress on stderr; progress is bytes-only.
    onProgress,
    signal
  })
}
