import { registerHandler, registerQuery } from '@main/ipc/handler'
import { connectionManager } from '@main/services/connection-manager'
import { connectionStore } from '@main/services/connection-store'
import { IpcChannels } from '@shared/ipc-contract'
import {
  connectionIdSchema,
  connectionInputSchema,
  updateConnectionSchema
} from '@shared/schemas/connection.schema'

export function registerConnectionHandlers(): void {
  registerQuery(IpcChannels.connectionsList, () => connectionStore.list())

  registerHandler(IpcChannels.connectionsCreate, connectionInputSchema, (input) =>
    connectionStore.create(input)
  )

  registerHandler(IpcChannels.connectionsUpdate, updateConnectionSchema, (payload) =>
    connectionStore.update(payload)
  )

  registerHandler(IpcChannels.connectionsDelete, connectionIdSchema, async (id) => {
    await connectionManager.disconnect(id)
    await connectionStore.delete(id)
    return null
  })

  registerHandler(IpcChannels.connectionsTest, connectionInputSchema, (input) =>
    connectionManager.test(input)
  )
}
