/**
 * A streaming SQL tokenizer for dump files. Fed arbitrary chunks of text, it
 * emits complete SQL statements and `COPY ... FROM stdin` data blocks, keeping
 * all parser state (quotes, comments, dollar-quotes, copy-data mode) across
 * chunk boundaries. Memory stays bounded — only the current statement (or a
 * window of copy data) is buffered.
 */

/** One item produced by the tokenizer. */
export type SqlItem =
  | { kind: 'statement'; sql: string }
  | { kind: 'copy'; sql: string }
  | { kind: 'copyData'; text: string }
  | { kind: 'copyEnd' }

/** A trimmed statement that is a `COPY <table> ... FROM stdin` command. */
const COPY_FROM_STDIN = /^\s*COPY\b[\s\S]+?\bFROM\s+STDIN\b/i
/** Emit accumulated copy data once it reaches this size. */
const COPY_DATA_FLUSH = 256 * 1024
/** A dollar-quote tag longer than this is treated as a literal `$`. */
const MAX_DOLLAR_TAG = 64

const TAG_START = /[A-Za-z_]/
const TAG_BODY = /[A-Za-z0-9_]/

export class SqlTokenizer {
  private mode: 'sql' | 'copy' = 'sql'
  /** Ambiguous suffix that needs the next chunk to be classified. */
  private carry = ''

  // --- sql-mode state ---
  private statement = ''
  private inLineComment = false
  private inBlockComment = false
  private inSingle = false
  private inDouble = false
  private dollarTag: string | null = null

  // --- copy-mode state ---
  private copyExpectNewline = false
  private copyData = ''

  /** MySQL dialect: backslash string escapes + backtick-quoted identifiers. */
  private readonly mysql: boolean
  private inBacktick = false

  constructor(options: { mysql?: boolean } = {}) {
    this.mysql = options.mysql ?? false
  }

  /** Feed a chunk of dump text; returns any items completed by it. */
  feed(input: string): SqlItem[] {
    const items: SqlItem[] = []
    const text = this.carry + input
    this.carry = ''

    let i = 0
    while (i < text.length) {
      i = this.mode === 'sql' ? this.scanSql(text, i, items) : this.scanCopy(text, i, items)
      if (this.carry) return items
    }

    if (this.copyData.length >= COPY_DATA_FLUSH) {
      items.push({ kind: 'copyData', text: this.copyData })
      this.copyData = ''
    }
    return items
  }

  /** Flush trailing state at end of input. Throws on a truncated COPY block. */
  end(): SqlItem[] {
    const items: SqlItem[] = []
    if (this.carry) {
      this.statement += this.carry
      this.carry = ''
    }
    if (this.mode === 'copy') {
      throw new Error('Unexpected end of file inside a COPY block — the dump looks truncated.')
    }
    const sql = this.statement.trim()
    this.statement = ''
    if (sql) items.push({ kind: 'statement', sql })
    return items
  }

