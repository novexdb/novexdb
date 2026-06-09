import { spawn } from 'node:child_process'
import { createWriteStream, promises as fs } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import type { ExportOutcome, ExportProgressUpdate } from '@main/services/drivers/driver.types'

const STDERR_TAIL_BYTES = 4_000

export interface DumpProcessSpec {
  bin: string
  args: string[]
  env: NodeJS.ProcessEnv
  /** Destination file. The dump streams straight here; it never crosses IPC. */
  filePath: string
  /** Gzip the process stdout before writing to disk. */
  gzip: boolean
  /** Friendly message for ENOENT (binary not installed). */
  notFoundMessage: string
  /** Optional per-chunk stderr parser → number of objects newly dumped. */
  onStderr?: (chunk: string) => number
  onProgress: (update: ExportProgressUpdate) => void
  signal: AbortSignal
}

/**
 * Spawn a dump binary (pg_dump / mysqldump) and stream its stdout —
 * optionally gzip-compressed — straight to `filePath`, counting bytes for
 * progress. SIGTERMs the child on abort, deletes the partial file on any
 * error/cancel, and resolves only once the process has exited cleanly AND the
 * file has finished flushing.
 */
export function runDumpProcess(spec: DumpProcessSpec): Promise<ExportOutcome> {
  const { bin, args, env, filePath, gzip, notFoundMessage, onStderr, onProgress, signal } = spec
  return new Promise<ExportOutcome>((resolve, reject) => {
    let bytesWritten = 0
    let objectCount = 0
    let stderrTail = ''
    let settled = false
    let exited = false
    let exitCode: number | null = null
    let fileFlushed = false

    const child = spawn(bin, args, { env })
    const out = createWriteStream(filePath)
    // Count post-compression bytes hitting disk — honest progress.
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytesWritten += chunk.length
        cb(null, chunk)
      }
    })

    const settle = (err?: Error): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      if (err) {
        out.destroy()
        void fs
          .rm(filePath, { force: true })
          .catch(() => undefined)
          .then(() => reject(err))
      } else {
        onProgress({ bytesWritten, objectCount })
        resolve({ bytesWritten })
      }
    }

    const tryFinish = (): void => {
      if (settled || !exited || !fileFlushed) return
      if (signal.aborted) {
        settle(new Error('Export cancelled'))
        return
      }
      if (exitCode !== 0) {
        settle(new Error(stderrTail.trim() || `${bin} exited with code ${exitCode}`))
        return
      }
      settle()
    }

    function onAbort(): void {
      child.kill('SIGTERM')
    }
    signal.addEventListener('abort', onAbort)

    child.on('error', (err: NodeJS.ErrnoException) => {
      settle(new Error(err.code === 'ENOENT' ? notFoundMessage : err.message))
    })

    if (!child.stdout || !child.stderr) {
      settle(new Error(`${bin} produced no output stream`))
      return
    }

    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES)
      if (onStderr) objectCount += onStderr(chunk)
      onProgress({ bytesWritten, objectCount })
    })

    const flush = gzip
      ? pipeline(child.stdout, createGzip(), counter, out)
      : pipeline(child.stdout, counter, out)
    flush
      .then(() => {
        fileFlushed = true
        tryFinish()
      })
      .catch((err: Error) => {
        // On abort the SIGTERM tears the pipe down — that error is expected.
        if (!signal.aborted) settle(err)
        else {
          fileFlushed = true
          tryFinish()
        }
      })

    child.on('close', (code) => {
      exited = true
      exitCode = code
      tryFinish()
    })
  })
}
