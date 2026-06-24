import { beforeEach, describe, expect, it } from 'vitest'
import {
  NO_WORKSPACE_KEY,
  useEditorStore
} from '@renderer/features/editor/stores/editorStore'
import { useTableDataStore } from '@renderer/features/table-data/stores/tableDataStore'

beforeEach(() => {
  // Start each test from a known empty state with a single Query 1 tab — the
  // store's natural initial layout. Reset via setState with a single fresh tab.
  const seed = { id: 'tab-1', kind: 'query' as const, title: 'Query 1', sql: '' }
  useEditorStore.setState({
    tabs: [seed],
    activeTabId: seed.id,
    nextNumber: 2,
    savedWorkspaces: {},
    currentKey: NO_WORKSPACE_KEY
  })
  useTableDataStore.setState({ tabs: {} })
})

describe('editorStore — createTab', () => {
  it('appends a Query tab and increments nextNumber', () => {
    useEditorStore.getState().createTab()
    const state = useEditorStore.getState()
    expect(state.tabs.length).toBe(2)
    expect(state.tabs[1].title).toBe('Query 2')
    expect(state.nextNumber).toBe(3)
  })

  it('seeds the new tab with the provided SQL', () => {
    useEditorStore.getState().createTab('SELECT 1')
    const tab = useEditorStore.getState().tabs[1]
    expect(tab.kind === 'query' && tab.sql).toBe('SELECT 1')
  })

  it('focuses the newly created tab', () => {
    useEditorStore.getState().createTab()
    const state = useEditorStore.getState()
    expect(state.activeTabId).toBe(state.tabs[1].id)
  })
})

describe('editorStore — openTableTab', () => {
  it('appends a Table tab the first time it is opened', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users')
    const state = useEditorStore.getState()
    const tab = state.tabs[1]
    expect(tab.kind).toBe('table')
    expect(state.activeTabId).toBe(tab.id)
  })

  it('dedupes by (connectionId, schema, table) and just focuses', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users')
    const firstId = useEditorStore.getState().activeTabId
    useEditorStore.getState().setActiveTab('tab-1')
    useEditorStore.getState().openTableTab('c1', 'public', 'users')
    const state = useEditorStore.getState()
    expect(state.tabs.length).toBe(2)
    expect(state.activeTabId).toBe(firstId)
  })

  it('threads initialView onto the new tab when given', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users', 'structure')
    const tab = useEditorStore.getState().tabs[1]
    expect(tab.kind === 'table' && tab.initialView).toBe('structure')
  })
})

describe('editorStore — preview tabs (VS Code style)', () => {
  it('marks a single-click open as a preview tab', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users', undefined, { preview: true })
    const tab = useEditorStore.getState().tabs[1]
    expect(tab.kind === 'table' && tab.preview).toBe(true)
  })

  it('reuses the single preview slot — a second preview replaces the first', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users', undefined, { preview: true })
    const firstId = useEditorStore.getState().tabs[1].id
    useEditorStore.getState().openTableTab('c1', 'public', 'orders', undefined, { preview: true })
    const state = useEditorStore.getState()
    // Still only two tabs: the seed Query tab + the (replaced) preview tab.
    expect(state.tabs).toHaveLength(2)
    const tab = state.tabs[1]
    expect(tab.kind === 'table' && tab.table).toBe('orders')
    expect(tab.id).not.toBe(firstId)
    expect(state.activeTabId).toBe(tab.id)
  })

  it('drops the replaced preview tab\'s data-store state', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users', undefined, { preview: true })
    const firstId = useEditorStore.getState().tabs[1].id
    useTableDataStore.setState({
      tabs: {
        [firstId]: {
          page: null,
          status: 'ready',
          error: null,
          pageIndex: 0,
          pageSize: 100,
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
    })
    useEditorStore.getState().openTableTab('c1', 'public', 'orders', undefined, { preview: true })
    expect(useTableDataStore.getState().tabs[firstId]).toBeUndefined()
  })

  it('a permanent open appends instead of replacing the preview slot', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users', undefined, { preview: true })
    useEditorStore.getState().openTableTab('c1', 'public', 'orders', undefined, { preview: false })
    const state = useEditorStore.getState()
    expect(state.tabs).toHaveLength(3)
  })

  it('promotes an existing preview tab when the same table is opened permanently', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users', undefined, { preview: true })
    useEditorStore.getState().openTableTab('c1', 'public', 'users', undefined, { preview: false })
    const state = useEditorStore.getState()
    expect(state.tabs).toHaveLength(2)
    const tab = state.tabs[1]
    expect(tab.kind === 'table' && tab.preview).toBe(false)
  })

  it('promoteTab pins a preview tab so the next preview no longer replaces it', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users', undefined, { preview: true })
    const pinnedId = useEditorStore.getState().tabs[1].id
    useEditorStore.getState().promoteTab(pinnedId)
    useEditorStore.getState().openTableTab('c1', 'public', 'orders', undefined, { preview: true })
    const state = useEditorStore.getState()
    expect(state.tabs).toHaveLength(3)
    expect(state.tabs.some((t) => t.id === pinnedId)).toBe(true)
  })
})

