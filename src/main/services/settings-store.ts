import { JsonStore } from '@main/utils/json-store'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import type { AppSettings } from '@shared/types/settings'

/** Persists application settings; new keys fall back to DEFAULT_SETTINGS on read. */
class SettingsStore {
  private readonly store = new JsonStore<AppSettings>('settings.json', DEFAULT_SETTINGS)

  get(): Promise<AppSettings> {
    return this.store.read()
  }

  async set(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.store.read()
    const next: AppSettings = { ...current, ...patch }
    await this.store.write(next)
    return next
  }
}

export const settingsStore = new SettingsStore()
