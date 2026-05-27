import { create } from 'zustand'
import { ipc } from '@renderer/services/ipc'
import type { QueryHistoryEntry } from '@shared/types/history'

interface HistoryState {
  entries: QueryHistoryEntry[]
  loading: boolean
  load: () => Promise<void>
  clear: () => Promise<void>
}

/** Mirrors the persisted query-execution history from the main process. */
export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const result = await ipc.history.list()
    set({ entries: result.ok ? result.data : [], loading: false })
  },

  clear: async () => {
    const result = await ipc.history.clear()
    if (result.ok) set({ entries: [] })
  }
}))