describe('editorStore — openOverviewTab', () => {
  it('appends an Overview tab the first time it is opened', () => {
    useEditorStore.getState().openOverviewTab('c1', 'public')
    const tab = useEditorStore.getState().tabs[1]
    expect(tab.kind).toBe('overview')
  })

  it('dedupes by (connectionId, schema)', () => {
    useEditorStore.getState().openOverviewTab('c1', 'public')
    useEditorStore.getState().openOverviewTab('c1', 'public')
    expect(useEditorStore.getState().tabs.length).toBe(2)
  })
})

describe('editorStore — closeTab', () => {
  it('removes the tab and keeps activeTabId stable when closing an inactive tab', () => {
    useEditorStore.getState().createTab() // tab Query 2 (active)
    const ids = useEditorStore.getState().tabs.map((t) => t.id)
    useEditorStore.getState().setActiveTab(ids[1])
    useEditorStore.getState().closeTab(ids[0])
    expect(useEditorStore.getState().activeTabId).toBe(ids[1])
    expect(useEditorStore.getState().tabs).toHaveLength(1)
  })

  it('replaces the very last tab with a fresh Query tab', () => {
    useEditorStore.getState().closeTab('tab-1')
    const state = useEditorStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].kind).toBe('query')
    expect(state.tabs[0].id).not.toBe('tab-1')
  })

  it('drops the table-data tab state when closing a Table tab', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users')
    const tableTabId = useEditorStore.getState().tabs[1].id
    useTableDataStore.setState({
      tabs: {
        [tableTabId]: {
          page: null,
          status: 'ready',
          error: null,
          pageIndex: 0,
          pageSize: 100,
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
    })
    useEditorStore.getState().closeTab(tableTabId)
    expect(useTableDataStore.getState().tabs[tableTabId]).toBeUndefined()
  })
})

describe('editorStore — closeAllTabs', () => {
  it('replaces every open tab with a single fresh Query tab', () => {
    useEditorStore.getState().createTab() // Query 2
    useEditorStore.getState().openTableTab('c1', 'public', 'users')
    expect(useEditorStore.getState().tabs).toHaveLength(3)

    useEditorStore.getState().closeAllTabs()
    const state = useEditorStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].kind).toBe('query')
    expect(state.activeTabId).toBe(state.tabs[0].id)
  })

  it('drops table-data state for every closed Table tab', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users')
    const tableTabId = useEditorStore.getState().tabs[1].id
    useTableDataStore.setState({
      tabs: {
        [tableTabId]: {
          page: null,
          status: 'ready',
          error: null,
          pageIndex: 0,
          pageSize: 100,
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
    })
    useEditorStore.getState().closeAllTabs()
    expect(useTableDataStore.getState().tabs[tableTabId]).toBeUndefined()
  })
})

