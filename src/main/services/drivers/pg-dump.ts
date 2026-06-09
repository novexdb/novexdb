import { resolvePgDump } from '@main/services/drivers/pg-restore'
import { runDumpProcess } from '@main/services/drivers/dump-stream'
import type {
  DriverConnectionParams,
  ExportOptions,
  ExportOutcome,
  ExportProgressUpdate
} from '@main/services/drivers/driver.types'

/**
 * Dump a whole PostgreSQL database with `pg_dump`, streaming its stdout to a
 * file. `custom` produces a compressed binary archive (restorable via the
 * existing `runPgRestore`); `plain`/`gzip` produce SQL text (the latter gzipped
 * on the way to disk — a custom archive is already compressed and never gzipped).
 */
export function runPgDump(
  params: DriverConnectionParams,
  filePath: string,
  options: ExportOptions,
  onProgress: (update: ExportProgressUpdate) => void,
  signal: AbortSignal
): Promise<ExportOutcome> {
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
    '--verbose',
    options.format === 'custom' ? '--format=custom' : '--format=plain'
  ]
  if (options.contents === 'schema') args.push('--schema-only')
  else if (options.contents === 'data') args.push('--data-only')

  return runDumpProcess({
    bin: resolvePgDump(),
    args,
    env: {
      ...process.env,
      PGPASSWORD: params.password,
      PGSSLMODE: params.ssl === 'disable' ? 'disable' : params.ssl
    },
    filePath,
    gzip: options.format === 'gzip',
    notFoundMessage:
      'pg_dump was not found. Install the PostgreSQL client tools ' +
      '(e.g. `brew install libpq`) to export a database.',
    // pg_dump --verbose logs "pg_dump: dumping contents of table ..." per table.
    onStderr: (chunk) => {
      let dumped = 0
      for (const line of chunk.split('\n')) {
        if (/dumping contents of table/i.test(line)) dumped += 1
      }
      return dumped
    },
    onProgress,
    signal
  })
}
