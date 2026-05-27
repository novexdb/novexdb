import { registerHandler, registerQuery } from '@main/ipc/handler'
import { connectionManager } from '@main/services/connection-manager'
import { IpcChannels } from '@shared/ipc-contract'
import {
  connectionIdSchema,
  createDatabaseSchema,
  scriptCreateSchema,
  switchDatabaseSchema
} from '@shared/schemas/connection.schema'

export function registerDatabaseHandlers(): void {
  registerHandler(IpcChannels.dbConnect, connectionIdSchema, (id) =>
    connectionManager.connect(id)
  )

  registerHandler(IpcChannels.dbDisconnect, connectionIdSchema, async (id) => {
    await connectionManager.disconnect(id)
    return null
  })

  registerHandler(IpcChannels.dbIntrospect, connectionIdSchema, (id) =>
    connectionManager.introspect(id)
  )

  registerHandler(IpcChannels.dbListDatabases, connectionIdSchema, (id) =>
    connectionManager.listDatabases(id)
  )

  registerHandler(IpcChannels.dbCreateDatabase, createDatabaseSchema, async (payload) => {
    await connectionManager.createDatabase(payload.connectionId, payload.name)
    return null
  })

  registerHandler(IpcChannels.dbSwitchDatabase, switchDatabaseSchema, (payload) =>
    connectionManager.switchDatabase(payload.connectionId, payload.database)
  )

  registerQuery(IpcChannels.dbActiveConnections, () =>
    connectionManager.activeConnectionIds()
  )

  registerHandler(IpcChannels.dbScriptCreate, scriptCreateSchema, (payload) =>
    connectionManager.scriptCreateTable(payload.connectionId, payload.schema, payload.table)
  )
}
