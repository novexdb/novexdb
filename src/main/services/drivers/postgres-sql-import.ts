import { createReadStream } from 'node:fs'
import { once } from 'node:events'
import { StringDecoder } from 'node:string_decoder'
import { Transform, type Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import type { Pool } from 'pg'
import { from as copyFrom, type CopyStreamQuery } from 'pg-copy-streams'
import { SqlTokenizer, type SqlItem } from '@main/services/drivers/sql-tokenizer'
import { detectDumpKind } from '@main/services/drivers/dump-format'
import type {
  SqlImportOutcome,
  SqlImportProgressUpdate
} from '@main/services/drivers/driver.types'

/** Flush the batched plain statements once this much SQL has accumulated. */
const BATCH_FLUSH_BYTES = 512 * 1024
/** Minimum gap between progress callbacks. */
const PROGRESS_INTERVAL_MS = 200
/** How many error messages to keep as a sample for the UI. */
const MAX_ERROR_SAMPLES = 25
const ERROR_MESSAGE_MAX = 300

/**
 * Stream a .sql dump file into the database, `psql`-style: statements run
 * without one giant transaction and the import continues past per-statement
 * errors (recording them) instead of aborting. `.sql.gz` files are decompressed
 * transparently; binary pg_dump archives are rejected with a clear message.
 */
export async function importSqlDump(
  pool: Pool,
  filePath: string,
  onProgress: (update: SqlImportProgressUpdate) => void,
  signal: AbortSignal
): Promise<SqlImportOutcome> {
  const kind = await detectDumpKind(filePath)
  if (kind === 'archive') {
    throw new Error(
      'This file is a pg_dump custom-format or tar archive, not plain SQL. ' +
        'Re-create it with `pg_dump --format=plain` (optionally piped through gzip), ' +
        'or restore it with pg_restore.'
    )
  }

  const client = await pool.connect()
  const tokenizer = new SqlTokenizer()
  const decoder = new StringDecoder('utf8')

  let bytesProcessed = 0
  let statementCount = 0
  let affectedRows = 0
  let failedCount = 0
  const errors: string[] = []
  let pendingBatch: string[] = []
  let pendingBatchBytes = 0
  let lastProgressAt = 0
  const copy: { stream: CopyStreamQuery | null } = { stream: null }

  const recordError = (message: string): void => {
    failedCount += 1
    if (errors.length < MAX_ERROR_SAMPLES) {
      errors.push(message.replace(/\s+/g, ' ').trim().slice(0, ERROR_MESSAGE_MAX))
    }
  }

  /** Run one statement on its own — an error is recorded, never thrown. */
  const runStatement = async (sql: string): Promise<void> => {
    try {
      const result = await client.query(sql)
      affectedRows += result.rowCount ?? 0
    } catch (err) {
      recordError(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Flush the pending statements. The happy path runs them as one transaction
   * for speed; if any fails, the batch is rolled back and replayed one-by-one
   * so the good statements still apply and the bad ones are isolated.
   */
  const flushBatch = async (): Promise<void> => {
    if (pendingBatch.length === 0) return
    const batch = pendingBatch
    pendingBatch = []
    pendingBatchBytes = 0
    try {
      await client.query('BEGIN')
      const result = await client.query(batch.map((sql) => `${sql};`).join('\n'))
      await client.query('COMMIT')
      const results = Array.isArray(result) ? result : [result]
      for (const r of results) affectedRows += r?.rowCount ?? 0
    } catch {
      await client.query('ROLLBACK').catch(() => undefined)
      for (const sql of batch) {
        if (signal.aborted) break
        await runStatement(sql)
      }
    }
  }

  const applyItem = async (item: SqlItem): Promise<void> => {
    switch (item.kind) {
      case 'statement':
        statementCount += 1
        pendingBatch.push(item.sql)
        pendingBatchBytes += item.sql.length
        if (pendingBatchBytes >= BATCH_FLUSH_BYTES) await flushBatch()
        break
      case 'copy': {
        statementCount += 1
        await flushBatch() // preserve ordering before the COPY
        const stream = client.query(copyFrom(item.sql))
        // Swallow async COPY errors here; they surface again at copyEnd.
        stream.on('error', () => undefined)
        copy.stream = stream
        break
      }
      case 'copyData':
        if (copy.stream?.writable && !copy.stream.write(item.text)) {
          await once(copy.stream, 'drain').catch(() => undefined)
        }
        break
      case 'copyEnd':
        if (copy.stream) {
          const stream = copy.stream
          copy.stream = null
          try {
            stream.end()
            await once(stream, 'finish')
            affectedRows += stream.rowCount ?? 0
          } catch (err) {
            recordError(err instanceof Error ? err.message : String(err))
          }
        }
        break
    }
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
        for (const item of tokenizer.feed(text)) await applyItem(item)
      }
      reportProgress(false)
    }

    const tail = decoder.end()
    if (tail) {
      for (const item of tokenizer.feed(tail)) await applyItem(item)
    }
    for (const item of tokenizer.end()) await applyItem(item)
    await flushBatch()

    if (signal.aborted) throw new Error('Import cancelled')
    reportProgress(true)
    return { statementCount, affectedRows, failedCount, errors }
  } catch (err) {
    raw.destroy()
    copy.stream?.destroy()
    throw err
  } finally {
    client.release()
  }
}
