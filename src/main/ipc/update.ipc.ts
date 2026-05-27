import { registerQuery } from '@main/ipc/handler'
import { IpcChannels } from '@shared/ipc-contract'
import {
  checkForUpdates,
  installUpdate,
  reconfigure,
  updateStatus
} from '@main/services/updater'
import type { UpdateStatusSnapshot } from '@shared/types/update'

/**
 * Renderer-triggered update actions. Update *events* are pushed by the
 * service itself via `BrowserWindow.send` — these handlers only cover the
 * pull side: trigger a check, install, snapshot the status, reconfigure.
 *
 * All command handlers return `IpcResult<null>` so the renderer can react
 * to failures (the previous version swallowed every error).
 */
export function registerUpdateHandlers(): void {
  registerQuery<null>(IpcChannels.appUpdateCheck, async () => {
    await checkForUpdates()
    return null
  })

  registerQuery<null>(IpcChannels.appUpdateInstall, () => {
    installUpdate()
    return null
  })

  registerQuery<null>(IpcChannels.appUpdateReconfigure, async () => {
    await reconfigure()
    return null
  })

  registerQuery<UpdateStatusSnapshot>(IpcChannels.appUpdateStatus, () => {
    const snapshot = updateStatus()
    return {
      outcome: snapshot.outcome,
      packaged: snapshot.packaged,
      enabled: snapshot.config?.enabled ?? false,
      provider: snapshot.config?.provider ?? 'github',
      allowPrerelease: snapshot.config?.allowPrerelease ?? false,
      intervalMinutes: snapshot.config
        ? Math.round(snapshot.config.checkIntervalMs / 60_000)
        : 60
    }
  })
}
