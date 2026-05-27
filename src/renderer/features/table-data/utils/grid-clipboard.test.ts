import { describe, expect, it } from 'vitest'
import {
  buildSqlInserts,
  columnValuesText,
  rowsCsv,
  rowsJson
} from '@renderer/features/table-data/utils/grid-clipboard'
import type { TableColumn } from '@shared/types/table-data'

const COLUMNS: TableColumn[] = [
  { name: 'id', dataType: 'integer', nullable: false, isPrimaryKey: true },
  { name: 'name', dataType: 'text', nullable: true, isPrimaryKey: false },
  { name: 'active', dataType: 'boolean', nullable: false, isPrimaryKey: false }
]

describe('rowsCsv', () => {
  it('quotes values containing commas, quotes, or newlines', () => {
    const out = rowsCsv(COLUMNS, [[1, 'a,b', false]])
    expect(out).toBe('id,name,active\n1,"a,b",false')
  })

  it('renders nulls as empty cells', () => {
    expect(rowsCsv(COLUMNS, [[1, null, true]])).toBe('id,name,active\n1,,true')
  })
})

describe('rowsJson', () => {
  it('shapes rows as objects keyed by column name', () => {
    const out = JSON.parse(rowsJson(COLUMNS, [[1, 'Alice', true]]))
    expect(out).toEqual([{ id: 1, name: 'Alice', active: true }])
  })
})

describe('columnValuesText', () => {
  it('newline-joins values in a single column, NULL-aware', () => {
    const out = columnValuesText(
      [
        [1, 'Alice', true],
        [2, null, false],
        [3, 'Carol', true]
      ],
      1
    )
    expect(out).toBe('Alice\nNULL\nCarol')
  })

  it('treats undefined the same as null', () => {
    expect(columnValuesText([[undefined]], 0)).toBe('NULL')
  })
})

describe('buildSqlInserts', () => {
  const rows = [
    [1, 'Alice', true],
    [2, "it's me", false]
  ]

  it('emits one INSERT per row with postgres double-quoting', () => {
    const sql = buildSqlInserts('postgres', 'public', 'users', COLUMNS, rows)
    expect(sql.split('\n')).toEqual([
      `INSERT INTO "public"."users" ("id", "name", "active") VALUES (1, 'Alice', TRUE);`,
      `INSERT INTO "public"."users" ("id", "name", "active") VALUES (2, 'it''s me', FALSE);`
    ])
  })

  it('uses backticks for mysql', () => {
    const sql = buildSqlInserts('mysql', 'app', 'users', COLUMNS, [[1, 'Alice', true]])
    expect(sql).toBe(
      "INSERT INTO `app`.`users` (`id`, `name`, `active`) VALUES (1, 'Alice', TRUE);"
    )
  })

  it('inlines NULL, numbers, booleans, Date (ISO), bigint, and JSON objects', () => {
    const cols: TableColumn[] = [
      { name: 'a', dataType: 'integer', nullable: true, isPrimaryKey: false },
      { name: 'b', dataType: 'numeric', nullable: true, isPrimaryKey: false },
      { name: 'c', dataType: 'boolean', nullable: true, isPrimaryKey: false },
      { name: 'd', dataType: 'timestamptz', nullable: true, isPrimaryKey: false },
      { name: 'e', dataType: 'bigint', nullable: true, isPrimaryKey: false },
      { name: 'f', dataType: 'jsonb', nullable: true, isPrimaryKey: false }
    ]
    const date = new Date('2024-01-15T10:30:00.000Z')
    const sql = buildSqlInserts('postgres', 'public', 't', cols, [
      [null, 3.14, true, date, 9007199254740993n, { a: 1 }]
    ])
    expect(sql).toBe(
      `INSERT INTO "public"."t" ("a", "b", "c", "d", "e", "f") VALUES (NULL, 3.14, TRUE, '2024-01-15T10:30:00.000Z', 9007199254740993, '{"a":1}');`
    )
  })

  it('quotes an embedded apostrophe via the literal escape', () => {
    const sql = buildSqlInserts(
      'postgres',
      'public',
      't',
      [{ name: 'note', dataType: 'text', nullable: true, isPrimaryKey: false }],
      [["it's"]]
    )
    expect(sql).toBe(`INSERT INTO "public"."t" ("note") VALUES ('it''s');`)
  })
})
