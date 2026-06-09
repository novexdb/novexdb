import { describe, expect, it } from 'vitest'
import {
  buildMssqlCreateTable,
  buildMssqlInserts,
  mssqlSqlLiteral
} from '@main/services/drivers/mssql-export'
import { defaultExportFilename } from '@shared/types/query'
import type { RelationInfo } from '@shared/types/schema'
import type { TableColumn } from '@shared/types/table-data'

describe('mssqlSqlLiteral', () => {
  it('renders NULL for null/undefined', () => {
    expect(mssqlSqlLiteral(null)).toBe('NULL')
    expect(mssqlSqlLiteral(undefined)).toBe('NULL')
  })
  it('inlines finite numbers, NULL for non-finite', () => {
    expect(mssqlSqlLiteral(42)).toBe('42')
    expect(mssqlSqlLiteral(Number.NaN)).toBe('NULL')
  })
  it('renders booleans as bit literals', () => {
    expect(mssqlSqlLiteral(true)).toBe('1')
    expect(mssqlSqlLiteral(false)).toBe('0')
  })
  it('escapes apostrophes and prefixes N for strings', () => {
    expect(mssqlSqlLiteral("O'Brien")).toBe("N'O''Brien'")
  })
  it('renders binary as a 0x hex literal', () => {
    expect(mssqlSqlLiteral(Buffer.from([0xde, 0xad]))).toBe('0xdead')
  })
  it('renders objects as JSON string literals', () => {
    expect(mssqlSqlLiteral({ a: 1 })).toBe('N\'{"a":1}\'')
  })
})

describe('buildMssqlCreateTable', () => {
  it('emits column defs, NULL/NOT NULL, defaults and a PRIMARY KEY', () => {
    const relation: RelationInfo = {
      schema: 'dbo',
      name: 'users',
      kind: 'table',
      estimatedRows: null,
      columns: [
        { name: 'id', dataType: 'int', nullable: false, isPrimaryKey: true, defaultValue: null },
        {
          name: 'name',
          dataType: 'nvarchar(200)',
          nullable: true,
          isPrimaryKey: false,
          defaultValue: null
        },
        {
          name: 'active',
          dataType: 'bit',
          nullable: false,
          isPrimaryKey: false,
          defaultValue: '((1))'
        }
      ]
    }
    const ddl = buildMssqlCreateTable(relation)
    expect(ddl).toContain('CREATE TABLE [dbo].[users] (')
    expect(ddl).toContain('[id] int NOT NULL')
    expect(ddl).toContain('[name] nvarchar(200) NULL')
    expect(ddl).toContain('[active] bit NOT NULL DEFAULT ((1))')
    expect(ddl).toContain('PRIMARY KEY ([id])')
    expect(ddl.trimEnd().endsWith('GO')).toBe(true)
  })
})

describe('buildMssqlInserts', () => {
  const columns: TableColumn[] = [
    { name: 'id', dataType: 'int', nullable: false, isPrimaryKey: true },
    { name: 'name', dataType: 'nvarchar(50)', nullable: true, isPrimaryKey: false }
  ]
  it('emits one bracket-quoted INSERT per row', () => {
    const out = buildMssqlInserts('dbo', 'users', columns, [
      [1, 'Ada'],
      [2, null]
    ])
    expect(out).toContain("INSERT INTO [dbo].[users] ([id], [name]) VALUES (1, N'Ada');")
    expect(out).toContain('INSERT INTO [dbo].[users] ([id], [name]) VALUES (2, NULL);')
  })
  it('returns an empty string for no rows', () => {
    expect(buildMssqlInserts('dbo', 'users', columns, [])).toBe('')
  })
})

describe('defaultExportFilename', () => {
  const at = new Date('2026-06-09T12:00:00.000Z')
  it('uses the right extension per format', () => {
    expect(defaultExportFilename('forge', 'plain', at)).toBe('forge-2026-06-09.sql')
    expect(defaultExportFilename('forge', 'gzip', at)).toBe('forge-2026-06-09.sql.gz')
    expect(defaultExportFilename('forge', 'custom', at)).toBe('forge-2026-06-09.dump')
  })
  it('sanitizes unsafe characters in the database name', () => {
    expect(defaultExportFilename('my db/with:stuff', 'plain', at)).toBe(
      'my_db_with_stuff-2026-06-09.sql'
    )
  })
})
