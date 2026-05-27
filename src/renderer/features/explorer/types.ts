export type TreeNodeKind =
  | 'schema'
  | 'group'
  | 'table'
  | 'view'
  | 'materialized_view'
  | 'column'
  | 'function'
  | 'procedure'
  | 'trigger'
  | 'index'

/** A node in the schema explorer tree, built from a SchemaSnapshot. */
export interface TreeNode {
  id: string
  label: string
  kind: TreeNodeKind
  /** Right-aligned subtle text — a data type, row estimate, owning table, etc. */
  detail?: string
  /** Item count, for group nodes. */
  count?: number
  /** True for primary-key columns. */
  pk?: boolean
  /** Set on table/view nodes — double-clicking opens this table's data viewer. */
  openTable?: { schema: string; table: string }
  children?: TreeNode[]
}
