import type { ImportCell, ParsedTable } from '@renderer/features/explorer/import/infer'

/** Pad/truncate a raw row to the header width; empty fields become null. */
function normalizeRow(raw: string[], width: number): ImportCell[] {
  const out: ImportCell[] = []
  for (let c = 0; c < width; c += 1) {
    const value = raw[c]
    out.push(value === undefined || value === '' ? null : value)
  }
  return out
}

/**
 * Parse CSV text into headers and data rows. Best-effort RFC-4180: handles
 * quoted fields with embedded commas, newlines and `""`-escaped quotes, and
 * both CRLF and LF line endings. The first row is taken as the header.
 */
export function parseCsv(text: string): ParsedTable {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // strip a leading BOM
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const endField = (): void => {
    row.push(field)
    field = ''
  }
  const endRow = (): void => {
    endField()
    rows.push(row)
    row = []
  }

  while (i < input.length) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i += 1
        }
      } else {
        field += char
        i += 1
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
    } else if (char === ',') {
      endField()
      i += 1
    } else if (char === '\r') {
      i += 1
      if (input[i] === '\n') i += 1
      endRow()
    } else if (char === '\n') {
      i += 1
      endRow()
    } else {
      field += char
      i += 1
    }
  }
  // Flush a trailing field/row that did not end in a newline.
  if (field !== '' || row.length > 0) endRow()

  // Drop trailing all-empty rows (e.g. a file ending with a newline).
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) {
    rows.pop()
  }

  if (rows.length === 0) {
    throw new Error('The CSV file is empty.')
  }

  const headers = rows[0].map((h) => h.trim())
  const dataRows = rows.slice(1).map((r) => normalizeRow(r, headers.length))
  return { headers, rows: dataRows }
}
