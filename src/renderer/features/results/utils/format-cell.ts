/** True for SQL NULL values (also treats undefined as null). */
export function isNull(value: unknown): boolean {
  return value === null || value === undefined
}

/** Render any cell value as display text. */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return `[${value.byteLength} bytes]`
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}
