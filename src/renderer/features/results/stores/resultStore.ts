import { create } from 'zustand'
import type { QueryResultSet } from '@shared/types/query'

export type ResultStatus = 'idle' | 'running' | 'success' | 'error'
export type PanelTab = 'results' | 'history' | 'ai'
export type SortDir = 'asc' | 'desc'

interface ResultState {
  status: ResultStatus
  result: QueryResultSet | null
  error: string | null
  runningQueryId: string | null
  ranSql: string | null
  panelTab: PanelTab
  /** Index of the column the grid is sorted by, or null for natural order. */
  sortColumn: number | null
  sortDir: SortDir

  startRun: (queryId: string, sql: string) => void
  finishSuccess: (result: QueryResultSet) => void
  finishError: (message: string) => void
  setPanelTab: (tab: PanelTab) => void
  toggleSort: (column: number) => void
}

/** Holds the current query result, run status and result-grid view state. */
export const useResultStore = create<ResultState>((set) => ({
  status: 'idle',
  result: null,
  error: null,
  runningQueryId: null,
  ranSql: null,
  panelTab: 'results',
  sortColumn: null,
  sortDir: 'asc',

  startRun: (queryId, sql) =>
    set({
      status: 'running',
      runningQueryId: queryId,
      ranSql: sql,
      result: null,
      error: null,
      sortColumn: null
    }),

  finishSuccess: (result) =>
    set({ status: 'success', result, error: null, runningQueryId: null, sortColumn: null }),

  finishError: (message) =>
    set({ status: 'error', error: message, result: null, runningQueryId: null }),

  setPanelTab: (tab) => set({ panelTab: tab }),

  toggleSort: (column) =>
    set((state) => {
      if (state.sortColumn !== column) return { sortColumn: column, sortDir: 'asc' }
      if (state.sortDir === 'asc') return { sortColumn: column, sortDir: 'desc' }
      return { sortColumn: null, sortDir: 'asc' }
    })
}))
