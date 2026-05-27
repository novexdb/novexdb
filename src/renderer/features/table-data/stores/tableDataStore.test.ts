import { beforeEach, describe, expect, it } from 'vitest'
import { useTableDataStore } from '@renderer/features/table-data/stores/tableDataStore'
import type { TableDataPage } from '@shared/types/table-data'

const TAB = 'tab-1'

function emptyPage(): TableDataPage {
  return {
    columns: [
      { name: 'id', dataType: 'integer', nullable: false, isPrimaryKey: true },
      { name: 'name', dataType: 'text', nullable: true, isPrimaryKey: false }
    ],
    rows: [
      [1, 'Alice'],
      [2, 'Bob']
    ],
    totalRows: 2,
    editable: true
  }
}

beforeEach(() => {
  useTableDataStore.setState({ tabs: {} })
})

describe('tableDataStore — setStatus + setData', () => {
  it('setStatus updates status and optional error', () => {
    useTableDataStore.getState().setStatus(TAB, 'loading')
    expect(useTableDataStore.getState().tabs[TAB].status).toBe('loading')

    useTableDataStore.getState().setStatus(TAB, 'error', 'bad')
    expect(useTableDataStore.getState().tabs[TAB].error).toBe('bad')
  })

  it('setData populates page + flips status to ready', () => {
    useTableDataStore.getState().setData(TAB, emptyPage())
    const data = useTableDataStore.getState().tabs[TAB]
    expect(data.page?.rows).toHaveLength(2)
    expect(data.status).toBe('ready')
  })
})

describe('tableDataStore — staged edits', () => {
  beforeEach(() => {
    useTableDataStore.getState().setData(TAB, emptyPage())
  })

  it('editExisting accumulates per-rowKey edits', () => {
    useTableDataStore.getState().editExisting(TAB, '1', 'name', 'Alicia')
    useTableDataStore.getState().editExisting(TAB, '1', 'name', 'Alyssa')
    expect(useTableDataStore.getState().tabs[TAB].edits['1']).toEqual({ name: 'Alyssa' })
  })

  it('addRow appends a NewRow with a unique tempId', () => {
    useTableDataStore.getState().addRow(TAB)
    useTableDataStore.getState().addRow(TAB)
    const rows = useTableDataStore.getState().tabs[TAB].newRows
    expect(rows).toHaveLength(2)
    expect(rows[0].tempId).not.toBe(rows[1].tempId)
    expect(rows[0].values).toEqual({})
  })

  it('editNewRow patches the right row by tempId', () => {
    useTableDataStore.getState().addRow(TAB)
    const tempId = useTableDataStore.getState().tabs[TAB].newRows[0].tempId
    useTableDataStore.getState().editNewRow(TAB, tempId, 'name', 'New')
    expect(useTableDataStore.getState().tabs[TAB].newRows[0].values).toEqual({ name: 'New' })
  })

  it('discardNewRow removes the row', () => {
    useTableDataStore.getState().addRow(TAB)
    const tempId = useTableDataStore.getState().tabs[TAB].newRows[0].tempId
    useTableDataStore.getState().discardNewRow(TAB, tempId)
    expect(useTableDataStore.getState().tabs[TAB].newRows).toHaveLength(0)
  })

  it('toggleDeleted adds, then removes', () => {
    const t = useTableDataStore.getState().toggleDeleted
    t(TAB, '1')
    expect(useTableDataStore.getState().tabs[TAB].deleted).toEqual(['1'])
    t(TAB, '1')
    expect(useTableDataStore.getState().tabs[TAB].deleted).toEqual([])
  })

  it('toggleSelected adds, then removes', () => {
    const t = useTableDataStore.getState().toggleSelected
    t(TAB, '1')
    t(TAB, '2')
    expect(useTableDataStore.getState().tabs[TAB].selected).toEqual(['1', '2'])
    t(TAB, '1')
    expect(useTableDataStore.getState().tabs[TAB].selected).toEqual(['2'])
  })

  it('deleteSelected moves selection → deleted and clears selection', () => {
    useTableDataStore.getState().toggleSelected(TAB, '1')
    useTableDataStore.getState().toggleSelected(TAB, '2')
    useTableDataStore.getState().deleteSelected(TAB)
    const data = useTableDataStore.getState().tabs[TAB]
    expect(data.deleted.sort()).toEqual(['1', '2'])
    expect(data.selected).toEqual([])
  })

  it('clearStaged wipes edits, newRows, deleted, selected', () => {
    useTableDataStore.getState().editExisting(TAB, '1', 'name', 'x')
    useTableDataStore.getState().addRow(TAB)
    useTableDataStore.getState().toggleDeleted(TAB, '2')
    useTableDataStore.getState().toggleSelected(TAB, '1')
    useTableDataStore.getState().clearStaged(TAB)
    const data = useTableDataStore.getState().tabs[TAB]
    expect(data.edits).toEqual({})
    expect(data.newRows).toEqual([])
    expect(data.deleted).toEqual([])
    expect(data.selected).toEqual([])
  })
})

describe('tableDataStore — view + width', () => {
  it('setView merges patch into tab state', () => {
    useTableDataStore.getState().setView(TAB, { pageIndex: 3, orderBy: 'name', orderDir: 'desc' })
    const data = useTableDataStore.getState().tabs[TAB]
    expect(data.pageIndex).toBe(3)
    expect(data.orderBy).toBe('name')
    expect(data.orderDir).toBe('desc')
  })

  it('setColumnWidth records per-column pixels', () => {
    useTableDataStore.getState().setColumnWidth(TAB, 'name', 240)
    expect(useTableDataStore.getState().tabs[TAB].columnWidths).toEqual({ name: 240 })
  })
})

describe('tableDataStore — dropTab', () => {
  it('removes the tab entry', () => {
    useTableDataStore.getState().setData(TAB, emptyPage())
    useTableDataStore.getState().dropTab(TAB)
    expect(useTableDataStore.getState().tabs[TAB]).toBeUndefined()
  })

  it('is a no-op when the tab does not exist', () => {
    useTableDataStore.getState().dropTab('missing')
    expect(useTableDataStore.getState().tabs).toEqual({})
  })
})
