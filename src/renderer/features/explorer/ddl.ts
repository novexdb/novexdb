import { quoteIdent, quoteQualified } from '@renderer/utils/sql'

/** PostgreSQL column types offered in the New Table / Import column editors. */
export const PG_COLUMN_TYPES = [
  'text',
  'varchar',
  'integer',
  'bigint',
  'numeric',
  'boolean',
  'date',
  'timestamp',
  'timestamptz',
  'uuid',
  'jsonb',
  'serial',
  'bigserial'
] as const

export type PgColumnType = (typeof PG_COLUMN_TYPES)[number]

/** Cascade behaviour for a foreign-key constraint. `NO ACTION` is the
 *  Postgres default and is **omitted** from the emitted SQL to keep the
 *  generated DDL terse. */
export const FK_ACTIONS = [
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT'
] as const
export type FkAction = (typeof FK_ACTIONS)[number]

export interface ForeignKeyDef {
  /** Target schema; the UI defaults this to the new table's own schema. */
  schema: string
  /** Target table. */
  table: string
  /** Target column. Single-column FKs only — 95 % of cases. */
  column: string
  /** Default `NO ACTION` (Postgres default) — emitted only when non-default. */
  onDelete?: FkAction
  /** Same shape as `onDelete`. */
  onUpdate?: FkAction
}

export interface ColumnDef {
  name: string
  type: PgColumnType
  nullable: boolean
  primaryKey: boolean
  /** Raw SQL default expression, emitted verbatim. Empty string = no default. */
  defaultValue: string
  /** Optional FK reference — emitted as a table-level CONSTRAINT line. */
  references?: ForeignKeyDef | null
}

export interface CreateTableForm {
  schema: string
  tableName: string
  columns: ColumnDef[]
}

/** A fresh, sensible default column row for the editors. */
export function emptyColumn(): ColumnDef {
  return {
    name: '',
    type: 'text',
    nullable: true,
    primaryKey: false,
    defaultValue: '',
    references: null
  }
}

/**
 * Build a `CREATE TABLE` statement from a form. Throws with a user-facing
 * message when the form is invalid; all identifiers are quoted.
 */
export function buildCreateTableSql(form: CreateTableForm): string {
  const tableName = form.tableName.trim()
  if (!tableName) throw new Error('Table name is required.')
  if (!form.schema.trim()) throw new Error('Schema is required.')
  if (form.columns.length === 0) throw new Error('Add at least one column.')

  const seen = new Set<string>()
  for (const column of form.columns) {
    const name = column.name.trim()
    if (!name) throw new Error('Every column needs a name.')
    const key = name.toLowerCase()
    if (seen.has(key)) throw new Error(`Duplicate column name: "${name}".`)
    seen.add(key)
    if (column.references) {
      if (!column.references.schema.trim())
        throw new Error(`Foreign key on "${name}" is missing a target schema.`)
      if (!column.references.table.trim())
        throw new Error(`Foreign key on "${name}" is missing a target table.`)
      if (!column.references.column.trim())
        throw new Error(`Foreign key on "${name}" is missing a target column.`)
    }
  }

  const lines = form.columns.map((column) => {
    const parts = [`  ${quoteIdent(column.name.trim())} ${column.type}`]
    if (!column.nullable && !column.primaryKey) parts.push('NOT NULL')
    const def = column.defaultValue.trim()
    if (def) parts.push(`DEFAULT ${def}`)
    return parts.join(' ')
  })

  const pkColumns = form.columns
    .filter((column) => column.primaryKey)
    .map((column) => quoteIdent(column.name.trim()))
  if (pkColumns.length > 0) {
    lines.push(`  PRIMARY KEY (${pkColumns.join(', ')})`)
  }

  for (const column of form.columns) {
    if (!column.references) continue
    lines.push(buildForeignKeyLine(tableName, column.name.trim(), column.references))
  }

  return `CREATE TABLE ${quoteQualified(form.schema, tableName)} (\n${lines.join(',\n')}\n);`
}

/** One `CONSTRAINT … FOREIGN KEY … REFERENCES …` line — already 2-space indented. */
function buildForeignKeyLine(
  ownerTable: string,
  ownerColumn: string,
  fk: ForeignKeyDef
): string {
  // Predictable constraint name so the user can drop it without guessing.
  const constraintName = `${ownerTable}_${ownerColumn}_fkey`
  const parts = [
    `  CONSTRAINT ${quoteIdent(constraintName)}`,
    `FOREIGN KEY (${quoteIdent(ownerColumn)})`,
    `REFERENCES ${quoteQualified(fk.schema, fk.table)} (${quoteIdent(fk.column)})`
  ]
  if (fk.onDelete && fk.onDelete !== 'NO ACTION') parts.push(`ON DELETE ${fk.onDelete}`)
  if (fk.onUpdate && fk.onUpdate !== 'NO ACTION') parts.push(`ON UPDATE ${fk.onUpdate}`)
  return parts.join(' ')
}
