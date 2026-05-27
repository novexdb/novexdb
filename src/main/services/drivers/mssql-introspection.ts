import type { ConnectionPool } from 'mssql'
import type {
  ColumnInfo,
  ForeignKeyInfo,
  IndexInfo,
  RelationInfo,
  RelationKind,
  RoutineInfo,
  SchemaSnapshot,
  TriggerInfo
} from '@shared/types/schema'

/**
 * SQL Server introspection. `sys.*` catalogs are richer than INFORMATION_SCHEMA
 * (row estimates, identity columns, full FK ordering), so we use them
 * everywhere — and filter out the built-in `sys` / `INFORMATION_SCHEMA` /
 * service-broker schemas the user does not care about.
 */

const SYSTEM_SCHEMAS = `'sys', 'INFORMATION_SCHEMA', 'guest', 'db_owner',
  'db_accessadmin', 'db_securityadmin', 'db_ddladmin', 'db_backupoperator',
  'db_datareader', 'db_datawriter', 'db_denydatareader', 'db_denydatawriter'`

const SCHEMAS_SQL = `
  SELECT name AS [schema]
  FROM sys.schemas
  WHERE name NOT IN (${SYSTEM_SCHEMAS})
  ORDER BY name`

const RELATIONS_SQL = `
  SELECT s.name AS [schema], o.name AS [name],
         CASE o.type WHEN 'U' THEN 'table'
                     WHEN 'V' THEN 'view'
                     ELSE 'table' END AS kind,
         CAST(ISNULL(p.rows, 0) AS bigint) AS estimated_rows
  FROM sys.objects o
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  OUTER APPLY (
    SELECT SUM(ps.rows) AS rows
    FROM sys.partitions ps
    WHERE ps.object_id = o.object_id AND ps.index_id IN (0, 1)
  ) p
  WHERE o.type IN ('U', 'V')
    AND s.name NOT IN (${SYSTEM_SCHEMAS})
  ORDER BY s.name, o.name`

const COLUMNS_SQL = `
  SELECT s.name AS [schema], o.name AS relation, c.name AS [name],
         TYPE_NAME(c.user_type_id) +
           CASE
             WHEN TYPE_NAME(c.user_type_id) IN ('varchar', 'nvarchar', 'char', 'nchar', 'binary', 'varbinary')
               THEN '(' + CASE WHEN c.max_length = -1 THEN 'max'
                               WHEN TYPE_NAME(c.user_type_id) IN ('nvarchar', 'nchar')
                                 THEN CAST(c.max_length / 2 AS varchar(10))
                               ELSE CAST(c.max_length AS varchar(10)) END + ')'
             WHEN TYPE_NAME(c.user_type_id) IN ('decimal', 'numeric')
               THEN '(' + CAST(c.precision AS varchar(10)) + ',' + CAST(c.scale AS varchar(10)) + ')'
             ELSE '' END AS data_type,
         c.is_nullable AS nullable,
         OBJECT_DEFINITION(c.default_object_id) AS default_value,
         CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key
  FROM sys.columns c
  JOIN sys.objects o ON o.object_id = c.object_id
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  LEFT JOIN (
    SELECT ic.object_id, ic.column_id
    FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE i.is_primary_key = 1
  ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
  WHERE o.type IN ('U', 'V')
    AND s.name NOT IN (${SYSTEM_SCHEMAS})
  ORDER BY s.name, o.name, c.column_id`

const ROUTINES_SQL = `
  SELECT s.name AS [schema], o.name AS [name],
         CASE WHEN o.type = 'P' THEN 'procedure' ELSE 'function' END AS kind,
         CASE WHEN o.type IN ('FN', 'IF', 'TF') THEN TYPE_NAME(r.user_type_id) ELSE NULL END AS return_type,
         'T-SQL' AS [language]
  FROM sys.objects o
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  LEFT JOIN sys.parameters r ON r.object_id = o.object_id AND r.is_output = 1 AND r.parameter_id = 0
  WHERE o.type IN ('P', 'FN', 'IF', 'TF')
    AND s.name NOT IN (${SYSTEM_SCHEMAS})
  ORDER BY s.name, o.name`

