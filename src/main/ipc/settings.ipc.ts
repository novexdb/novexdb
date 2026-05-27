import { registerHandler, registerQuery } from '@main/ipc/handler'
import { settingsStore } from '@main/services/settings-store'
import { IpcChannels } from '@shared/ipc-contract'
import { appSettingsPatchSchema } from '@shared/schemas/settings.schema'

export function registerSettingsHandlers(): void {
  registerQuery(IpcChannels.settingsGet, () => settingsStore.get())

  registerHandler(IpcChannels.settingsSet, appSettingsPatchSchema, (patch) =>
    settingsStore.set(patch)
  )
}
