import { registerHandler } from '@main/ipc/handler'
import { connectionManager } from '@main/services/connection-manager'
import { IpcChannels } from '@shared/ipc-contract'
import { tableFetchSchema, tableMutateSchema } from '@shared/schemas/table-data.schema'

export function registerTableHandlers(): void {
  registerHandler(IpcChannels.tableFetch, tableFetchSchema, (payload) =>
    connectionManager.fetchTable(payload)
  )

  registerHandler(IpcChannels.tableMutate, tableMutateSchema, (payload) =>
    connectionManager.mutateTable(payload)
  )
}
