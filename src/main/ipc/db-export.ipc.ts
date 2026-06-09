import { ipcMain } from 'electron'
import { connectionManager } from '@main/services/connection-manager'
import type { ExportProgressUpdate } from '@main/services/drivers/driver.types'
import { IpcChannels } from '@shared/ipc-contract'
import { dbExportCancelSchema, dbExportStartSchema } from '@shared/schemas/query.schema'

/** In-flight exports, so `db:export:cancel` can abort them. */
const activeExports = new Map<string, AbortController>()

const PROGRESS_THROTTLE_MS = 150

/** Wire up the streaming database export — an event-based IPC like SQL import. */
export function registerDbExportHandlers(): void {
  ipcMain.on(IpcChannels.dbExportStart, (event, rawPayload) => {
    const parsed = dbExportStartSchema.safeParse(rawPayload)
    if (!parsed.success) return
    const { exportId, connectionId, path, format, contents } = parsed.data

    const controller = new AbortController()
    activeExports.set(exportId, controller)
    const startedAt = Date.now()
    let lastSent = 0

    const onProgress = (update: ExportProgressUpdate): void => {
      const now = Date.now()
      if (now - lastSent < PROGRESS_THROTTLE_MS) return
      lastSent = now
      event.sender.send(IpcChannels.dbExportProgress, {
        exportId,
        bytesWritten: update.bytesWritten,
        objectCount: update.objectCount
      })
    }

    void (async () => {
      try {
        const outcome = await connectionManager.exportDatabase(
          connectionId,
          path,
          { format, contents },
          onProgress,
          controller.signal
        )
        event.sender.send(IpcChannels.dbExportDone, {
          exportId,
          path,
          bytesWritten: outcome.bytesWritten,
          durationMs: Date.now() - startedAt,
          cancelled: false
        })
      } catch (err) {
        if (controller.signal.aborted) {
          event.sender.send(IpcChannels.dbExportDone, {
            exportId,
            path,
            bytesWritten: 0,
            durationMs: Date.now() - startedAt,
            cancelled: true
          })
          return
        }
        event.sender.send(IpcChannels.dbExportError, {
          exportId,
          error: err instanceof Error ? err.message : String(err)
        })
      } finally {
        activeExports.delete(exportId)
      }
    })()
  })

  ipcMain.on(IpcChannels.dbExportCancel, (_event, rawPayload) => {
    const parsed = dbExportCancelSchema.safeParse(rawPayload)
    if (!parsed.success) return
    activeExports.get(parsed.data.exportId)?.abort()
  })
}
