import { registerConnectionHandlers } from '@main/ipc/connections.ipc'
import { registerDatabaseHandlers } from '@main/ipc/database.ipc'
import { registerQueryHandlers } from '@main/ipc/query.ipc'
import { registerTableHandlers } from '@main/ipc/table.ipc'
import { registerAiHandlers } from '@main/ipc/ai.ipc'
import { registerFileHandlers } from '@main/ipc/file.ipc'
import { registerSqlImportHandlers } from '@main/ipc/sql-import.ipc'
import { registerSettingsHandlers } from '@main/ipc/settings.ipc'
import { registerWorkspaceHandlers } from '@main/ipc/workspaces.ipc'
import { registerWindowHandlers } from '@main/ipc/window.ipc'
import { registerUpdateHandlers } from '@main/ipc/update.ipc'
import { registerIntelligenceHandlers } from '@main/ipc/intelligence.ipc'
import { registerCascadeHandlers } from '@main/ipc/cascade.ipc'

/** Wire up every IPC channel. Called once, after the app is ready. */
export function registerIpcHandlers(): void {
  registerConnectionHandlers()
  registerDatabaseHandlers()
  registerQueryHandlers()
  registerTableHandlers()
  registerAiHandlers()
  registerFileHandlers()
  registerSqlImportHandlers()
  registerSettingsHandlers()
  registerWorkspaceHandlers()
  registerWindowHandlers()
  registerUpdateHandlers()
  registerIntelligenceHandlers()
  registerCascadeHandlers()
}
