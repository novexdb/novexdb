import { connectionManager } from '@main/services/connection-manager'
import type {
  ForeignKeyInfo,
  IndexInfo,
  SchemaSnapshot
} from '@shared/types/schema'

const SCHEMA_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  snapshot: SchemaSnapshot
  fetchedAt: number
}

const schemaCache = new Map<string, CacheEntry>()

/** Return a connection's schema, re-introspecting only when the cache is stale. */
export async function getSchema(connectionId: string): Promise<SchemaSnapshot> {
  const cached = schemaCache.get(connectionId)
  if (cached && Date.now() - cached.fetchedAt < SCHEMA_TTL_MS) {
    return cached.snapshot
  }
  const snapshot = await connectionManager.introspect(connectionId)
  schemaCache.set(connectionId, { snapshot, fetchedAt: Date.now() })
  return snapshot
}

/** Drop a connection's cached schema (e.g. after a disconnect). */
export function invalidateSchemaCache(connectionId: string): void {
  schemaCache.delete(connectionId)
}

function indexColumns(definition: string): string {
  return definition.match(/\(([^)]+)\)/)?.[1] ?? ''
}

/**
 * Render a SchemaSnapshot as compact, token-efficient text for prompt injection.
 * Every table lists its columns, primary keys, foreign-key arrows and indexes.
 */
export function buildSchemaContext(snapshot: SchemaSnapshot): string {
  const lines: string[] = ['# DATABASE SCHEMA', '']

  const indexesByRelation = new Map<string, IndexInfo[]>()
  for (const index of snapshot.indexes) {
    const key = `${index.schema}.${index.table}`
    const list = indexesByRelation.get(key) ?? []
    list.push(index)
    indexesByRelation.set(key, list)
  }

  const fksByRelation = new Map<string, ForeignKeyInfo[]>()
  for (const fk of snapshot.foreignKeys) {
    const key = `${fk.schema}.${fk.table}`
    const list = fksByRelation.get(key) ?? []
    list.push(fk)
    fksByRelation.set(key, list)
  }

  for (const schema of snapshot.schemas) {
    const relations = snapshot.relations.filter((r) => r.schema === schema)
    const routines = snapshot.routines.filter((r) => r.schema === schema)
    if (relations.length === 0 && routines.length === 0) continue

    lines.push(`## SCHEMA ${schema}`, '')

    for (const relation of relations) {
      const kind =
        relation.kind === 'table'
          ? 'TABLE'
          : relation.kind === 'view'
            ? 'VIEW'
            : 'MATERIALIZED VIEW'
      const rowEstimate =
        relation.estimatedRows !== null ? `  (~${relation.estimatedRows} rows)` : ''
      lines.push(`### ${kind} ${relation.schema}.${relation.name}${rowEstimate}`)

      for (const column of relation.columns) {
        const flags = [
          column.isPrimaryKey ? 'PK' : null,
          column.nullable ? null : 'NOT NULL',
          column.defaultValue ? `DEFAULT ${column.defaultValue}` : null
        ]
          .filter((flag): flag is string => flag !== null)
          .join(' ')
        lines.push(`- ${column.name}: ${column.dataType}${flags ? ` ${flags}` : ''}`)
      }

      for (const fk of fksByRelation.get(`${relation.schema}.${relation.name}`) ?? []) {
        lines.push(
          `  FK (${fk.columns.join(', ')}) -> ${fk.referencedSchema}.${fk.referencedTable}(${fk.referencedColumns.join(', ')})`
        )
      }
      for (const index of indexesByRelation.get(`${relation.schema}.${relation.name}`) ?? []) {
        lines.push(
          `  INDEX ${index.name}${index.isUnique ? ' UNIQUE' : ''} (${indexColumns(index.definition)})`
        )
      }
      lines.push('')
    }

    if (routines.length > 0) {
      lines.push(`### ROUTINES in ${schema}`)
      for (const routine of routines) {
        lines.push(
          `- ${routine.kind} ${routine.schema}.${routine.name} -> ${routine.returnType ?? 'void'}`
        )
      }
      lines.push('')
    }
  }

  if (snapshot.triggers.length > 0) {
    lines.push('## TRIGGERS')
    for (const trigger of snapshot.triggers) {
      lines.push(
        `- ${trigger.name}: ${trigger.timing} ${trigger.events} ON ${trigger.schema}.${trigger.table}`
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}