describe('editorStore — setWorkspace', () => {
  it('seeds a fresh Query tab when switching to a never-seen workspace', () => {
    useEditorStore.getState().createTab('SELECT 1')
    expect(useEditorStore.getState().tabs).toHaveLength(2)

    useEditorStore.getState().setWorkspace('conn-a:db-a')
    const state = useEditorStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].kind).toBe('query')
    expect(state.currentKey).toBe('conn-a:db-a')
  })

  it('restores the previous workspace when switching back', () => {
    useEditorStore.getState().createTab('SELECT 1')
    useEditorStore.getState().openTableTab('c1', 'public', 'users')
    const originalIds = useEditorStore.getState().tabs.map((t) => t.id)
    const originalActive = useEditorStore.getState().activeTabId

    useEditorStore.getState().setWorkspace('conn-b:db-b')
    expect(useEditorStore.getState().tabs).toHaveLength(1)
    expect(useEditorStore.getState().tabs[0].id).not.toEqual(originalIds[0])

    useEditorStore.getState().setWorkspace(NO_WORKSPACE_KEY)
    const restored = useEditorStore.getState()
    expect(restored.tabs.map((t) => t.id)).toEqual(originalIds)
    expect(restored.activeTabId).toBe(originalActive)
  })

  it('is a no-op when the target key matches the current key', () => {
    const before = useEditorStore.getState()
    useEditorStore.getState().setWorkspace(before.currentKey)
    const after = useEditorStore.getState()
    expect(after.tabs).toBe(before.tabs)
    expect(after.savedWorkspaces).toBe(before.savedWorkspaces)
  })
})

describe('editorStore — hydrateWorkspaces', () => {
  it('swaps the live state to the persisted entry for the current key', () => {
    const seededTab = useEditorStore.getState().tabs[0].id
    useEditorStore.getState().hydrateWorkspaces({
      [NO_WORKSPACE_KEY]: {
        tabs: [{ id: 'persisted', kind: 'query', title: 'Query 7', sql: 'SELECT 7' }],
        activeTabId: 'persisted',
        nextNumber: 8
      }
    })
    const state = useEditorStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].id).toBe('persisted')
    expect(state.tabs[0].id).not.toBe(seededTab)
    expect(state.nextNumber).toBe(8)
  })

  it('archives entries for other keys without touching the live state', () => {
    const before = useEditorStore.getState().tabs
    useEditorStore.getState().hydrateWorkspaces({
      'conn-a:db-a': {
        tabs: [{ id: 'other', kind: 'query', title: 'Query 1', sql: '' }],
        activeTabId: 'other',
        nextNumber: 2
      }
    })
    const state = useEditorStore.getState()
    expect(state.tabs).toEqual(before)
    expect(state.savedWorkspaces['conn-a:db-a']?.tabs[0].id).toBe('other')
  })
})

describe('editorStore — updateTabSql', () => {
  it('updates SQL on a query tab', () => {
    useEditorStore.getState().updateTabSql('tab-1', 'SELECT 1')
    const tab = useEditorStore.getState().tabs[0]
    expect(tab.kind === 'query' && tab.sql).toBe('SELECT 1')
  })

  it('ignores updateTabSql on non-query tabs', () => {
    useEditorStore.getState().openTableTab('c1', 'public', 'users')
    const tableTabId = useEditorStore.getState().tabs[1].id
    // No-op — would otherwise rewrite the tab. Just confirm the tab kind/shape stayed put.
    useEditorStore.getState().updateTabSql(tableTabId, 'SELECT 1')
    const tab = useEditorStore.getState().tabs[1]
    expect(tab.kind).toBe('table')
    expect('sql' in tab).toBe(false)
  })
})
