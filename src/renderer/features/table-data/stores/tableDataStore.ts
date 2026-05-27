import { create } from 'zustand'
import { DEFAULT_PAGE_SIZE } from '@shared/types/table-data'
import type { TableDataPage } from '@shared/types/table-data'

export type TableTabStatus = 'idle' | 'loading' | 'error' | 'ready' | 'saving'

export interface NewRow {
  tempId: string
  values: Record<string, unknown>
}

/** All view + staging state for one open table-data tab. */
export interface TableTabData {
  page: TableDataPage | null
  status: TableTabStatus
  error: string | null
  pageIndex: number
  pageSize: number
  orderBy: string | null
  orderDir: 'asc' | 'desc'
  /** Server-side filter applied to every column as text. Empty = no filter. */
  search: string
  /** Staged edits to existing rows: rowKey -> { columnName: newValue }. */
  edits: Record<string, Record<string, unknown>>
  newRows: NewRow[]
  /** rowKeys of existing rows staged for deletion. */
  deleted: string[]
  /** rowKeys of checkbox-selected existing rows. */
  selected: string[]
  /** User-adjusted column widths in pixels, keyed by column name. */
  columnWidths: Record<string, number>
}

export function createTabData(): TableTabData {
  return {
    page: null,
    status: 'idle',
    error: null,
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    orderBy: null,
    orderDir: 'asc',
    search: '',
    edits: {},
    newRows: [],
    deleted: [],
    selected: [],
    columnWidths: {}
  }
}

interface ViewPatch {
  pageIndex?: number
  pageSize?: number
  orderBy?: string | null
  orderDir?: 'asc' | 'desc'
  search?: string
}

interface TableDataState {
  tabs: Record<string, TableTabData>

  setStatus: (tabId: string, status: TableTabStatus, error?: string | null) => void
  setData: (tabId: string, page: TableDataPage) => void
  setView: (tabId: string, patch: ViewPatch) => void
  editExisting: (tabId: string, rowKey: string, column: string, value: unknown) => void
  addRow: (tabId: string) => void
  editNewRow: (tabId: string, tempId: string, column: string, value: unknown) => void
  discardNewRow: (tabId: string, tempId: string) => void
  toggleDeleted: (tabId: string, rowKey: string) => void
  toggleSelected: (tabId: string, rowKey: string) => void
  deleteSelected: (tabId: string) => void
  setColumnWidth: (tabId: string, column: string, width: number) => void
  clearStaged: (tabId: string) => void
  dropTab: (tabId: string) => void
}

/** Holds per-tab table-data state, keyed by workspace tab id. */
export const useTableDataStore = create<TableDataState>((set) => {
  const patch = (
    tabId: string,
    updater: (current: TableTabData) => TableTabData
  ): void =>
    set((state) => ({
      tabs: { ...state.tabs, [tabId]: updater(state.tabs[tabId] ?? createTabData()) }
    }))

  return {
    tabs: {},

    setStatus: (tabId, status, error = null) =>
      patch(tabId, (current) => ({ ...current, status, error })),

    setData: (tabId, page) =>
      patch(tabId, (current) => ({ ...current, page, status: 'ready', error: null })),

    setView: (tabId, view) => patch(tabId, (current) => ({ ...current, ...view })),

    editExisting: (tabId, rowKey, column, value) =>
      patch(tabId, (current) => ({
        ...current,
        edits: {
          ...current.edits,
          [rowKey]: { ...current.edits[rowKey], [column]: value }
        }
      })),

    addRow: (tabId) =>
      patch(tabId, (current) => ({
        ...current,
        newRows: [...current.newRows, { tempId: crypto.randomUUID(), values: {} }]
      })),

    editNewRow: (tabId, tempId, column, value) =>
      patch(tabId, (current) => ({
        ...current,
        newRows: current.newRows.map((row) =>
          row.tempId === tempId
            ? { ...row, values: { ...row.values, [column]: value } }
            : row
        )
      })),

    discardNewRow: (tabId, tempId) =>
      patch(tabId, (current) => ({
        ...current,
        newRows: current.newRows.filter((row) => row.tempId !== tempId)
      })),

    toggleDeleted: (tabId, rowKey) =>
      patch(tabId, (current) => ({
        ...current,
        deleted: current.deleted.includes(rowKey)
          ? current.deleted.filter((key) => key !== rowKey)
          : [...current.deleted, rowKey]
      })),

    toggleSelected: (tabId, rowKey) =>
      patch(tabId, (current) => ({
        ...current,
        selected: current.selected.includes(rowKey)
          ? current.selected.filter((key) => key !== rowKey)
          : [...current.selected, rowKey]
      })),

    deleteSelected: (tabId) =>
      patch(tabId, (current) => ({
        ...current,
        deleted: [...new Set([...current.deleted, ...current.selected])],
        selected: []
      })),

    setColumnWidth: (tabId, column, width) =>
      patch(tabId, (current) => ({
        ...current,
        columnWidths: { ...current.columnWidths, [column]: width }
      })),

    clearStaged: (tabId) =>
      patch(tabId, (current) => ({
        ...current,
        edits: {},
        newRows: [],
        deleted: [],
        selected: []
      })),

    dropTab: (tabId) =>
      set((state) => {
        if (!(tabId in state.tabs)) return state
        const tabs = { ...state.tabs }
        delete tabs[tabId]
        return { tabs }
      })
  }
})
