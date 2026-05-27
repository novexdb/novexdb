import { create } from 'zustand'
import { ipc } from '@renderer/services/ipc'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import type { AppSettings } from '@shared/types/settings'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
}

/** Mirrors persisted app settings; writes are optimistic and synced to main. */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const result = await ipc.settings.get()
    set(result.ok ? { settings: result.data, loaded: true } : { loaded: true })
  },

  update: async (patch) => {
    set({ settings: { ...get().settings, ...patch } })
    const result = await ipc.settings.set(patch)
    if (result.ok) set({ settings: result.data })
  }
}))
