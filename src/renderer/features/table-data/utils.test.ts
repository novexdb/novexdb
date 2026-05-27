import { describe, expect, it } from 'vitest'
import {
  buildChangeSet,
  coerceInput,
  computeRowKey,
  hasStagedChanges,
  pendingCounts,
  primaryKeyIndexes
} from '@renderer/features/table-data/utils'
import type { TableTabData } from '@renderer/features/table-data/stores/tableDataStore'
import type { TableColumn, TableDataPage } from '@shared/types/table-data'

const TEXT: TableColumn = { name: 'name', dataType: 'text', nullable: true, isPrimaryKey: false }
const PK: TableColumn = { name: 'id', dataType: 'integer', nullable: false, isPrimaryKey: true }
const PK2: TableColumn = { name: 'tenant', dataType: 'integer', nullable: false, isPrimaryKey: true }
const NOT_NULL_TEXT: TableColumn = {
  name: 'email',
  dataType: 'text',
  nullable: false,
  isPrimaryKey: false
}

function emptyTabData(overrides: Partial<TableTabData> = {}): TableTabData {
  return {
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
    columnWidths: {},
    ...overrides
  }
}

describe('primaryKeyIndexes', () => {
  it('returns indices of PK columns in declaration order', () => {
    expect(primaryKeyIndexes([PK, TEXT, PK2])).toEqual([0, 2])
  })

  it('returns [] when no column is a PK', () => {
    expect(primaryKeyIndexes([TEXT, NOT_NULL_TEXT])).toEqual([])
  })
})

describe('computeRowKey', () => {
  it('builds a stable key from a single PK column', () => {
    expect(computeRowKey([7, 'Alice'], [0])).toBe('7')
  })

  it('joins composite PK values with the U+0001 separator', () => {
    // The separator is an unprintable control char so values that look
    // joined (e.g. "199") can't collide with a real composite key.
    const SEP = String.fromCharCode(0x01)
    expect(computeRowKey([1, 'Alice', 99], [0, 2])).toBe(`1${SEP}99`)
  })
})

describe('coerceInput', () => {
  it('returns null for an empty input on a nullable column', () => {
    expect(coerceInput('', TEXT)).toBeNull()
  })

  it('returns the raw text for a non-empty input on a nullable column', () => {
    expect(coerceInput('hi', TEXT)).toBe('hi')
  })

  it('returns "" for an empty input on a NOT NULL column', () => {
    expect(coerceInput('', NOT_NULL_TEXT)).toBe('')
  })
})

describe('hasStagedChanges', () => {
  it('returns false for a freshly-loaded tab', () => {
    expect(hasStagedChanges(emptyTabData())).toBe(false)
  })

  it('returns false for an empty (just-added) new row — recently tightened', () => {
    expect(hasStagedChanges(emptyTabData({ newRows: [{ tempId: 't1', values: {} }] }))).toBe(false)
  })

  it('returns true once a new row has at least one filled column', () => {
    expect(
      hasStagedChanges(emptyTabData({ newRows: [{ tempId: 't1', values: { name: 'Alice' } }] }))
    ).toBe(true)
  })

  it('returns true for any deleted row', () => {
    expect(hasStagedChanges(emptyTabData({ deleted: ['7'] }))).toBe(true)
  })

  it('returns true once a cell edit lands', () => {
    expect(hasStagedChanges(emptyTabData({ edits: { '7': { name: 'Bob' } } }))).toBe(true)
  })

  it('returns false when edits exists but has no actual column updates', () => {
    expect(hasStagedChanges(emptyTabData({ edits: { '7': {} } }))).toBe(false)
  })
})

describe('pendingCounts', () => {
  it('counts filled new rows only — never empty ones', () => {
    const data = emptyTabData({
      newRows: [
        { tempId: 'a', values: {} },
        { tempId: 'b', values: { name: 'Bob' } }
      ]
    })
    expect(pendingCounts(data).added).toBe(1)
  })

  it('counts rows with non-empty edit maps', () => {
    const data = emptyTabData({
      edits: { '7': { name: 'Bob' }, '8': {} }
    })
    expect(pendingCounts(data).edited).toBe(1)
  })

  it('counts deletions by length', () => {
    expect(pendingCounts(emptyTabData({ deleted: ['7', '8'] })).removed).toBe(2)
  })
})

describe('buildChangeSet', () => {
  const page: TableDataPage = {
    columns: [PK, TEXT],
    rows: [
      [1, 'Alice'],
      [2, 'Bob'],
      [3, 'Carol']
    ],
    totalRows: 3,
    editable: true
  }

  it('skips empty new rows when building inserts', () => {
    const data = emptyTabData({
      newRows: [
        { tempId: 'a', values: {} },
        { tempId: 'b', values: { name: 'New' } }
      ]
    })
    const set = buildChangeSet(page, data)
    expect(set.inserts).toEqual([{ values: { name: 'New' } }])
  })

  it('skips updates for rows also marked for delete', () => {
    const data = emptyTabData({
      edits: { '2': { name: 'Bobby' } },
      deleted: ['2']
    })
    const set = buildChangeSet(page, data)
    expect(set.updates).toEqual([])
    expect(set.deletes).toEqual([{ pk: { id: 2 } }])
  })

  it('emits an update with the right PK for the changed row', () => {
    const data = emptyTabData({ edits: { '2': { name: 'Bobby' } } })
    const set = buildChangeSet(page, data)
    expect(set.updates).toEqual([{ pk: { id: 2 }, set: { name: 'Bobby' } }])
  })

  it('emits a delete with the right PK', () => {
    const data = emptyTabData({ deleted: ['3'] })
    const set = buildChangeSet(page, data)
    expect(set.deletes).toEqual([{ pk: { id: 3 } }])
  })

  it('does not emit a delete for a rowKey that no longer matches any row', () => {
    const data = emptyTabData({ deleted: ['9999'] })
    const set = buildChangeSet(page, data)
    expect(set.deletes).toEqual([])
  })
})
