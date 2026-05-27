import type { Pool, RowDataPacket } from 'mysql2/promise'
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
 * MySQL introspection. MySQL conflates "database" and "schema", so the snapshot
 * reports a single schema — the connected database — and every relation,
 * routine, etc. is tagged with that database name.
 */

const TABLES_SQL = `
  SELECT table_name AS name, table_type AS type, table_rows AS estimated_rows
  FROM information_schema.tables
  WHERE table_schema = ?
  ORDER BY table_name`

const COLUMNS_SQL = `
  SELECT table_name AS relation, column_name AS name, column_type AS data_type,
         is_nullable AS nullable, column_default AS default_value,
         column_key AS column_key
  FROM information_schema.columns
  WHERE table_schema = ?
  ORDER BY table_name, ordinal_position`

const ROUTINES_SQL = `
  SELECT routine_name AS name, routine_type AS type, dtd_identifier AS return_type
  FROM information_schema.routines
  WHERE routine_schema = ?
  ORDER BY routine_name`

const TRIGGERS_SQL = `
  SELECT trigger_name AS name, event_object_table AS \`table\`,
         action_timing AS timing, event_manipulation AS events
  FROM information_schema.triggers
  WHERE trigger_schema = ?
  ORDER BY event_object_table, trigger_name`

const INDEXES_SQL = `
  SELECT table_name AS \`table\`, index_name AS name, non_unique AS non_unique,
         column_name AS column_name, seq_in_index AS seq
  FROM information_schema.statistics
  WHERE table_schema = ?
  ORDER BY table_name, index_name, seq_in_index`

const FOREIGN_KEYS_SQL = `
  SELECT constraint_name AS constraint_name, table_name AS \`table\`,
         column_name AS column_name, referenced_table_name AS referenced_table,
         referenced_column_name AS referenced_column, ordinal_position AS ord
  FROM information_schema.key_column_usage
  WHERE table_schema = ? AND referenced_table_name IS NOT NULL
  ORDER BY table_name, constraint_name, ordinal_position`

interface TableRow {
  name: string
  type: string
  estimated_rows: number | string | null
}
interface ColumnRow {
  relation: string
  name: string
  data_type: string
  nullable: string
  default_value: string | null
  column_key: string
}
interface RoutineRow {
  name: string
  type: string
  return_type: string | null
}
interface TriggerRow {
  name: string
  table: string
  timing: string
  events: string
}
interface IndexRow {
  table: string
  name: string
  non_unique: number
  column_name: string
  seq: number
}
interface ForeignKeyRow {
  constraint_name: string
  table: string
  column_name: string
  referenced_table: string
  referenced_column: string
  ord: number
}

const RELATION_KINDS: Record<string, RelationKind> = {
  'BASE TABLE': 'table',
  VIEW: 'view'
}

/** Run a parameterized query and return its rows in a caller-chosen shape. */
async function query<T>(pool: Pool, sql: string, params: unknown[]): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params)
  return rows as unknown as T[]
}

function toEstimatedRows(raw: number | string | null): number | null {
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

/** Read the structure of the connected MySQL database into a SchemaSnapshot. */
export async function introspectMysql(pool: Pool): Promise<SchemaSnapshot> {
  const fetchedAt = new Date().toISOString()
  const [dbRows] = await pool.query<RowDataPacket[]>('SELECT DATABASE() AS db')
  const database = (dbRows[0]?.['db'] as string | null) ?? ''
  if (!database) {
    return {
      schemas: [],
      relations: [],
      routines: [],
      triggers: [],
      indexes: [],
      foreignKeys: [],
      fetchedAt
    }
  }

  const [tables, columns, routines, triggers, indexes, foreignKeys] = await Promise.all([
    query<TableRow>(pool, TABLES_SQL, [database]),
    query<ColumnRow>(pool, COLUMNS_SQL, [database]),
    query<RoutineRow>(pool, ROUTINES_SQL, [database]),
    query<TriggerRow>(pool, TRIGGERS_SQL, [database]),
    query<IndexRow>(pool, INDEXES_SQL, [database]),
    query<ForeignKeyRow>(pool, FOREIGN_KEYS_SQL, [database])
  ])

  // Bucket columns by their owning table.
  const columnsByTable = new Map<string, ColumnInfo[]>()
  for (const row of columns) {
    const list = columnsByTable.get(row.relation) ?? []
    list.push({
      name: row.name,
      dataType: row.data_type,
      nullable: row.nullable.toUpperCase() === 'YES',
      isPrimaryKey: row.column_key === 'PRI',
      defaultValue: row.default_value
    })
    if (list.length === 1) columnsByTable.set(row.relation, list)
  }

  const relations: RelationInfo[] = tables.map((row) => ({
    schema: database,
    name: row.name,
    kind: RELATION_KINDS[row.type] ?? 'table',
    estimatedRows: toEstimatedRows(row.estimated_rows),
    columns: columnsByTable.get(row.name) ?? []
  }))

  const routineInfos: RoutineInfo[] = routines.map((row) => ({
    schema: database,
    name: row.name,
    kind: row.type === 'PROCEDURE' ? 'procedure' : 'function',
    returnType: row.return_type,
    language: 'SQL'
  }))

  const triggerInfos: TriggerInfo[] = triggers.map((row) => ({
    schema: database,
    name: row.name,
    table: row.table,
    timing: row.timing,
    events: row.events
  }))

  // Collapse the per-column index rows into one entry per index.
  const indexMap = new Map<
    string,
    { table: string; name: string; unique: boolean; columns: string[] }
  >()
  for (const row of indexes) {
    const key = `${row.table}.${row.name}`
    const entry =
      indexMap.get(key) ??
      { table: row.table, name: row.name, unique: row.non_unique === 0, columns: [] }
    entry.columns[row.seq - 1] = row.column_name
    indexMap.set(key, entry)
  }
  const indexInfos: IndexInfo[] = [...indexMap.values()].map((entry) => ({
    schema: database,
    name: entry.name,
    table: entry.table,
    isUnique: entry.unique,
    isPrimary: entry.name === 'PRIMARY',
    definition: `${entry.unique ? 'UNIQUE ' : ''}(${entry.columns.filter(Boolean).join(', ')})`
  }))

  // Collapse the per-column FK rows into one entry per constraint.
  const fkMap = new Map<
    string,
    {
      table: string
      name: string
      columns: string[]
      referencedTable: string
      referencedColumns: string[]
    }
  >()
  for (const row of foreignKeys) {
    const key = `${row.table}.${row.constraint_name}`
    const entry =
      fkMap.get(key) ??
      {
        table: row.table,
        name: row.constraint_name,
        columns: [],
        referencedTable: row.referenced_table,
        referencedColumns: []
      }
    entry.columns[row.ord - 1] = row.column_name
    entry.referencedColumns[row.ord - 1] = row.referenced_column
    fkMap.set(key, entry)
  }
  const foreignKeyInfos: ForeignKeyInfo[] = [...fkMap.values()].map((entry) => ({
    schema: database,
    table: entry.table,
    columns: entry.columns.filter(Boolean),
    referencedSchema: database,
    referencedTable: entry.referencedTable,
    referencedColumns: entry.referencedColumns.filter(Boolean),
    constraintName: entry.name
  }))

  return {
    schemas: [database],
    relations,
    routines: routineInfos,
    triggers: triggerInfos,
    indexes: indexInfos,
    foreignKeys: foreignKeyInfos,
    fetchedAt
  }
}
