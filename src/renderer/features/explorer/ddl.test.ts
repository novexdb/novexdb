import { describe, expect, it } from 'vitest'
import { buildCreateTableSql, emptyColumn } from '@renderer/features/explorer/ddl'

describe('emptyColumn', () => {
  it('returns a sensible default — nullable text, not PK, no default, no FK', () => {
    expect(emptyColumn()).toEqual({
      name: '',
      type: 'text',
      nullable: true,
      primaryKey: false,
      defaultValue: '',
      references: null
    })
  })
})

describe('buildCreateTableSql', () => {
  it('emits a CREATE TABLE with quoted relation + columns', () => {
    const sql = buildCreateTableSql({
      schema: 'public',
      tableName: 'users',
      columns: [
        { name: 'id', type: 'bigserial', nullable: false, primaryKey: true, defaultValue: '' },
        { name: 'name', type: 'text', nullable: false, primaryKey: false, defaultValue: '' }
      ]
    })
    expect(sql).toBe(
      [
        'CREATE TABLE "public"."users" (',
        '  "id" bigserial,',
        '  "name" text NOT NULL,',
        '  PRIMARY KEY ("id")',
        ');'
      ].join('\n')
    )
  })

  it('emits DEFAULT verbatim when given', () => {
    const sql = buildCreateTableSql({
      schema: 'public',
      tableName: 'events',
      columns: [
        {
          name: 'created_at',
          type: 'timestamptz',
          nullable: false,
          primaryKey: false,
          defaultValue: 'now()'
        }
      ]
    })
    expect(sql).toContain('"created_at" timestamptz NOT NULL DEFAULT now()')
  })

  it('omits NOT NULL on a primary-key column (driver enforces it)', () => {
    const sql = buildCreateTableSql({
      schema: 'public',
      tableName: 't',
      columns: [
        { name: 'id', type: 'bigserial', nullable: false, primaryKey: true, defaultValue: '' }
      ]
    })
    expect(sql).not.toMatch(/"id" bigserial NOT NULL/)
  })

  it('throws when the table name is empty', () => {
    expect(() =>
      buildCreateTableSql({
        schema: 'public',
        tableName: '   ',
        columns: [{ name: 'x', type: 'text', nullable: true, primaryKey: false, defaultValue: '' }]
      })
    ).toThrow(/Table name/)
  })

  it('throws when no columns are provided', () => {
    expect(() =>
      buildCreateTableSql({ schema: 'public', tableName: 't', columns: [] })
    ).toThrow(/at least one column/i)
  })

  it('throws on duplicate column names (case-insensitive)', () => {
    expect(() =>
      buildCreateTableSql({
        schema: 'public',
        tableName: 't',
        columns: [
          { name: 'id', type: 'integer', nullable: false, primaryKey: true, defaultValue: '' },
          { name: 'ID', type: 'integer', nullable: false, primaryKey: false, defaultValue: '' }
        ]
      })
    ).toThrow(/Duplicate column/i)
  })

  it('throws on a blank column name', () => {
    expect(() =>
      buildCreateTableSql({
        schema: 'public',
        tableName: 't',
        columns: [{ name: '   ', type: 'text', nullable: true, primaryKey: false, defaultValue: '' }]
      })
    ).toThrow(/column needs a name/i)
  })
})

describe('buildCreateTableSql — foreign keys', () => {
  it('emits a table-level CONSTRAINT for a column with a reference', () => {
    const sql = buildCreateTableSql({
      schema: 'public',
      tableName: 'orders',
      columns: [
        { name: 'id', type: 'bigserial', nullable: false, primaryKey: true, defaultValue: '' },
        {
          name: 'customer_id',
          type: 'bigint',
          nullable: false,
          primaryKey: false,
          defaultValue: '',
          references: { schema: 'public', table: 'customers', column: 'id' }
        }
      ]
    })
    expect(sql).toBe(
      [
        'CREATE TABLE "public"."orders" (',
        '  "id" bigserial,',
        '  "customer_id" bigint NOT NULL,',
        '  PRIMARY KEY ("id"),',
        '  CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id")',
        ');'
      ].join('\n')
    )
  })

  it('omits ON DELETE / ON UPDATE when set to NO ACTION (the Postgres default)', () => {
    const sql = buildCreateTableSql({
      schema: 'public',
      tableName: 'orders',
      columns: [
        {
          name: 'customer_id',
          type: 'bigint',
          nullable: false,
          primaryKey: false,
          defaultValue: '',
          references: {
            schema: 'public',
            table: 'customers',
            column: 'id',
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }
        }
      ]
    })
    expect(sql).not.toMatch(/ON DELETE/)
    expect(sql).not.toMatch(/ON UPDATE/)
  })

  it('emits ON DELETE CASCADE when set', () => {
    const sql = buildCreateTableSql({
      schema: 'public',
      tableName: 'orders',
      columns: [
        {
          name: 'customer_id',
          type: 'bigint',
          nullable: false,
          primaryKey: false,
          defaultValue: '',
          references: {
            schema: 'public',
            table: 'customers',
            column: 'id',
            onDelete: 'CASCADE'
          }
        }
      ]
    })
    expect(sql).toContain(
      'CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id") ON DELETE CASCADE'
    )
  })

  it('emits ON DELETE before ON UPDATE when both are set', () => {
    const sql = buildCreateTableSql({
      schema: 'public',
      tableName: 'orders',
      columns: [
        {
          name: 'customer_id',
          type: 'bigint',
          nullable: false,
          primaryKey: false,
          defaultValue: '',
          references: {
            schema: 'public',
            table: 'customers',
            column: 'id',
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
          }
        }
      ]
    })
    expect(sql).toContain('ON DELETE SET NULL ON UPDATE CASCADE')
  })

  it('quotes a target identifier with an embedded double quote', () => {
    const sql = buildCreateTableSql({
      schema: 'public',
      tableName: 'orders',
      columns: [
        {
          name: 'customer_id',
          type: 'bigint',
          nullable: false,
          primaryKey: false,
          defaultValue: '',
          references: { schema: 'public', table: 'we"ird', column: 'id' }
        }
      ]
    })
    expect(sql).toContain('REFERENCES "public"."we""ird" ("id")')
  })

  it.each<['schema' | 'table' | 'column', string]>([
    ['schema', /target schema/i.source],
    ['table', /target table/i.source],
    ['column', /target column/i.source]
  ])('throws when the foreign-key target %s is blank', (field, messageSource) => {
    const fk = { schema: 'public', table: 'customers', column: 'id' }
    fk[field] = '   '
    expect(() =>
      buildCreateTableSql({
        schema: 'public',
        tableName: 'orders',
        columns: [
          {
            name: 'customer_id',
            type: 'bigint',
            nullable: false,
            primaryKey: false,
            defaultValue: '',
            references: fk
          }
        ]
      })
    ).toThrow(new RegExp(messageSource))
  })

  it('places FK lines after the PRIMARY KEY constraint', () => {
    const sql = buildCreateTableSql({
      schema: 'public',
      tableName: 'orders',
      columns: [
        { name: 'id', type: 'bigserial', nullable: false, primaryKey: true, defaultValue: '' },
        {
          name: 'customer_id',
          type: 'bigint',
          nullable: false,
          primaryKey: false,
          defaultValue: '',
          references: { schema: 'public', table: 'customers', column: 'id' }
        }
      ]
    })
    const pkIndex = sql.indexOf('PRIMARY KEY')
    const fkIndex = sql.indexOf('FOREIGN KEY')
    expect(pkIndex).toBeGreaterThan(-1)
    expect(fkIndex).toBeGreaterThan(pkIndex)
  })
})
