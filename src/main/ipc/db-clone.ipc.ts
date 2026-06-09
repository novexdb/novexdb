import { ipcMain } from 'electron'
import { connectionManager } from '@main/services/connection-manager'
import { IpcChannels } from '@shared/ipc-contract'
import { dbCloneCancelSchema, dbCloneStartSchema } from '@shared/schemas/query.schema'

/** In-flight clones, so `db:clone:cancel` can abort them. */
const activeClones = new Map<string, AbortController>()

const PROGRESS_THROTTLE_MS = 150

/** Wire up the streaming database clone — an event-based IPC like export/import. */
export function registerDbCloneHandlers(): void {
  ipcMain.on(IpcChannels.dbCloneStart, (event, rawPayload) => {
    const parsed = dbCloneStartSchema.safeParse(rawPayload)
    if (!parsed.success) return
    const { cloneId, sourceConnectionId, targetConnectionId, targetDatabase } = parsed.data

    const controller = new AbortController()
    activeClones.set(cloneId, controller)
    const startedAt = Date.now()
    let lastSent = 0

    const onProgress = (update: {
      phase: 'export' | 'import'
      bytes: number
      count: number
    }): void => {
      const now = Date.now()
      if (now - lastSent < PROGRESS_THROTTLE_MS) return
      lastSent = now
      event.sender.send(IpcChannels.dbCloneProgress, { cloneId, ...update })
    }

    void (async () => {
      try {
        const targetConnection = await connectionManager.cloneDatabase(
          sourceConnectionId,
          targetConnectionId,
          targetDatabase,
          onProgress,
          controller.signal
        )
        event.sender.send(IpcChannels.dbCloneDone, {
          cloneId,
          durationMs: Date.now() - startedAt,
          cancelled: false,
          targetConnection
        })
      } catch (err) {
        if (controller.signal.aborted) {
          event.sender.send(IpcChannels.dbCloneDone, {
            cloneId,
            durationMs: Date.now() - startedAt,
            cancelled: true
          })
          return
        }
        event.sender.send(IpcChannels.dbCloneError, {
          cloneId,
          error: err instanceof Error ? err.message : String(err)
        })
      } finally {
        activeClones.delete(cloneId)
      }
    })()
  })

  ipcMain.on(IpcChannels.dbCloneCancel, (_event, rawPayload) => {
    const parsed = dbCloneCancelSchema.safeParse(rawPayload)
    if (!parsed.success) return
    activeClones.get(parsed.data.cloneId)?.abort()
  })
}
