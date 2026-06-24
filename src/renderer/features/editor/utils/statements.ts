/**
 * Split SQL into individual statements on top-level semicolons and find the one
 * under the editor cursor. Semicolons inside string literals, quoted
 * identifiers, line/block comments, and Postgres dollar-quoted blocks are
 * ignored, so a `;` in a function body or a literal never splits a statement.
 */

const TAG_START = /[A-Za-z_]/
const TAG_BODY = /[A-Za-z0-9_]/
/** A dollar-quote tag longer than this is treated as a literal `$`. */
const MAX_DOLLAR_TAG = 64

/** A half-open `[start, end)` slice of the source covering one raw segment. */
interface Segment {
  start: number
  end: number
}

/** A non-empty statement and the `[start, end)` range of its trimmed text. */
interface Statement {
  start: number
  end: number
  text: string
}

/**
 * Inspect a `$` at `sql[i]`. Returns the full `$tag$` delimiter, or `null` when
 * it is just a literal `$` (a `$1` placeholder, the `#>`-style nothing — any
 * `$` that doesn't open a dollar-quoted block).
 */
function readDollarTag(sql: string, i: number): string | null {
  const n = sql.length
  if (i + 1 >= n) return null
  if (sql[i + 1] === '$') return '$$'
  if (!TAG_START.test(sql[i + 1])) return null
  let j = i + 2
  while (j < n && TAG_BODY.test(sql[j])) {
    if (j - i > MAX_DOLLAR_TAG) return null
    j += 1
  }
  return j < n && sql[j] === '$' ? sql.slice(i, j + 1) : null
}

/** Advance past a quoted run that opens at `sql[start]` (the opening quote). */
function skipQuoted(sql: string, start: number, quote: string): number {
  const n = sql.length
  // Backtick identifiers don't honour backslash escapes; strings (MySQL) do.
  const backslashEscapes = quote !== '`'
  let i = start + 1
  while (i < n) {
    const ch = sql[i]
    if (backslashEscapes && ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) {
      if (sql[i + 1] === quote) {
        i += 2 // a doubled quote is an escaped quote — still inside
        continue
      }
      return i + 1
    }
    i += 1
  }
  return n // unterminated — consume the rest
}

/**
 * Carve `sql` into contiguous segments split on top-level semicolons. The
 * segments tile the whole string — every character lands in exactly one — and
 * each keeps its terminating semicolon.
 */
function scanSegments(sql: string): Segment[] {
  const segments: Segment[] = []
  const n = sql.length
  let segStart = 0
  let i = 0

  while (i < n) {
    const ch = sql[i]

    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i + 2)
      i = nl === -1 ? n : nl + 1
      continue
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2)
      i = close === -1 ? n : close + 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipQuoted(sql, i, ch)
      continue
    }
    if (ch === '$') {
      const tag = readDollarTag(sql, i)
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length)
        i = close === -1 ? n : close + tag.length
        continue
      }
    }
    if (ch === ';') {
      segments.push({ start: segStart, end: i + 1 })
      segStart = i + 1
    }
    i += 1
  }

  if (segStart < n || segments.length === 0) {
    segments.push({ start: segStart, end: n })
  }
  return segments
}

/** Every non-empty statement in `sql`, ordered, with trimmed-text ranges. */
function scanStatements(sql: string): Statement[] {
  const statements: Statement[] = []
  for (const seg of scanSegments(sql)) {
    const raw = sql.slice(seg.start, seg.end)
    const text = raw.trim()
    if (!text) continue
    const start = seg.start + (raw.length - raw.trimStart().length)
    statements.push({ start, end: start + text.length, text })
  }
  return statements
}

/**
 * The single SQL statement under `offset`, trimmed (semicolon kept). When the
 * cursor sits in the whitespace or comment between statements it attaches to
 * the one just before it; an empty result means the buffer has nothing to run.
 */
export function statementAtOffset(sql: string, offset: number): string {
  const statements = scanStatements(sql)
  if (statements.length === 0) return ''

  const pos = Math.max(0, Math.min(offset, sql.length))

  const inside = statements.find((s) => pos >= s.start && pos < s.end)
  if (inside) return inside.text

  // In a gap — attach to the statement just before the cursor, or fall forward
  // to the first when the cursor sits ahead of every statement.
  let preceding: Statement | undefined
  for (const s of statements) {
    if (s.end <= pos) preceding = s
    else break
  }
  return (preceding ?? statements[0]).text
}
