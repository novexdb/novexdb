import type { QueryColumn } from '@shared/types/query'
import { formatCellValue } from '@renderer/features/results/utils/format-cell'

function csvCell(value: unknown): string {
  const text = formatCellValue(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Serialize a result set to CSV text. */
export function toCsv(columns: QueryColumn[], rows: unknown[][]): string {
  const header = columns.map((column) => csvCell(column.name)).join(',')
  const body = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  return body ? `${header}\n${body}` : header
}

/** Serialize a result set to a pretty-printed JSON array of row objects. */
export function toJson(columns: QueryColumn[], rows: unknown[][]): string {
  const objects = rows.map((row) => {
    const record: Record<string, unknown> = {}
    columns.forEach((column, index) => {
      record[column.name] = row[index] ?? null
    })
    return record
  })
  return JSON.stringify(objects, null, 2)
}
