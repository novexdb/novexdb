/**
 * Shared types for the Connected-Transaction Delete (a.k.a. cascade-delete)
 * pipeline. The renderer never builds these — it sends a `CascadeScanRequest`,
 * the main process walks the FK graph and replies with a `CascadeScanResult`.
 */

/** One row anywhere in the dependency tree (root or descendant). */
export interface CascadeNode {
  /** Stable id for the renderer's tree (parentId + table + pk hash). */
  id: string
  schema: string
  table: string
  /** Primary-key column values that uniquely identify this row. */
  rowKey: Record<string, unknown>
  /**
   * Every column on this row — populated by the scanner so the modal can
   * show "what is actually being deleted" instead of only the PK. `null`
   * when the scanner failed to fetch the row body (the node is still
   * shown, just without expanded detail).
   */
  fullRow: Record<string, unknown> | null
  /**
   * Set when `fullRow` is null *because the fetch errored* — surface this
   * verbatim in the UI so "unavailable" is never silent. `null`/absent if
   * the fetch succeeded but returned zero rows (row already deleted).
   */
  fullRowError?: string
  /** Constraint that linked this row to its parent. `null` for root nodes. */
  viaConstraint: string | null
  /** Source column on this table that referenced the parent. `null` for root. */
  viaColumn: string | null
  /** Rows in other tables that reference *this* row. */
  children: CascadeNode[]
  /** Set when scanning hit the per-table row cap — the subtree is partial. */
  truncated?: { foundSoFar: number; limit: number }
}

/** Request to start a cascade scan from one or more root rows. */
export interface CascadeScanRequest {
  connectionId: string
  schema: string
  table: string
  /** PK column→value maps for each root row. */
  rowKeys: Record<string, unknown>[]
  /** Bound the recursion depth — protects against pathological deep chains. */
  maxDepth?: number
  /** Per-table row cap — protects against "one row references half the DB". */
  maxRowsPerTable?: number
}

/** Result of a cascade scan — the tree, plus warnings about caps hit. */
export interface CascadeScanResult {
  roots: CascadeNode[]
  /** Total descendant rows across the tree (excludes the roots themselves). */
  totalDescendants: number
  /** Tables whose children were truncated, with the cap they hit. */
  truncatedTables: { schema: string; table: string; foundSoFar: number; limit: number }[]
  /**
   * FKs we *discovered* pointing at a row in the tree but couldn't follow —
   * usually because the row we have doesn't carry the column the FK refers
   * to. The modal lists these so "0 descendants" is never silent: the user
   * sees that we tried, what we tried, and what was missing.
   */
  unresolvedFks: {
    childSchema: string
    childTable: string
    constraintName: string
    missingParentColumns: string[]
  }[]
  /** ms taken to walk the graph — useful for the modal's "scan finished in X ms" line. */
  durationMs: number
}

/** One row the user kept checked in the modal — flattened for execution. */
export interface CascadeSelection {
  schema: string
  table: string
  rowKey: Record<string, unknown>
}

/** Request to actually run the cascade — sent only after the user confirms. */
export interface CascadeExecuteRequest {
  connectionId: string
  selections: CascadeSelection[]
  /** When true, the executor prints the plan but commits no deletions. */
  dryRun?: boolean
}

/** Per-table summary returned to the renderer for the "Done" toast. */
export interface CascadeDeletionStat {
  schema: string
  table: string
  count: number
}

export interface CascadeExecuteResult {
  /** Per-table count of rows actually deleted (or that *would* be in dry-run). */
  deleted: CascadeDeletionStat[]
  durationMs: number
  dryRun: boolean
}
