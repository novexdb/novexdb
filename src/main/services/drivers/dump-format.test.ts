import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectDumpKind } from '@main/services/drivers/dump-format'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'dump-format-'))
})
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

/** Write `bytes` to a fresh file under tmpDir and return its path. */
function fixture(name: string, bytes: Buffer): string {
  const path = join(tmpDir, name)
  writeFileSync(path, bytes)
  return path
}

describe('detectDumpKind', () => {
  it('returns "gzip" for files starting with the gzip magic 1f 8b', async () => {
    const path = fixture(
      'a.sql.gz',
      Buffer.concat([Buffer.from([0x1f, 0x8b, 0x08]), Buffer.alloc(64)])
    )
    await expect(detectDumpKind(path)).resolves.toBe('gzip')
  })

  it('returns "archive" for a pg_dump custom archive (PGDMP magic)', async () => {
    const path = fixture(
      'a.dump',
      Buffer.concat([Buffer.from('PGDMP', 'latin1'), Buffer.alloc(64)])
    )
    await expect(detectDumpKind(path)).resolves.toBe('archive')
  })

  it('returns "archive" for a tar file (ustar at offset 257)', async () => {
    const head = Buffer.alloc(512)
    head.write('ustar', 257, 'latin1')
    await expect(detectDumpKind(fixture('a.tar', head))).resolves.toBe('archive')
  })

  it('returns "plain" for ordinary SQL text', async () => {
    const path = fixture('a.sql', Buffer.from('-- a dump\nSELECT 1;\n', 'utf-8'))
    await expect(detectDumpKind(path)).resolves.toBe('plain')
  })

  it('returns "plain" for a short, non-magic file', async () => {
    await expect(detectDumpKind(fixture('a.sql', Buffer.from('hi')))).resolves.toBe('plain')
  })
})