const TRIGGERS_SQL = `
  SELECT s.name AS [schema], t.name AS [name], o.name AS [table],
         CASE WHEN t.is_instead_of_trigger = 1 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
         STUFF((
           SELECT ', ' + te.type_desc
           FROM sys.trigger_events te
           WHERE te.object_id = t.object_id
           ORDER BY te.type_desc
           FOR XML PATH(''), TYPE
         ).value('.', 'nvarchar(max)'), 1, 2, '') AS events
  FROM sys.triggers t
  JOIN sys.objects o ON o.object_id = t.parent_id
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  WHERE t.is_ms_shipped = 0
    AND s.name NOT IN (${SYSTEM_SCHEMAS})
  ORDER BY s.name, o.name, t.name`

const INDEXES_SQL = `
  SELECT s.name AS [schema], i.name AS [name], o.name AS [table],
         i.is_unique AS is_unique, i.is_primary_key AS is_primary,
         STUFF((
           SELECT ', ' + c.name
           FROM sys.index_columns ic
           JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
           WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
             AND ic.is_included_column = 0
           ORDER BY ic.key_ordinal
           FOR XML PATH(''), TYPE
         ).value('.', 'nvarchar(max)'), 1, 2, '') AS columns
  FROM sys.indexes i
  JOIN sys.objects o ON o.object_id = i.object_id
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  WHERE i.type > 0
    AND o.type IN ('U', 'V')
    AND i.name IS NOT NULL
    AND s.name NOT IN (${SYSTEM_SCHEMAS})
  ORDER BY s.name, o.name, i.name`

const FOREIGN_KEYS_SQL = `
  SELECT s.name AS [schema], o.name AS [table],
         rs.name AS referenced_schema, ro.name AS referenced_table,
         fk.name AS constraint_name,
         fkc.constraint_column_id AS ord,
         pc.name AS column_name,
         rc.name AS referenced_column
  FROM sys.foreign_keys fk
  JOIN sys.objects o ON o.object_id = fk.parent_object_id
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  JOIN sys.objects ro ON ro.object_id = fk.referenced_object_id
  JOIN sys.schemas rs ON rs.schema_id = ro.schema_id
  JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
  JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
  JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
  WHERE s.name NOT IN (${SYSTEM_SCHEMAS})
  ORDER BY s.name, o.name, fk.name, fkc.constraint_column_id`

interface SchemaRow {
  schema: string
}
interface RelationRow {
  schema: string
  name: string
  kind: RelationKind
  estimated_rows: string | number | null
}
interface ColumnRow {
  schema: string
  relation: string
  name: string
  data_type: string
  nullable: boolean
  default_value: string | null
  is_primary_key: boolean | number
}
interface RoutineRow {
  schema: string
  name: string
  kind: 'function' | 'procedure'
  return_type: string | null
  language: string | null
}
interface TriggerRow {
  schema: string
  name: string
  table: string
  timing: string
  events: string
}
interface IndexRow {
  schema: string
  name: string
  table: string
  is_unique: boolean | number
  is_primary: boolean | number
  columns: string | null
}
interface ForeignKeyRow {
  schema: string
  table: string
  referenced_schema: string
  referenced_table: string
  constraint_name: string
  ord: number
  column_name: string
  referenced_column: string
}

function relationKey(schema: string, name: string): string {
  return `${schema} ${name}`
}

