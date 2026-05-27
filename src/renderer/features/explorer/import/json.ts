import type { ImportCell, ParsedTable } from '@renderer/features/explorer/import/infer'

/** Coerce one JSON value into a cell — objects/arrays become JSON text. */
function toCell(value: unknown): ImportCell {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return JSON.stringify(value)
}

/**
 * Parse a JSON array of objects into headers and rows. Headers are the union
 * of every object's keys, in first-seen order; missing keys become null.
 */
export function parseJsonRows(text: string): ParsedTable {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON.')
  }

  if (!Array.isArray(data)) {
    throw new Error('Expected a JSON array of objects.')
  }
  if (data.length === 0) {
    throw new Error('The JSON array is empty.')
  }

  const headers: string[] = []
  const seen = new Set<string>()
  for (const item of data) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const key of Object.keys(item)) {
        if (!seen.has(key)) {
          seen.add(key)
          headers.push(key)
        }
      }
    }
  }
  if (headers.length === 0) {
    throw new Error('The JSON array contains no object rows.')
  }

  const rows: ImportCell[][] = data.map((item) => {
    const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    return headers.map((key) => toCell(record[key]))
  })

  return { headers, rows }
}
