import { ipc } from '@renderer/services/ipc'
import { useEditorStore, type TableTab } from '@renderer/features/editor/stores/editorStore'
import {
  createTabData,
  useTableDataStore
} from '@renderer/features/table-data/stores/tableDataStore'
import { buildChangeSet, hasStagedChanges } from '@renderer/features/table-data/utils'

function tableTabOf(tabId: string): TableTab | null {
  const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId)
  return tab && tab.kind === 'table' ? tab : null
}

function tabData(tabId: string) {
  return useTableDataStore.getState().tabs[tabId] ?? createTabData()
}

/** Fetch the current page for a table tab (does not touch staged changes). */
export async function loadTablePage(tabId: string): Promise<void> {
  const tab = tableTabOf(tabId)
  if (!tab) return
  const data = tabData(tabId)
  const store = useTableDataStore.getState()
  store.setStatus(tabId, 'loading')

  const result = await ipc.table.fetch({
    connectionId: tab.connectionId,
    schema: tab.schema,
    table: tab.table,
    limit: data.pageSize,
    offset: data.pageIndex * data.pageSize,
    orderBy: data.orderBy,
    orderDir: data.orderDir,
    search: data.search
  })

  if (result.ok) useTableDataStore.getState().setData(tabId, result.data)
  else useTableDataStore.getState().setStatus(tabId, 'error', result.error.message)
}

/** Prompt before discarding staged edits when reloading/navigating. */
function confirmDiscardIfDirty(tabId: string): boolean {
  const data = useTableDataStore.getState().tabs[tabId]
  if (data && hasStagedChanges(data)) {
    return window.confirm('Discard unsaved changes and reload?')
  }
  return true
}

export function refreshTable(tabId: string): void {
  if (!confirmDiscardIfDirty(tabId)) return
  useTableDataStore.getState().clearStaged(tabId)
  void loadTablePage(tabId)
}

export function goToPage(tabId: string, pageIndex: number): void {
  if (!confirmDiscardIfDirty(tabId)) return
  useTableDataStore.getState().clearStaged(tabId)
  useTableDataStore.getState().setView(tabId, { pageIndex })
  void loadTablePage(tabId)
}

export function changePageSize(tabId: string, pageSize: number): void {
  if (!confirmDiscardIfDirty(tabId)) return
  useTableDataStore.getState().clearStaged(tabId)
  useTableDataStore.getState().setView(tabId, { pageSize, pageIndex: 0 })
  void loadTablePage(tabId)
}

const searchTimers = new Map<string, ReturnType<typeof setTimeout>>()
const SEARCH_DEBOUNCE_MS = 250

/** Debounced live search across every column. Input updates the store
 *  immediately so typing feels instant; the actual fetch fires after the
 *  user pauses, matching the dirty-check pattern of the other view changes. */
export function setTableSearch(tabId: string, term: string): void {
  useTableDataStore.getState().setView(tabId, { search: term })
  const existing = searchTimers.get(tabId)
  if (existing) clearTimeout(existing)
  const handle = setTimeout(() => {
    searchTimers.delete(tabId)
    if (!confirmDiscardIfDirty(tabId)) return
    useTableDataStore.getState().clearStaged(tabId)
    useTableDataStore.getState().setView(tabId, { pageIndex: 0 })
    void loadTablePage(tabId)
  }, SEARCH_DEBOUNCE_MS)
  searchTimers.set(tabId, handle)
}

export function toggleTableSort(tabId: string, column: string): void {
  if (!confirmDiscardIfDirty(tabId)) return
  const data = tabData(tabId)
  let orderBy: string | null = column
  let orderDir: 'asc' | 'desc' = 'asc'
  if (data.orderBy === column) {
    if (data.orderDir === 'asc') orderDir = 'desc'
    else orderBy = null
  }
  useTableDataStore.getState().clearStaged(tabId)
  useTableDataStore.getState().setView(tabId, { orderBy, orderDir, pageIndex: 0 })
  void loadTablePage(tabId)
}

/** Commit staged inserts/updates/deletes in a transaction, then reload. */
export async function saveTableChanges(
  tabId: string
): Promise<{ ok: boolean; error?: string }> {
  const tab = tableTabOf(tabId)
  const data = useTableDataStore.getState().tabs[tabId]
  if (!tab || !data?.page) return { ok: false }

  const changes = buildChangeSet(data.page, data)
  useTableDataStore.getState().setStatus(tabId, 'saving')

  const result = await ipc.table.mutate({
    connectionId: tab.connectionId,
    schema: tab.schema,
    table: tab.table,
    changes
  })

  if (result.ok) {
    useTableDataStore.getState().clearStaged(tabId)
    await loadTablePage(tabId)
    return { ok: true }
  }

  useTableDataStore.getState().setStatus(tabId, 'ready', result.error.message)
  return { ok: false, error: result.error.message }
}
