import { create } from 'zustand'
import type { Connection } from '@shared/types/connection'
import type { ConnectionStatus } from '@shared/types/database'

interface ConnectionStoreState {
  connections: Connection[]
  statuses: Record<string, ConnectionStatus>
  activeConnectionId: string | null
  loaded: boolean

  /** Connection editor modal — `editorTarget === null` means create mode. */
  editorOpen: boolean
  editorTarget: Connection | null

  setConnections: (connections: Connection[]) => void
  upsertConnection: (connection: Connection) => void
  removeConnection: (id: string) => void
  setStatus: (id: string, status: ConnectionStatus) => void
  setActive: (id: string | null) => void
  setLoaded: (loaded: boolean) => void
  openEditor: (target: Connection | null) => void
  closeEditor: () => void
}

/** Holds connection data and editor UI state. Async work lives in useConnections. */
export const useConnectionStore = create<ConnectionStoreState>((set) => ({
  connections: [],
  statuses: {},
  activeConnectionId: null,
  loaded: false,
  editorOpen: false,
  editorTarget: null,

  setConnections: (connections) => set({ connections }),

  upsertConnection: (connection) =>
    set((state) => {
      const exists = state.connections.some((c) => c.id === connection.id)
      return {
        connections: exists
          ? state.connections.map((c) => (c.id === connection.id ? connection : c))
          : [...state.connections, connection]
      }
    }),

  removeConnection: (id) =>
    set((state) => {
      const { [id]: _dropped, ...statuses } = state.statuses
      return {
        connections: state.connections.filter((c) => c.id !== id),
        statuses,
        activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId
      }
    }),

  setStatus: (id, status) =>
    set((state) => ({ statuses: { ...state.statuses, [id]: status } })),

  setActive: (id) => set({ activeConnectionId: id }),

  setLoaded: (loaded) => set({ loaded }),

  openEditor: (target) => set({ editorOpen: true, editorTarget: target }),

  closeEditor: () => set({ editorOpen: false, editorTarget: null })
}))
