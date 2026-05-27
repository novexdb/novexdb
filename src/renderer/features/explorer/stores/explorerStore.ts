import { create } from 'zustand'
import type { SchemaSnapshot } from '@shared/types/schema'

interface ExplorerState {
  /** Schema snapshots keyed by connection id. */
  snapshots: Record<string, SchemaSnapshot>
  loading: Record<string, boolean>
  errors: Record<string, string>
  /** Ids of expanded tree nodes. */
  expanded: Set<string>
  filter: string

  setSnapshot: (connectionId: string, snapshot: SchemaSnapshot) => void
  setLoading: (connectionId: string, loading: boolean) => void
  setError: (connectionId: string, error: string | null) => void
  clearConnection: (connectionId: string) => void
  toggleNode: (nodeId: string) => void
  expandNodes: (nodeIds: string[]) => void
  setFilter: (filter: string) => void
}

/** Holds introspected schema snapshots and explorer tree UI state. */
export const useExplorerStore = create<ExplorerState>((set) => ({
  snapshots: {},
  loading: {},
  errors: {},
  expanded: new Set<string>(),
  filter: '',

  setSnapshot: (connectionId, snapshot) =>
    set((state) => {
      // On the *first* snapshot for a connection, expand the per-schema Tables
      // folder so the most-used branch lands open. Subsequent refreshes leave
      // the expanded set alone — manual collapses stay collapsed.
      const isFirstLoad = !state.snapshots[connectionId]
      const expanded = isFirstLoad ? new Set(state.expanded) : state.expanded
      if (isFirstLoad) {
        for (const schema of snapshot.schemas) {
          // Open the schema folder *and* its Tables group so the most-used
          // branch is visible without a click.
          expanded.add(`schema:${schema}`)
          expanded.add(`group:${schema}.tables`)
        }
      }
      return {
        snapshots: { ...state.snapshots, [connectionId]: snapshot },
        expanded
      }
    }),

  setLoading: (connectionId, loading) =>
    set((state) => ({ loading: { ...state.loading, [connectionId]: loading } })),

  setError: (connectionId, error) =>
    set((state) => {
      const errors = { ...state.errors }
      if (error) errors[connectionId] = error
      else delete errors[connectionId]
      return { errors }
    }),

  clearConnection: (connectionId) =>
    set((state) => {
      const snapshots = { ...state.snapshots }
      const loading = { ...state.loading }
      const errors = { ...state.errors }
      delete snapshots[connectionId]
      delete loading[connectionId]
      delete errors[connectionId]
      return { snapshots, loading, errors }
    }),

  toggleNode: (nodeId) =>
    set((state) => {
      const expanded = new Set(state.expanded)
      if (expanded.has(nodeId)) expanded.delete(nodeId)
      else expanded.add(nodeId)
      return { expanded }
    }),

  expandNodes: (nodeIds) =>
    set((state) => {
      const expanded = new Set(state.expanded)
      for (const id of nodeIds) expanded.add(id)
      return { expanded }
    }),

  setFilter: (filter) => set({ filter })
}))
