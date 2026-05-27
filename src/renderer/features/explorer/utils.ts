import type { RelationInfo, RoutineInfo, SchemaSnapshot } from '@shared/types/schema'
import type { TreeNode } from '@renderer/features/explorer/types'

/** Compact a large row estimate, e.g. 12500 -> "12.5k". */
export function formatRowEstimate(rows: number): string {
  if (rows < 1000) return `${rows}`
  if (rows < 1_000_000) return `${(rows / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${(rows / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

function relationNode(relation: RelationInfo): TreeNode {
  return {
    id: `relation:${relation.schema}.${relation.name}`,
    label: relation.name,
    kind: relation.kind,
    detail:
      relation.estimatedRows !== null
        ? `~${formatRowEstimate(relation.estimatedRows)}`
        : undefined,
    // Leaf node — columns, indexes and triggers live in the data viewer's
    // Structure tab, not the sidebar.
    openTable: { schema: relation.schema, table: relation.name }
  }
}

function routineNode(routine: RoutineInfo): TreeNode {
  return {
    id: `routine:${routine.schema}.${routine.name}`,
    label: routine.name,
    kind: routine.kind,
    detail: routine.returnType ?? routine.language ?? undefined
  }
}

function groupNode(
  schema: string,
  key: string,
  label: string,
  children: TreeNode[]
): TreeNode {
  return { id: `group:${schema}.${key}`, label, kind: 'group', count: children.length, children }
}

/**
 * Build the explorer tree from a snapshot, filtered by a case-insensitive name
 * match. The sidebar surfaces only Tables (tables + views) and Functions.
 *
 * When not filtering, every schema always shows its Tables and Functions
 * folders — even when empty — so a brand-new database still has a Tables folder
 * to right-click for Import / New Table.
 */
export function buildTree(snapshot: SchemaSnapshot, filter: string): TreeNode[] {
  const needle = filter.trim().toLowerCase()
  const isFiltering = needle !== ''
  const matches = (name: string): boolean =>
    !isFiltering || name.toLowerCase().includes(needle)

  const schemaNodes: TreeNode[] = []

  for (const schema of snapshot.schemas) {
    const relations = snapshot.relations.filter(
      (r) => r.schema === schema && matches(r.name)
    )
    const routines = snapshot.routines.filter((r) => r.schema === schema && matches(r.name))

    const groups: TreeNode[] = []
    if (relations.length || !isFiltering) {
      groups.push(groupNode(schema, 'tables', 'Tables', relations.map(relationNode)))
    }
    if (routines.length || !isFiltering) {
      groups.push(groupNode(schema, 'functions', 'Functions', routines.map(routineNode)))
    }

    if (groups.length > 0) {
      schemaNodes.push({ id: `schema:${schema}`, label: schema, kind: 'schema', children: groups })
    }
  }

  return schemaNodes
}
