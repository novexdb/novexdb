import { promises as fs } from 'node:fs'
import { ipcMain } from 'electron'
import { connectionManager } from '@main/services/connection-manager'
import { detectDumpKind } from '@main/services/drivers/dump-format'
import type { SqlImportProgressUpdate } from '@main/services/drivers/driver.types'
import { IpcChannels } from '@shared/ipc-contract'
import { sqlImportCancelSchema, sqlImportStartSchema } from '@shared/schemas/query.schema'

/** In-flight dump imports, so `sql:import:cancel` can abort them. */
const activeImports = new Map<string, AbortController>()

/** Wire up the streaming SQL-dump import — an event-based IPC like AI chat. */
export function registerSqlImportHandlers(): void {
  ipcMain.on(IpcChannels.sqlImportStart, (event, rawPayload) => {
    const parsed = sqlImportStartSchema.safeParse(rawPayload)
    if (!parsed.success) return
    const { importId, connectionId, path } = parsed.data

    const controller = new AbortController()
    activeImports.set(importId, controller)
    const startedAt = Date.now()

    void (async () => {
      try {
        const { size: totalBytes } = await fs.stat(path)
        const kind = await detectDumpKind(path)
        const onProgress = (update: SqlImportProgressUpdate): void => {
          event.sender.send(IpcChannels.sqlImportProgress, {
            importId,
            bytesProcessed: update.bytesProcessed,
            totalBytes,
            statementCount: update.statementCount
          })
        }
        // Binary pg_dump archives can't run as SQL — restore them via pg_restore.
        const outcome =
          kind === 'archive'
            ? await connectionManager.restoreArchive(
                connectionId,
                path,
                onProgress,
                controller.signal
              )
            : await connectionManager.importSqlDump(
                connectionId,
                path,
                onProgress,
                controller.signal
              )
        event.sender.send(IpcChannels.sqlImportDone, {
          importId,
          statementCount: outcome.statementCount,
          affectedRows: outcome.affectedRows,
          failedCount: outcome.failedCount,
          errors: outcome.errors,
          durationMs: Date.now() - startedAt,
          cancelled: false
        })
      } catch (err) {
        if (controller.signal.aborted) {
          event.sender.send(IpcChannels.sqlImportDone, {
            importId,
            statementCount: 0,
            affectedRows: 0,
            failedCount: 0,
            errors: [],
            durationMs: Date.now() - startedAt,
            cancelled: true
          })
          return
        }
        event.sender.send(IpcChannels.sqlImportError, {
          importId,
          error: err instanceof Error ? err.message : String(err)
        })
      } finally {
        activeImports.delete(importId)
      }
    })()
  })

  ipcMain.on(IpcChannels.sqlImportCancel, (_event, rawPayload) => {
    const parsed = sqlImportCancelSchema.safeParse(rawPayload)
    if (!parsed.success) return
    activeImports.get(parsed.data.importId)?.abort()
  })
}
