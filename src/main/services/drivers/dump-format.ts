import { createReadStream } from 'node:fs'
import type { SqlImportKind } from '@shared/types/query'

/**
 * Classify a dump file from its first bytes:
 * - `gzip`    — gzip-compressed (magic `1f 8b`); plain SQL once decompressed.
 * - `archive` — a binary pg_dump custom-format (`PGDMP`) or tar archive
 *               (`ustar` at offset 257); must be restored with pg_restore.
 * - `plain`   — anything else, treated as plain SQL text.
 */
export async function detectDumpKind(filePath: string): Promise<SqlImportKind> {
  const chunks: Buffer[] = []
  for await (const chunk of createReadStream(filePath, { start: 0, end: 511 })) {
    chunks.push(chunk as Buffer)
  }
  const head = Buffer.concat(chunks)
  if (head[0] === 0x1f && head[1] === 0x8b) return 'gzip'
  if (head.subarray(0, 5).toString('latin1') === 'PGDMP') return 'archive'
  if (head.length > 262 && head.subarray(257, 262).toString('latin1') === 'ustar') {
    return 'archive'
  }
  return 'plain'
}
