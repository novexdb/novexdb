/** Database schema introspection model — produced by a driver, consumed by the explorer. */

export type RelationKind = 'table' | 'view' | 'materialized_view'

export interface ColumnInfo {
  name: string
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue: string | null
}

export interface RelationInfo {
  schema: string
  name: string
  kind: RelationKind
  estimatedRows: number | null
  columns: ColumnInfo[]
}

export interface RoutineInfo {
  schema: string
  name: string
  kind: 'function' | 'procedure'
  returnType: string | null
  language: string | null
}

export interface TriggerInfo {
  schema: string
  name: string
  table: string
  timing: string
  events: string
}

export interface IndexInfo {
  schema: string
  name: string
  table: string
  isUnique: boolean
  isPrimary: boolean
  definition: string
}

export interface ForeignKeyInfo {
  schema: string
  table: string
  columns: string[]
  referencedSchema: string
  referencedTable: string
  referencedColumns: string[]
  constraintName: string
}

/** A flat snapshot of a database's structure; the renderer groups it by schema. */
export interface SchemaSnapshot {
  schemas: string[]
  relations: RelationInfo[]
  routines: RoutineInfo[]
  triggers: TriggerInfo[]
  indexes: IndexInfo[]
  foreignKeys: ForeignKeyInfo[]
  fetchedAt: string
}
