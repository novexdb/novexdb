import { create } from 'zustand'
import { useTableDataStore } from '@renderer/features/table-data/stores/tableDataStore'

export interface QueryTab {
  id: string
  kind: 'query'
  title: string
  sql: string
}

/** Which side of the data-viewer to show when this tab opens. */
export type TableTabInitialView = 'data' | 'structure'

export interface TableTab {
  id: string
  kind: 'table'
  title: string
  connectionId: string
  schema: string
  table: string
  /** Optional — read once on mount to land on Data or Structure. */
  initialView?: TableTabInitialView
  /** VS Code-style preview tab: opened on a single click, shown in italics
   *  and reused (replaced) by the next single click. Promoted to a permanent
   *  tab on double-click, drag, or when the same table is opened deliberately. */
  preview?: boolean
}

export interface OverviewTab {
  id: string
  kind: 'overview'
  title: string
  connectionId: string
  schema: string
}

export interface IntelligenceTab {
  id: string
  kind: 'intelligence'
  title: string
  // Intentionally no connectionId — the dashboard follows the currently
  // active connection, so the same tab is reused when the user switches.
}

export interface AnomaliesTab {
  id: string
  kind: 'anomalies'
  title: string
  // Same pattern as IntelligenceTab — follows the active connection.
}

export type WorkspaceTab = QueryTab | TableTab | OverviewTab | IntelligenceTab | AnomaliesTab

/** The slice of state that's scoped to one workspace (a connection+database pair). */
export interface WorkspaceState {
  tabs: WorkspaceTab[]
  activeTabId: string
  nextNumber: number
}

/** Workspace key used before any connection is active. */
export const NO_WORKSPACE_KEY = '__none__'

/** Build the workspace key for a connection+database pair. */
export function workspaceKeyFor(
  connectionId: string | null | undefined,
  database: string | null | undefined
): string {
  if (!connectionId || !database) return NO_WORKSPACE_KEY
  return `${connectionId}:${database}`
}

interface EditorState extends WorkspaceState {
  /** Every workspace *other than* the current one. The current workspace's
   *  state lives in the top-level `tabs` / `activeTabId` / `nextNumber` so
   *  existing selectors keep working without a layer of indirection. */
  savedWorkspaces: Record<string, WorkspaceState>
  currentKey: string

  createTab: (sql?: string) => void
  openTableTab: (
    connectionId: string,
    schema: string,
    table: string,
    initialView?: TableTabInitialView,
    opts?: { preview?: boolean }
  ) => void
  /** Pin a preview tab so the next single-click no longer replaces it. */
  promoteTab: (id: string) => void
  openOverviewTab: (connectionId: string, schema: string) => void
  openIntelligenceTab: () => void
  openAnomaliesTab: () => void
  closeTab: (id: string) => void
  /** Bulk close — replaces the workspace with a single fresh Query tab. */
  closeAllTabs: () => void
  setActiveTab: (id: string) => void
  updateTabSql: (id: string, sql: string) => void
  /** Move `fromId` to the position before/after `toId`. No-op when the
   *  indices coincide (e.g. dropping a tab onto itself). */
  reorderTab: (fromId: string, toId: string, side: 'before' | 'after') => void

  /** Save the current workspace under its key and load `key` (seeded fresh
   *  if no saved state exists). No-op when already on `key`. */
  setWorkspace: (key: string) => void
  /** Replace `savedWorkspaces` from persisted storage. If the persisted map
   *  has an entry for the current key, swap it into the live state. */
  hydrateWorkspaces: (workspaces: Record<string, WorkspaceState>) => void
}

function makeQueryTab(num: number, sql = ''): QueryTab {
  return { id: crypto.randomUUID(), kind: 'query', title: `Query ${num}`, sql }
}

function seedWorkspace(): WorkspaceState {
  const first = makeQueryTab(1)
  return { tabs: [first], activeTabId: first.id, nextNumber: 2 }
}

const initial = seedWorkspace()

