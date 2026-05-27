/**
 * Pure helpers that turn data-grid rows into text destined for the clipboard
 * or a file — kept out of DataGrid.tsx so the grid file stays readable.
 */
import type { QueryColumn } from '@shared/types/query'
import type { TableColumn } from '@shared/types/table-data'
import type { DatabaseEngine } from '@shared/types/connection'
import { formatCellValue } from '@renderer/features/results/utils/format-cell'
import { toCsv, toJson } from '@renderer/features/results/utils/export'
import { quoteIdent, quoteLiteral, quoteMysqlIdent, quoteRelation } from '@renderer/utils/sql'

/** `toCsv` / `toJson` only consult column names — narrow `TableColumn` to that shape. */
function toQueryColumns(columns: TableColumn[]): QueryColumn[] {
  return columns.map((column) => ({ name: column.name, dataTypeId: 0 }))
}

/** CSV serialization of the given rows under the given column order. */
export function rowsCsv(columns: TableColumn[], rows: unknown[][]): string {
  return toCsv(toQueryColumns(columns), rows)
}

/** Pretty-printed JSON array of row objects. */
export function rowsJson(columns: TableColumn[], rows: unknown[][]): string {
  return toJson(toQueryColumns(columns), rows)
}

/** Every value in `colIndex` across `rows`, newline-joined and NULL-aware. */
export function columnValuesText(rows: unknown[][], colIndex: number): string {
  return rows
    .map((row) => {
      const value = row[colIndex]
      return value === null || value === undefined ? 'NULL' : formatCellValue(value)
    })
    .join('\n')
}

/** Format one cell value as a SQL literal. Numbers/booleans inlined, strings quoted. */
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return quoteLiteral(value.toISOString())
  if (typeof value === 'object') return quoteLiteral(JSON.stringify(value))
  return quoteLiteral(String(value))
}

/**
 * Build one `INSERT INTO …` statement per row, engine-aware. Column names are
 * quoted with the engine's identifier style; literal values are escaped via
 * `quoteLiteral` so a stray apostrophe can't break the output.
 */
export function buildSqlInserts(
  engine: DatabaseEngine,
  schema: string,
  table: string,
  columns: TableColumn[],
  rows: unknown[][]
): string {
  const relation = quoteRelation(engine, schema, table)
  const quoteColumn = engine === 'mysql' ? quoteMysqlIdent : quoteIdent
  const columnList = columns.map((column) => quoteColumn(column.name)).join(', ')
  return rows
    .map((row) => {
      const values = columns.map((_, index) => sqlLiteral(row[index])).join(', ')
      return `INSERT INTO ${relation} (${columnList}) VALUES (${values});`
    })
    .join('\n')
}
