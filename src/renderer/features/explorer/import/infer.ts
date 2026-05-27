import type { ColumnDef, PgColumnType } from '@renderer/features/explorer/ddl'

/** A single imported cell — text, or null for an empty/missing value. */
export type ImportCell = string | null

/** A parsed import file: a header row plus data rows. */
export interface ParsedTable {
  headers: string[]
  rows: ImportCell[][]
}

const SAMPLE_SIZE = 200
const INT4_MIN = -2_147_483_648
const INT4_MAX = 2_147_483_647

/** Make headers safe and unique SQL identifiers (empty → column_N, dedupe). */
function sanitizeHeaders(headers: string[]): string[] {
  const used = new Set<string>()
  return headers.map((raw, index) => {
    const base = raw.trim() === '' ? `column_${index + 1}` : raw.trim()
    let unique = base
    let suffix = 2
    while (used.has(unique.toLowerCase())) {
      unique = `${base}_${suffix}`
      suffix += 1
    }
    used.add(unique.toLowerCase())
    return unique
  })
}

/** Pick the narrowest PostgreSQL type every sampled value fits into. */
function inferType(values: string[]): PgColumnType {
  if (values.length === 0) return 'text'
  const every = (test: (v: string) => boolean): boolean =>
    values.every((v) => test(v.trim()))

  if (every((v) => /^(true|false|t|f)$/i.test(v))) return 'boolean'

  if (every((v) => /^-?\d+$/.test(v))) {
    const fitsInt4 = every((v) => {
      const n = Number(v)
      return Number.isSafeInteger(n) && n >= INT4_MIN && n <= INT4_MAX
    })
    return fitsInt4 ? 'integer' : 'bigint'
  }

  if (every((v) => /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(v))) return 'numeric'

  if (every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)))) {
    return 'date'
  }
  if (every((v) => /^\d{4}-\d{2}-\d{2}[ t]/i.test(v) && !Number.isNaN(Date.parse(v)))) {
    return 'timestamptz'
  }

  if (every((v) => v.startsWith('{') || v.startsWith('['))) return 'jsonb'

  return 'text'
}

/** Infer an editable column definition for each header from a row sample. */
export function inferColumns(table: ParsedTable): ColumnDef[] {
  const names = sanitizeHeaders(table.headers)
  const sample = table.rows.slice(0, SAMPLE_SIZE)
  return names.map((name, col) => {
    const values = sample
      .map((row) => row[col])
      .filter((v): v is string => v !== null && v !== '')
    return {
      name,
      type: inferType(values),
      // Imported columns are always nullable — a later row may have a gap.
      nullable: true,
      primaryKey: false,
      defaultValue: ''
    }
  })
}
