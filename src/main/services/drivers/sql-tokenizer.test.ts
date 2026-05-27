import { describe, expect, it } from 'vitest'
import { SqlTokenizer, type SqlItem } from '@main/services/drivers/sql-tokenizer'

/** Drive a tokenizer with the input split into `chunkSize`-byte pieces. */
function tokenize(input: string, options: { mysql?: boolean; chunkSize?: number } = {}): SqlItem[] {
  const t = new SqlTokenizer(options)
  const items: SqlItem[] = []
  const chunk = options.chunkSize ?? input.length
  for (let i = 0; i < input.length; i += chunk) {
    items.push(...t.feed(input.slice(i, i + chunk)))
  }
  items.push(...t.end())
  return items
}

describe('SqlTokenizer — postgres mode', () => {
  it('splits two statements on the semicolon', () => {
    const items = tokenize('SELECT 1; SELECT 2;')
    expect(items.map((i) => (i.kind === 'statement' ? i.sql : i.kind))).toEqual([
      'SELECT 1',
      'SELECT 2'
    ])
  })

  it('emits a trailing statement without a final semicolon', () => {
    const items = tokenize('SELECT 1')
    expect(items).toEqual([{ kind: 'statement', sql: 'SELECT 1' }])
  })

  it('ignores semicolons inside single-quoted strings', () => {
    const items = tokenize("SELECT ';' AS s; SELECT 2;")
    expect(items.length).toBe(2)
    expect((items[0] as { sql: string }).sql).toBe("SELECT ';' AS s")
  })

  it('handles doubled single-quote escapes inside a string', () => {
    const items = tokenize("SELECT 'it''s ok';")
    expect((items[0] as { sql: string }).sql).toBe("SELECT 'it''s ok'")
  })

  it('ignores semicolons inside line comments', () => {
    const items = tokenize('-- one; two;\nSELECT 3;')
    expect(items.length).toBe(1)
    expect((items[0] as { sql: string }).sql).toBe('-- one; two;\nSELECT 3')
  })

  it('ignores semicolons inside block comments', () => {
    const items = tokenize('/* one; two; */ SELECT 3;')
    expect(items.length).toBe(1)
    expect((items[0] as { sql: string }).sql).toBe('/* one; two; */ SELECT 3')
  })

  it('treats dollar-quoted blocks as one literal — embedded ; is preserved', () => {
    const sql = "CREATE FUNCTION f() RETURNS void AS $body$ BEGIN PERFORM 1; END; $body$;"
    const items = tokenize(sql)
    expect(items.length).toBe(1)
    expect((items[0] as { sql: string }).sql).toContain('PERFORM 1; END;')
  })

  it('produces the same token stream whether fed whole or byte-by-byte', () => {
    const sql =
      "SELECT 'a'; -- comment\nCREATE FUNCTION f() RETURNS int AS $tag$ SELECT 1; $tag$ LANGUAGE sql;"
    const whole = tokenize(sql)
    const chunked = tokenize(sql, { chunkSize: 1 })
    expect(chunked).toEqual(whole)
  })

  it('emits copy / copyData / copyEnd around a COPY ... FROM STDIN block', () => {
    const dump =
      'COPY users (id, name) FROM stdin;\n1\tAlice\n2\tBob\n\\.\nSELECT 1;'
    const items = tokenize(dump)
    expect(items.map((i) => i.kind)).toEqual(['copy', 'copyData', 'copyEnd', 'statement'])
    const data = items[1] as { kind: 'copyData'; text: string }
    expect(data.text).toBe('1\tAlice\n2\tBob\n')
  })

  it('throws when a COPY block is truncated at EOF', () => {
    expect(() => tokenize('COPY t FROM stdin;\n1\tAlice')).toThrow(/COPY/i)
  })
})

describe('SqlTokenizer — mysql mode', () => {
  it('treats backticks as identifier quotes — semicolons inside are ignored', () => {
    const items = tokenize('SELECT `we;ird` FROM t; SELECT 2;', { mysql: true })
    expect(items.length).toBe(2)
    expect((items[0] as { sql: string }).sql).toBe('SELECT `we;ird` FROM t')
  })

  it('honors backslash escapes inside single-quoted strings', () => {
    const items = tokenize("SELECT 'a\\';b'; SELECT 2;", { mysql: true })
    expect(items.length).toBe(2)
    expect((items[0] as { sql: string }).sql).toBe("SELECT 'a\\';b'")
  })
})
