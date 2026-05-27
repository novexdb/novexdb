export interface TableColumn {
  name: string
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
}

/** One page of a table's data, plus the metadata the editor needs. */
export interface TableDataPage {
  columns: TableColumn[]
  rows: unknown[][]
  totalRows: number
  /** False when the table has no primary key — the grid then renders read-only. */
  editable: boolean
}

export interface TableFetchPayload {
  connectionId: string
  schema: string
  table: string
  limit: number
  offset: number
  /** Column name to sort by, or null for natural order. */
  orderBy: string | null
  orderDir: 'asc' | 'desc'
  /** Substring to match against every column (cast to text). Empty = no filter. */
  search: string
}

/** A staged new row — only the columns the user filled in. */
export interface RowInsert {
  values: Record<string, unknown>
}

/** A staged edit to an existing row — `pk` identifies it, `set` is what changed. */
export interface RowUpdate {
  pk: Record<string, unknown>
  set: Record<string, unknown>
}

export interface RowDelete {
  pk: Record<string, unknown>
}

export interface TableChangeSet {
  inserts: RowInsert[]
  updates: RowUpdate[]
  deletes: RowDelete[]
}

export interface TableMutatePayload {
  connectionId: string
  schema: string
  table: string
  changes: TableChangeSet
}

export interface TableMutateResult {
  inserted: number
  updated: number
  deleted: number
}

export const DEFAULT_PAGE_SIZE = 100
export const PAGE_SIZE_OPTIONS = [50, 100, 200, 500]
