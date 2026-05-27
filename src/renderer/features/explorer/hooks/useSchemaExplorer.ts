import { useMemo } from 'react'
import { ipc } from '@renderer/services/ipc'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'

export interface SchemaExplorerActions {
  /** Introspect a connection's database and store the resulting snapshot. */
  introspect: (connectionId: string) => Promise<void>
}

export function useSchemaExplorer(): SchemaExplorerActions {
  return useMemo<SchemaExplorerActions>(
    () => ({
      introspect: async (connectionId) => {
        const store = useExplorerStore.getState
        store().setLoading(connectionId, true)
        store().setError(connectionId, null)

        const result = await ipc.database.introspect(connectionId)

        if (result.ok) store().setSnapshot(connectionId, result.data)
        else store().setError(connectionId, result.error.message)
        store().setLoading(connectionId, false)
      }
    }),
    []
  )
}
