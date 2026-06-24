import { describe, expect, it } from 'vitest'
import { statementAtOffset } from '@renderer/features/editor/utils/statements'

/** Find the offset of `marker` in `sql` (and the sql with the marker removed). */
function at(sqlWithCursor: string): { sql: string; offset: number } {
  const offset = sqlWithCursor.indexOf('|')
  return { sql: sqlWithCursor.replace('|', ''), offset }
}

function run(sqlWithCursor: string): string {
  const { sql, offset } = at(sqlWithCursor)
  return statementAtOffset(sql, offset)
}

describe('statementAtOffset', () => {
  it('returns the whole buffer when there is a single statement', () => {
    expect(run('SELECT * FROM users WHERE id| = 1')).toBe('SELECT * FROM users WHERE id = 1')
  })

  it('runs the statement the cursor sits in, not its neighbours', () => {
    const sql = 'SELECT 1;\nSELECT 2;\nSELECT 3;'
    expect(statementAtOffset(sql, sql.indexOf('1'))).toBe('SELECT 1;')
    expect(statementAtOffset(sql, sql.indexOf('2'))).toBe('SELECT 2;')
    expect(statementAtOffset(sql, sql.indexOf('3'))).toBe('SELECT 3;')
  })

  it('keeps the trailing semicolon of the chosen statement', () => {
    expect(run('SELECT |1; SELECT 2;')).toBe('SELECT 1;')
  })

  it('treats the end of a statement line (just after the ;) as that statement', () => {
    // Cursor right after the first semicolon, before the newline.
    expect(run('SELECT 1;|\nSELECT 2;')).toBe('SELECT 1;')
  })

  it('attaches a cursor in the blank gap to the preceding statement', () => {
    expect(run('SELECT 1;\n|\nSELECT 2;')).toBe('SELECT 1;')
  })

  it('runs the last statement when the cursor is at the very end', () => {
    const sql = 'SELECT 1;\nSELECT 2;'
    expect(statementAtOffset(sql, sql.length)).toBe('SELECT 2;')
  })

  it('runs the first statement when the cursor precedes all of them', () => {
    expect(statementAtOffset('   SELECT 1;\nSELECT 2;', 0)).toBe('SELECT 1;')
  })

  it('ignores semicolons inside single-quoted strings', () => {
    expect(run("SELECT 'a; b' AS |x; SELECT 2;")).toBe("SELECT 'a; b' AS x;")
  })

  it('handles MySQL backslash-escaped quotes inside strings', () => {
    expect(run("SELECT 'it\\'s; here' AS |v; SELECT 2;")).toBe("SELECT 'it\\'s; here' AS v;")
  })

  it('ignores semicolons inside double-quoted identifiers', () => {
    expect(run('SELECT 1 AS "a;b"|; SELECT 2;')).toBe('SELECT 1 AS "a;b";')
  })

  it('ignores semicolons inside backtick identifiers', () => {
    expect(run('SELECT 1 AS `a;b`|; SELECT 2;')).toBe('SELECT 1 AS `a;b`;')
  })

  it('ignores semicolons inside line comments', () => {
    expect(run('SELECT 1 -- a; b\n|+ 2; SELECT 3;')).toBe('SELECT 1 -- a; b\n+ 2;')
  })

  it('ignores semicolons inside block comments', () => {
    expect(run('SELECT 1 /* a; b */ + |2; SELECT 3;')).toBe('SELECT 1 /* a; b */ + 2;')
  })

  it('ignores semicolons inside a Postgres dollar-quoted block', () => {
    const sql = [
      'CREATE FUNCTION f() RETURNS int AS $$',
      'BEGIN',
      '  RETURN 1;',
      'END;',
      '$$ LANGUAGE plpgsql;',
      'SELECT f();'
    ].join('\n')
    const cursor = sql.indexOf('RETURN')
    expect(statementAtOffset(sql, cursor)).toBe(
      'CREATE FUNCTION f() RETURNS int AS $$\nBEGIN\n  RETURN 1;\nEND;\n$$ LANGUAGE plpgsql;'
    )
    expect(statementAtOffset(sql, sql.indexOf('SELECT f'))).toBe('SELECT f();')
  })

  it('handles tagged dollar-quote blocks', () => {
    const sql = "SELECT $tag$ a; b $tag$ AS x; SELECT 2;"
    expect(statementAtOffset(sql, sql.indexOf('a;'))).toBe('SELECT $tag$ a; b $tag$ AS x;')
  })

  it('does not treat a $1 placeholder as a dollar-quote', () => {
    const sql = 'SELECT * FROM t WHERE id = $1; SELECT 2;'
    expect(statementAtOffset(sql, sql.indexOf('id'))).toBe('SELECT * FROM t WHERE id = $1;')
  })

  it('returns an empty string for blank or comment-free empty input', () => {
    expect(statementAtOffset('', 0)).toBe('')
    expect(statementAtOffset('   \n  ', 3)).toBe('')
  })
})
