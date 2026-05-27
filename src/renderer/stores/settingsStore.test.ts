import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import type * as SettingsStoreModuleNs from '@renderer/stores/settingsStore'

// Hoisted so the `vi.mock` factory below can reference these fakes. Each test
// reassigns the implementations before invoking the store.
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn()
}))

vi.mock('@renderer/services/ipc', () => ({
  ipc: {
    settings: {
      get: mocks.get,
      set: mocks.set
    }
  }
}))

// Lazily import the store so the mock is in place at module-eval time.
async function freshStore(): Promise<typeof SettingsStoreModuleNs> {
  vi.resetModules()
  return await import('@renderer/stores/settingsStore')
}

beforeEach(() => {
  mocks.get.mockReset()
  mocks.set.mockReset()
})

describe('settingsStore — load', () => {
  it('replaces state on success', async () => {
    const remote = { ...DEFAULT_SETTINGS, fontSize: 16 }
    mocks.get.mockResolvedValueOnce({ ok: true, data: remote })
    const { useSettingsStore } = await freshStore()
    await useSettingsStore.getState().load()
    const s = useSettingsStore.getState()
    expect(s.settings.fontSize).toBe(16)
    expect(s.loaded).toBe(true)
  })

  it('leaves DEFAULT_SETTINGS in place on failure but flags loaded=true', async () => {
    mocks.get.mockResolvedValueOnce({ ok: false, error: { code: 'X', message: 'bad' } })
    const { useSettingsStore } = await freshStore()
    await useSettingsStore.getState().load()
    const s = useSettingsStore.getState()
    expect(s.settings).toEqual(DEFAULT_SETTINGS)
    expect(s.loaded).toBe(true)
  })
})

describe('settingsStore — update', () => {
  it('optimistically applies the patch immediately', async () => {
    // Block the IPC reply so we can observe the optimistic state.
    let resolveReply: (value: { ok: true; data: typeof DEFAULT_SETTINGS }) => void = () => undefined
    mocks.set.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReply = resolve
      })
    )
    const { useSettingsStore } = await freshStore()
    const promise = useSettingsStore.getState().update({ fontSize: 18 })
    expect(useSettingsStore.getState().settings.fontSize).toBe(18)
    resolveReply({ ok: true, data: { ...DEFAULT_SETTINGS, fontSize: 18 } })
    await promise
  })

  it('reconciles to the main process value on success', async () => {
    mocks.set.mockResolvedValueOnce({
      ok: true,
      data: { ...DEFAULT_SETTINGS, fontSize: 20 }
    })
    const { useSettingsStore } = await freshStore()
    await useSettingsStore.getState().update({ fontSize: 18 })
    expect(useSettingsStore.getState().settings.fontSize).toBe(20)
  })

  it('keeps the optimistic value on failure (no rollback)', async () => {
    mocks.set.mockResolvedValueOnce({ ok: false, error: { code: 'X', message: 'bad' } })
    const { useSettingsStore } = await freshStore()
    await useSettingsStore.getState().update({ fontSize: 18 })
    expect(useSettingsStore.getState().settings.fontSize).toBe(18)
  })
})