  /** Scan in SQL mode from `start`; returns the index reached. */
  private scanSql(text: string, start: number, items: SqlItem[]): number {
    const n = text.length
    let i = start

    while (i < n) {
      const ch = text[i]

      if (this.inLineComment) {
        this.statement += ch
        i += 1
        if (ch === '\n') this.inLineComment = false
        continue
      }

      if (this.inBlockComment) {
        if (ch === '*') {
          if (i + 1 >= n) {
            this.carry = text.slice(i)
            return n
          }
          if (text[i + 1] === '/') {
            this.statement += '*/'
            this.inBlockComment = false
            i += 2
            continue
          }
        }
        this.statement += ch
        i += 1
        continue
      }

      if (this.inSingle || this.inDouble || this.inBacktick) {
        const quote = this.inSingle ? "'" : this.inDouble ? '"' : '`'
        // MySQL: a backslash escapes the next character inside a string.
        if (this.mysql && !this.inBacktick && ch === '\\') {
          if (i + 1 >= n) {
            this.carry = text.slice(i)
            return n
          }
          this.statement += text.slice(i, i + 2)
          i += 2
          continue
        }
        if (ch === quote) {
          if (i + 1 >= n) {
            this.carry = text.slice(i)
            return n
          }
          if (text[i + 1] === quote) {
            this.statement += quote + quote
            i += 2
            continue
          }
          this.statement += ch
          i += 1
          this.inSingle = false
          this.inDouble = false
          this.inBacktick = false
          continue
        }
        this.statement += ch
        i += 1
        continue
      }

      if (this.dollarTag) {
        const idx = text.indexOf(this.dollarTag, i)
        if (idx === -1) {
          // Closing tag not in this chunk — keep a possible partial match.
          const safe = Math.max(i, n - (this.dollarTag.length - 1))
          this.statement += text.slice(i, safe)
          if (safe < n) this.carry = text.slice(safe)
          return n
        }
        this.statement += text.slice(i, idx + this.dollarTag.length)
        i = idx + this.dollarTag.length
        this.dollarTag = null
        continue
      }

      // --- normal SQL ---
      if (ch === "'") {
        this.statement += ch
        this.inSingle = true
        i += 1
        continue
      }
      if (ch === '"') {
        this.statement += ch
        this.inDouble = true
        i += 1
        continue
      }
      if (this.mysql && ch === '`') {
        this.statement += ch
        this.inBacktick = true
        i += 1
        continue
      }
      if (ch === '-') {
        if (i + 1 >= n) {
          this.carry = text.slice(i)
          return n
        }
        if (text[i + 1] === '-') {
          this.statement += '--'
          this.inLineComment = true
          i += 2
          continue
        }
        this.statement += ch
        i += 1
        continue
      }
      if (ch === '/') {
        if (i + 1 >= n) {
          this.carry = text.slice(i)
          return n
        }
        if (text[i + 1] === '*') {
          this.statement += '/*'
          this.inBlockComment = true
          i += 2
          continue
        }
        this.statement += ch
        i += 1
        continue
      }
      if (ch === '$') {
        const tag = this.readDollarTag(text, i)
        if (tag === null) {
          this.carry = text.slice(i)
          return n
        }
        if (tag === '') {
          this.statement += ch
          i += 1
          continue
        }
        this.statement += tag
        this.dollarTag = tag
        i += tag.length
        continue
      }
      if (ch === ';') {
        const sql = this.statement.trim()
        this.statement = ''
        i += 1
        if (sql) {
          if (COPY_FROM_STDIN.test(sql)) {
            items.push({ kind: 'copy', sql })
            this.mode = 'copy'
            this.copyExpectNewline = true
            return i
          }
          items.push({ kind: 'statement', sql })
        }
        continue
      }

      this.statement += ch
      i += 1
    }
    return n
  }

  /**
   * Inspect a `$` at `text[i]`. Returns the full `$tag$` delimiter, `''` when it
   * is a literal `$`, or `null` when more input is needed to decide.
   */
  private readDollarTag(text: string, i: number): string | null {
    const n = text.length
    let j = i + 1
    if (j >= n) return null
    if (text[j] === '$') return '$$'
    if (!TAG_START.test(text[j])) return ''
    j += 1
    while (j < n && TAG_BODY.test(text[j])) {
      if (j - i > MAX_DOLLAR_TAG) return ''
      j += 1
    }
    if (j >= n) return null
    return text[j] === '$' ? text.slice(i, j + 1) : ''
  }

  /** Scan in COPY-data mode from `start`; returns the index reached. */
  private scanCopy(text: string, start: number, items: SqlItem[]): number {
    const n = text.length
    let i = start

    // Skip the remainder of the "COPY ... FROM stdin;" line itself.
    if (this.copyExpectNewline) {
      const nl = text.indexOf('\n', i)
      if (nl === -1) return n
      this.copyExpectNewline = false
      i = nl + 1
    }

    while (i < n) {
      const nl = text.indexOf('\n', i)
      if (nl === -1) {
        this.carry = text.slice(i)
        return n
      }
      const line = text.slice(i, nl)
      const bare = line.endsWith('\r') ? line.slice(0, -1) : line
      if (bare === '\\.') {
        if (this.copyData) {
          items.push({ kind: 'copyData', text: this.copyData })
          this.copyData = ''
        }
        items.push({ kind: 'copyEnd' })
        this.mode = 'sql'
        return nl + 1
      }
      this.copyData += text.slice(i, nl + 1)
      i = nl + 1
      if (this.copyData.length >= COPY_DATA_FLUSH) {
        items.push({ kind: 'copyData', text: this.copyData })
        this.copyData = ''
      }
    }
    return n
  }
}
