import { registerHandler, registerQuery } from '@main/ipc/handler'
import { connectionManager } from '@main/services/connection-manager'
import { queryHistoryStore } from '@main/services/query-history-store'
import { IpcChannels } from '@shared/ipc-contract'
import {
  cancelQuerySchema,
  executeBatchSchema,
  executeQuerySchema
} from '@shared/schemas/query.schema'

export function registerQueryHandlers(): void {
  registerHandler(IpcChannels.queryExecute, executeQuerySchema, (payload) =>
    connectionManager.execute(payload.connectionId, payload.queryId, payload.sql)
  )

  registerHandler(IpcChannels.queryCancel, cancelQuerySchema, async (payload) => {
    await connectionManager.cancelQuery(payload.connectionId, payload.queryId)
    return null
  })

  registerHandler(IpcChannels.queryBatch, executeBatchSchema, (payload) =>
    connectionManager.executeStatements(payload.connectionId, payload.statements)
  )

  registerQuery(IpcChannels.historyList, () => queryHistoryStore.list())

  registerQuery(IpcChannels.historyClear, async () => {
    await queryHistoryStore.clear()
    return null
  })
}
