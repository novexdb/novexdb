import { registerHandler, registerQuery } from '@main/ipc/handler'
import { workspaceStore } from '@main/services/workspace-store'
import { IpcChannels } from '@shared/ipc-contract'
import { workspaceMapSchema } from '@shared/schemas/workspaces.schema'

export function registerWorkspaceHandlers(): void {
  registerQuery(IpcChannels.workspacesGet, () => workspaceStore.get())

  registerHandler(IpcChannels.workspacesSet, workspaceMapSchema, (workspaces) =>
    workspaceStore.set(workspaces)
  )
}
