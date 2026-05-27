import type {
  RowDelete,
  RowInsert,
  RowUpdate,
  TableChangeSet,
  TableColumn,
  TableDataPage
} from '@shared/types/table-data'
import type { TableTabData } from '@renderer/features/table-data/stores/tableDataStore'

const KEY_SEPARATOR = ''

/** Column indexes that make up the primary key. */
export function primaryKeyIndexes(columns: TableColumn[]): number[] {
  const indexes: number[] = []
  columns.forEach((column, index) => {
    if (column.isPrimaryKey) indexes.push(index)
  })
  return indexes
}

/** A stable key for an existing row, derived from its primary-key values. */
export function computeRowKey(row: unknown[], pkIndexes: number[]): string {
  return pkIndexes.map((index) => String(row[index])).join(KEY_SEPARATOR)
}

/** Empty input on a nullable column becomes SQL NULL; otherwise the raw text. */
export function coerceInput(text: string, column: TableColumn): unknown {
  if (text === '' && column.nullable) return null
  return text
}

/** A new row only counts as a staged change once the user has typed
 *  something into it — bare "Add Row" clicks don't dirty the table. */
function filledNewRowCount(data: TableTabData): number {
  return data.newRows.filter((row) => Object.keys(row.values).length > 0).length
}

export function hasStagedChanges(data: TableTabData): boolean {
  return (
    filledNewRowCount(data) > 0 ||
    data.deleted.length > 0 ||
    Object.values(data.edits).some((columns) => Object.keys(columns).length > 0)
  )
}

export interface PendingCounts {
  edited: number
  added: number
  removed: number
}

export function pendingCounts(data: TableTabData): PendingCounts {
  return {
    edited: Object.values(data.edits).filter((c) => Object.keys(c).length > 0).length,
    added: filledNewRowCount(data),
    removed: data.deleted.length
  }
}

/** Build the transactional change set sent to the main process on Save. */
export function buildChangeSet(page: TableDataPage, data: TableTabData): TableChangeSet {
  const pkIndexes = primaryKeyIndexes(page.columns)
  const pkNames = pkIndexes.map((index) => page.columns[index].name)

  const rowByKey = new Map<string, unknown[]>()
  for (const row of page.rows) rowByKey.set(computeRowKey(row, pkIndexes), row)

  const primaryKeyOf = (row: unknown[]): Record<string, unknown> => {
    const pk: Record<string, unknown> = {}
    pkIndexes.forEach((index, position) => {
      pk[pkNames[position]] = row[index]
    })
    return pk
  }

  const deletes: RowDelete[] = []
  for (const rowKey of data.deleted) {
    const row = rowByKey.get(rowKey)
    if (row) deletes.push({ pk: primaryKeyOf(row) })
  }

  const updates: RowUpdate[] = []
  for (const [rowKey, changed] of Object.entries(data.edits)) {
    if (data.deleted.includes(rowKey)) continue
    const row = rowByKey.get(rowKey)
    if (!row || Object.keys(changed).length === 0) continue
    updates.push({ pk: primaryKeyOf(row), set: changed })
  }

  const inserts: RowInsert[] = data.newRows
    .filter((newRow) => Object.keys(newRow.values).length > 0)
    .map((newRow) => ({ values: newRow.values }))

  return { inserts, updates, deletes }
}
