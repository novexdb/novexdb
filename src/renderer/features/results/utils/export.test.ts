import { describe, expect, it } from 'vitest'
import { toCsv, toJson } from '@renderer/features/results/utils/export'
import type { QueryColumn } from '@shared/types/query'

const columns: QueryColumn[] = [
  { name: 'id', dataTypeId: 0 },
  { name: 'name', dataTypeId: 0 },
  { name: 'notes', dataTypeId: 0 }
]

describe('toCsv', () => {
  it('emits the header even when there are no rows', () => {
    expect(toCsv(columns, [])).toBe('id,name,notes')
  })

  it('joins one row under the header', () => {
    expect(toCsv(columns, [[1, 'Alice', 'ok']])).toBe('id,name,notes\n1,Alice,ok')
  })

  it('quotes cells containing commas, quotes or newlines', () => {
    const row = [1, 'a,b', 'line "1"\nline 2']
    const csv = toCsv(columns, [row])
    expect(csv).toBe('id,name,notes\n1,"a,b","line ""1""\nline 2"')
  })

  it('renders null and undefined as empty cells', () => {
    expect(toCsv(columns, [[1, null, undefined]])).toBe('id,name,notes\n1,,')
  })
})

describe('toJson', () => {
  it('emits an empty array when there are no rows', () => {
    expect(toJson(columns, [])).toBe('[]')
  })

  it('shapes rows as objects keyed by column name', () => {
    const out = toJson(columns, [[1, 'Alice', 'ok']])
    expect(JSON.parse(out)).toEqual([{ id: 1, name: 'Alice', notes: 'ok' }])
  })

  it('coerces undefined cell values to null (JSON-safe)', () => {
    const out = toJson(columns, [[1, undefined, null]])
    expect(JSON.parse(out)).toEqual([{ id: 1, name: null, notes: null }])
  })
})
