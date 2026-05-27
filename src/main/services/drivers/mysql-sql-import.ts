import { createReadStream } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import { Transform, type Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import type { Connection, ResultSetHeader } from 'mysql2/promise'
import { SqlTokenizer } from '@main/services/drivers/sql-tokenizer'
import { detectDumpKind } from '@main/services/drivers/dump-format'
import type {
  SqlImportOutcome,
  SqlImportProgressUpdate
} from '@main/services/drivers/driver.types'

/** Flush the batched statements once this much SQL has accumulated. */
const BATCH_FLUSH_BYTES = 512 * 1024
/** Minimum gap between progress callbacks. */
const PROGRESS_INTERVAL_MS = 200

/**
 * Stream a MySQL .sql dump into the database over a dedicated connection (which
 * must have `multipleStatements` enabled). `.sql.gz` files are decompressed
 * transparently; binary archives are rejected with a clear message. The file is
 * read in chunks and never fully materialised.
 */
export async function importMysqlDump(
  connection: Connection,
  filePath: string,
  onProgress: (update: SqlImportProgressUpdate) => void,
  signal: AbortSignal
): Promise<SqlImportOutcome> {
  const kind = await detectDumpKind(filePath)
  if (kind === 'archive') {
    throw new Error(
      'This file is a binary archive, not plain SQL. Export the dump as a ' +
        'plain .sql file (optionally gzip-compressed) and try again.'
    )
  }

  const tokenizer = new SqlTokenizer({ mysql: true })
  const decoder = new StringDecoder('utf8')

  let bytesProcessed = 0
  let statementCount = 0
  let affectedRows = 0
  let pendingBatch = ''
  let lastProgressAt = 0

  const flushBatch = async (): Promise<void> => {
    if (!pendingBatch) return
    const sql = pendingBatch
    pendingBatch = ''
    const [result] = await connection.query(sql)
    const results = Array.isArray(result) ? result : [result]
    for (const row of results) {
      affectedRows += (row as ResultSetHeader | undefined)?.affectedRows ?? 0
    }
  }

  const addStatement = async (sql: string, flush: boolean): Promise<void> => {
    statementCount += 1
    pendingBatch += `${sql};\n`
    if (flush && pendingBatch.length >= BATCH_FLUSH_BYTES) await flushBatch()
  }

  const reportProgress = (force: boolean): void => {
    const now = Date.now()
    if (force || now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
      lastProgressAt = now
      onProgress({ bytesProcessed, statementCount })
    }
  }

  // Pipeline: file → byte counter (for progress) → gunzip when compressed.
  const raw = createReadStream(filePath)
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesProcessed += chunk.length
      callback(null, chunk)
    }
  })
  let source: Readable = raw.pipe(counter)
  if (kind === 'gzip') source = source.pipe(createGunzip())

  try {
    for await (const chunk of source) {
      if (signal.aborted) throw new Error('Import cancelled')
      const text = decoder.write(chunk as Buffer)
      if (text) {
        for (const item of tokenizer.feed(text)) {
          if (item.kind === 'statement') await addStatement(item.sql, true)
        }
      }
      reportProgress(false)
    }

    const tail = decoder.end()
    if (tail) {
      for (const item of tokenizer.feed(tail)) {
        if (item.kind === 'statement') await addStatement(item.sql, false)
      }
    }
    for (const item of tokenizer.end()) {
      if (item.kind === 'statement') await addStatement(item.sql, false)
    }
    await flushBatch()

    if (signal.aborted) throw new Error('Import cancelled')
    reportProgress(true)
    return { statementCount, affectedRows, failedCount: 0, errors: [] }
  } catch (err) {
    raw.destroy()
    throw err
  }
}
