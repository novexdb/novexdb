import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { runDumpProcess } from '@main/services/drivers/dump-stream'
import type {
  DriverConnectionParams,
  ExportOptions,
  ExportOutcome,
  ExportProgressUpdate
} from '@main/services/drivers/driver.types'

const execFileAsync = promisify(execFile)

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
 * Whether the resolved dump tool understands `--set-gtid-purged`. MySQL's
 * mysqldump does; MariaDB's mariadb-dump does not. Probed once per binary via
 * `--help` (no DB connection needed) and cached.
 *
 * We pass `--set-gtid-purged=OFF` when supported so the dump omits the
 * `SET @@GLOBAL.GTID_PURGED='...'` statement mysqldump emits on a GTID-enabled
 * server. That statement is replication state, not data, and re-importing it
 * into another database on the same server (e.g. a clone) fails with
 * "the added gtid set must not overlap with @@GLOBAL.GTID_EXECUTED".
 */
const gtidFlagSupport = new Map<string, boolean>()

async function supportsSetGtidPurged(bin: string): Promise<boolean> {
  const cached = gtidFlagSupport.get(bin)
  if (cached !== undefined) return cached
  let help = ''
  try {
    const { stdout } = await execFileAsync(bin, ['--help'], { maxBuffer: 8 * 1024 * 1024 })
    help = stdout
  } catch (err) {
    // `mysqldump --help` can exit non-zero on some builds — keep whatever it
    // printed. If the binary is missing entirely, the dump itself reports it.
    help = (err as { stdout?: string }).stdout ?? ''
  }
  const supported = help.includes('set-gtid-purged')
  gtidFlagSupport.set(bin, supported)
  return supported
}

/**
 * Dump a whole MySQL database with `mysqldump`, streaming stdout to a file
 * (gzipped on the way to disk for the `gzip` format). The password is passed via
 * `MYSQL_PWD` rather than argv so it doesn't leak into the process list. The
 * custom archive format is PostgreSQL-only and is rejected here.
 */
export async function runMysqldump(
  params: DriverConnectionParams,
  filePath: string,
  options: ExportOptions,
  onProgress: (update: ExportProgressUpdate) => void,
  signal: AbortSignal
): Promise<ExportOutcome> {
  if (options.format === 'custom') {
    throw new Error('The custom archive format is only available for PostgreSQL.')
  }

  const bin = resolveMysqldump()
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
  // Drop the source's replication GTID state — it isn't part of the logical
  // data and blocks re-import into another DB on the same server (clones).
  if (await supportsSetGtidPurged(bin)) {
    args.push('--set-gtid-purged=OFF')
  }
  if (options.contents === 'schema') args.push('--no-data')
  else if (options.contents === 'data') args.push('--no-create-info')
  args.push(params.database)

  return runDumpProcess({
    bin,
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
