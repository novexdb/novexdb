import { promises as fs, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from 'electron'
import { JsonStore } from '@main/utils/json-store'

interface Settings {
  theme: string
  fontSize: number
}

const DEFAULTS: Settings = { theme: 'dark', fontSize: 13 }

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'jsonstore-'))
  vi.mocked(app.getPath).mockReturnValue(tmpDir)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.mocked(app.getPath).mockReset()
})

describe('JsonStore', () => {
  it('returns defaults when the file does not exist', async () => {
    const store = new JsonStore<Settings>('settings.json', DEFAULTS)
    await expect(store.read()).resolves.toEqual(DEFAULTS)
  })

  it('round-trips written values through read', async () => {
    const store = new JsonStore<Settings>('settings.json', DEFAULTS)
    await store.write({ theme: 'light', fontSize: 16 })
    await expect(store.read()).resolves.toEqual({ theme: 'light', fontSize: 16 })
  })

  it('writes via tmp + rename so the target file exists after writing', async () => {
    const store = new JsonStore<Settings>('settings.json', DEFAULTS)
    await store.write({ theme: 'light', fontSize: 16 })
    const raw = await fs.readFile(join(tmpDir, 'settings.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ theme: 'light', fontSize: 16 })
  })

  it('shallow-merges defaults over a partial persisted file', async () => {
    await fs.writeFile(
      join(tmpDir, 'settings.json'),
      JSON.stringify({ theme: 'light' }),
      'utf-8'
    )
    // A fresh instance — its cache is empty so it reads from disk.
    const store = new JsonStore<Settings>('settings.json', DEFAULTS)
    await expect(store.read()).resolves.toEqual({ theme: 'light', fontSize: 13 })
  })

  it('caches the first read — subsequent reads do not hit disk', async () => {
    const store = new JsonStore<Settings>('settings.json', DEFAULTS)
    await store.write({ theme: 'light', fontSize: 16 })
    await store.read() // populate cache

    // Mutate the file behind the store's back.
    await fs.writeFile(
      join(tmpDir, 'settings.json'),
      JSON.stringify({ theme: 'system', fontSize: 99 }),
      'utf-8'
    )
    // Still returns the cached value, not the new file contents.
    await expect(store.read()).resolves.toEqual({ theme: 'light', fontSize: 16 })
  })
})
