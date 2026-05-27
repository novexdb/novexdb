import { useMemo } from 'react'
import { ipc } from '@renderer/services/ipc'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'
import type {
  Connection,
  ConnectionInput,
  ConnectionTestResult
} from '@shared/types/connection'
import type { ActiveConnectionInfo } from '@shared/types/database'
import type { IpcResult } from '@shared/types/ipc'

export interface ConnectionActions {
  refresh: () => Promise<void>
  create: (input: ConnectionInput) => Promise<IpcResult<Connection>>
  update: (id: string, changes: Partial<ConnectionInput>) => Promise<IpcResult<Connection>>
  remove: (id: string) => Promise<IpcResult<null>>
  test: (input: ConnectionInput) => Promise<IpcResult<ConnectionTestResult>>
  connect: (id: string) => Promise<IpcResult<ActiveConnectionInfo>>
  disconnect: (id: string) => Promise<void>
}

/**
 * Connection side-effects: every call talks to main over IPC and reconciles the
 * connectionStore. The returned object is stable, so it is safe in deps arrays.
 */
export function useConnections(): ConnectionActions {
  return useMemo<ConnectionActions>(() => {
    const store = useConnectionStore.getState

    return {
      refresh: async () => {
        const result = await ipc.connections.list()
        if (result.ok) store().setConnections(result.data)
        store().setLoaded(true)
      },

      create: async (input) => {
        const result = await ipc.connections.create(input)
        if (result.ok) store().upsertConnection(result.data)
        return result
      },

      update: async (id, changes) => {
        const result = await ipc.connections.update({ id, changes })
        if (result.ok) store().upsertConnection(result.data)
        return result
      },

      remove: async (id) => {
        const result = await ipc.connections.delete(id)
        if (result.ok) {
          store().removeConnection(id)
          useExplorerStore.getState().clearConnection(id)
        }
        return result
      },

      test: (input) => ipc.connections.test(input),

      connect: async (id) => {
        store().setStatus(id, 'connecting')
        const result = await ipc.database.connect(id)
        store().setStatus(id, result.ok ? 'connected' : 'error')
        if (result.ok) store().setActive(id)
        return result
      },

      disconnect: async (id) => {
        await ipc.database.disconnect(id)
        store().setStatus(id, 'disconnected')
        useExplorerStore.getState().clearConnection(id)
        if (store().activeConnectionId === id) store().setActive(null)
      }
    }
  }, [])
}