/** Owns every workspace tab — SQL editor tabs and table-data tabs alike. */
export const useEditorStore = create<EditorState>((set) => ({
  tabs: initial.tabs,
  activeTabId: initial.activeTabId,
  nextNumber: initial.nextNumber,
  savedWorkspaces: {},
  currentKey: NO_WORKSPACE_KEY,

  createTab: (sql = '') =>
    set((state) => {
      const tab = makeQueryTab(state.nextNumber, sql)
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
        nextNumber: state.nextNumber + 1
      }
    }),

  openTableTab: (connectionId, schema, table, initialView, opts) =>
    set((state) => {
      const preview = opts?.preview ?? false
      const existing = state.tabs.find(
        (tab): tab is TableTab =>
          tab.kind === 'table' &&
          tab.connectionId === connectionId &&
          tab.schema === schema &&
          tab.table === table
      )
      if (existing) {
        // A deliberate (non-preview) open promotes a tab that was only
        // previewed; a preview open leaves its pinned state alone. Either
        // way we just focus the tab that already exists.
        if (!preview && existing.preview) {
          return {
            tabs: state.tabs.map((tab) =>
              tab.id === existing.id ? { ...tab, preview: false } : tab
            ),
            activeTabId: existing.id
          }
        }
        return { activeTabId: existing.id }
      }

      const tab: TableTab = {
        id: crypto.randomUUID(),
        kind: 'table',
        title: table,
        connectionId,
        schema,
        table,
        initialView,
        preview
      }

      // A preview open reuses the single shared preview slot — replacing
      // whatever was previewed there in place (VS Code behaviour) so single
      // clicks don't pile up tabs. A permanent open appends a new tab.
      if (preview) {
        const previewIndex = state.tabs.findIndex(
          (t) => t.kind === 'table' && t.preview
        )
        if (previewIndex !== -1) {
          useTableDataStore.getState().dropTab(state.tabs[previewIndex].id)
          const tabs = [...state.tabs]
          tabs[previewIndex] = tab
          return { tabs, activeTabId: tab.id }
        }
      }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),

  promoteTab: (id) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.kind === 'table' && tab.id === id && tab.preview
          ? { ...tab, preview: false }
          : tab
      )
    })),

  openOverviewTab: (connectionId, schema) =>
    set((state) => {
      const existing = state.tabs.find(
        (tab): tab is OverviewTab =>
          tab.kind === 'overview' &&
          tab.connectionId === connectionId &&
          tab.schema === schema
      )
      if (existing) return { activeTabId: existing.id }

      const tab: OverviewTab = {
        id: crypto.randomUUID(),
        kind: 'overview',
        title: `${schema} overview`,
        connectionId,
        schema
      }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),

  openIntelligenceTab: () =>
    set((state) => {
      const existing = state.tabs.find(
        (tab): tab is IntelligenceTab => tab.kind === 'intelligence'
      )
      if (existing) return { activeTabId: existing.id }

      const tab: IntelligenceTab = {
        id: crypto.randomUUID(),
        kind: 'intelligence',
        title: 'Intelligence'
      }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),

  openAnomaliesTab: () =>
    set((state) => {
      const existing = state.tabs.find(
        (tab): tab is AnomaliesTab => tab.kind === 'anomalies'
      )
      if (existing) return { activeTabId: existing.id }

      const tab: AnomaliesTab = {
        id: crypto.randomUUID(),
        kind: 'anomalies',
        title: 'Anomalies'
      }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),

  closeTab: (id) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === id)
      if (index === -1) return state

      useTableDataStore.getState().dropTab(id)
      const remaining = state.tabs.filter((tab) => tab.id !== id)
      if (remaining.length === 0) {
        const fresh = makeQueryTab(state.nextNumber)
        return { tabs: [fresh], activeTabId: fresh.id, nextNumber: state.nextNumber + 1 }
      }

      const activeTabId =
        state.activeTabId === id
          ? remaining[Math.min(index, remaining.length - 1)].id
          : state.activeTabId
      return { tabs: remaining, activeTabId }
    }),

  closeAllTabs: () =>
    set((state) => {
      const dropTab = useTableDataStore.getState().dropTab
      for (const tab of state.tabs) dropTab(tab.id)
      const fresh = makeQueryTab(state.nextNumber)
      return { tabs: [fresh], activeTabId: fresh.id, nextNumber: state.nextNumber + 1 }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabSql: (id, sql) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id && tab.kind === 'query' ? { ...tab, sql } : tab
      )
    })),

  reorderTab: (fromId, toId, side) =>
    set((state) => {
      if (fromId === toId) return state
      const fromIndex = state.tabs.findIndex((t) => t.id === fromId)
      const toIndexRaw = state.tabs.findIndex((t) => t.id === toId)
      if (fromIndex === -1 || toIndexRaw === -1) return state
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      // Removing the source can shift the target's index by one.
      const targetIndex = fromIndex < toIndexRaw ? toIndexRaw - 1 : toIndexRaw
      const insertAt = side === 'before' ? targetIndex : targetIndex + 1
      tabs.splice(insertAt, 0, moved)
      return { tabs }
    }),

  setWorkspace: (key) =>
    set((state) => {
      if (key === state.currentKey) return state
      const archived: Record<string, WorkspaceState> = {
        ...state.savedWorkspaces,
        [state.currentKey]: {
          tabs: state.tabs,
          activeTabId: state.activeTabId,
          nextNumber: state.nextNumber
        }
      }
      const restored = archived[key] ?? seedWorkspace()
      const { [key]: _used, ...remaining } = archived
      return {
        tabs: restored.tabs,
        activeTabId: restored.activeTabId,
        nextNumber: restored.nextNumber,
        savedWorkspaces: remaining,
        currentKey: key
      }
    }),

  hydrateWorkspaces: (workspaces) =>
    set((state) => {
      const persistedCurrent = workspaces[state.currentKey]
      // Strip the current key from the archive — its state lives at the top level.
      const { [state.currentKey]: _current, ...others } = workspaces
      // The "anomalies" tab kind is currently hidden from the UI — strip
      // any persisted Anomalies tabs from every workspace so a previously
      // opened Duplicate & Mismatch Analysis doesn't silently re-render
      // on launch with no way to close it from the (now hidden) toolbar.
      const stripAnomalies = (ws: WorkspaceState): WorkspaceState => {
        const tabs = ws.tabs.filter((t) => t.kind !== 'anomalies')
        if (tabs.length === ws.tabs.length) return ws
        const activeStillExists = tabs.some((t) => t.id === ws.activeTabId)
        return {
          ...ws,
          tabs,
          activeTabId: activeStillExists ? ws.activeTabId : tabs[0]?.id ?? null
        }
      }
      const cleanedOthers: Record<string, WorkspaceState> = {}
      for (const [k, ws] of Object.entries(others)) cleanedOthers[k] = stripAnomalies(ws)
      if (persistedCurrent) {
        const cleaned = stripAnomalies(persistedCurrent)
        return {
          tabs: cleaned.tabs,
          activeTabId: cleaned.activeTabId,
          nextNumber: cleaned.nextNumber,
          savedWorkspaces: cleanedOthers
        }
      }
      return { savedWorkspaces: cleanedOthers }
    })
}))

/** Snapshot of every workspace — the persistence layer's serialization shape. */
export function selectAllWorkspaces(state: EditorState): Record<string, WorkspaceState> {
  return {
    ...state.savedWorkspaces,
    [state.currentKey]: {
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      nextNumber: state.nextNumber
    }
  }
}