function toEstimatedRows(raw: string | number | null): number | null {
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function toBool(value: boolean | number | undefined): boolean {
  return value === true || value === 1
}

/** Run the full set of catalog queries and assemble a SchemaSnapshot. */
export async function introspectMssql(pool: ConnectionPool): Promise<SchemaSnapshot> {
  const fetchedAt = new Date().toISOString()

  const [schemas, relations, columns, routines, triggers, indexes, foreignKeys] =
    await Promise.all([
      pool.request().query<SchemaRow>(SCHEMAS_SQL),
      pool.request().query<RelationRow>(RELATIONS_SQL),
      pool.request().query<ColumnRow>(COLUMNS_SQL),
      pool.request().query<RoutineRow>(ROUTINES_SQL),
      pool.request().query<TriggerRow>(TRIGGERS_SQL),
      pool.request().query<IndexRow>(INDEXES_SQL),
      pool.request().query<ForeignKeyRow>(FOREIGN_KEYS_SQL)
    ])

  // Bucket columns by their owning relation for an O(1) join below.
  const columnsByRelation = new Map<string, ColumnInfo[]>()
  for (const row of columns.recordset) {
    const key = relationKey(row.schema, row.relation)
    const list = columnsByRelation.get(key) ?? []
    list.push({
      name: row.name,
      dataType: row.data_type,
      nullable: row.nullable,
      isPrimaryKey: toBool(row.is_primary_key),
      defaultValue: row.default_value
    })
    if (list.length === 1) columnsByRelation.set(key, list)
  }

  const relationInfos: RelationInfo[] = relations.recordset.map((row) => ({
    schema: row.schema,
    name: row.name,
    kind: row.kind,
    estimatedRows: toEstimatedRows(row.estimated_rows),
    columns: columnsByRelation.get(relationKey(row.schema, row.name)) ?? []
  }))

  const routineInfos: RoutineInfo[] = routines.recordset.map((row) => ({
    schema: row.schema,
    name: row.name,
    kind: row.kind,
    returnType: row.return_type,
    language: row.language
  }))

  const triggerInfos: TriggerInfo[] = triggers.recordset.map((row) => ({
    schema: row.schema,
    name: row.name,
    table: row.table,
    timing: row.timing,
    events: row.events
  }))

  const indexInfos: IndexInfo[] = indexes.recordset.map((row) => ({
    schema: row.schema,
    name: row.name,
    table: row.table,
    isUnique: toBool(row.is_unique),
    isPrimary: toBool(row.is_primary),
    definition: `${toBool(row.is_unique) ? 'UNIQUE ' : ''}(${row.columns ?? ''})`
  }))

  // Collapse the per-column FK rows into one entry per constraint.
  const fkMap = new Map<
    string,
    {
      schema: string
      table: string
      referencedSchema: string
      referencedTable: string
      constraintName: string
      columns: string[]
      referencedColumns: string[]
    }
  >()
  for (const row of foreignKeys.recordset) {
    const key = `${row.schema}.${row.table}.${row.constraint_name}`
    const entry =
      fkMap.get(key) ??
      {
        schema: row.schema,
        table: row.table,
        referencedSchema: row.referenced_schema,
        referencedTable: row.referenced_table,
        constraintName: row.constraint_name,
        columns: [],
        referencedColumns: []
      }
    entry.columns[row.ord - 1] = row.column_name
    entry.referencedColumns[row.ord - 1] = row.referenced_column
    fkMap.set(key, entry)
  }
  const foreignKeyInfos: ForeignKeyInfo[] = [...fkMap.values()].map((entry) => ({
    schema: entry.schema,
    table: entry.table,
    columns: entry.columns.filter(Boolean),
    referencedSchema: entry.referencedSchema,
    referencedTable: entry.referencedTable,
    referencedColumns: entry.referencedColumns.filter(Boolean),
    constraintName: entry.constraintName
  }))

  return {
    schemas: schemas.recordset.map((row) => row.schema),
    relations: relationInfos,
    routines: routineInfos,
    triggers: triggerInfos,
    indexes: indexInfos,
    foreignKeys: foreignKeyInfos,
    fetchedAt
  }
}
