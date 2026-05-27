import { describe, expect, it } from 'vitest'
import {
  quoteIdent,
  quoteLiteral,
  quoteMysqlIdent,
  quoteQualified,
  quoteRelation
} from '@renderer/utils/sql'

describe('quoteIdent (renderer)', () => {
  it('wraps with double quotes and escapes embedded quotes', () => {
    expect(quoteIdent('users')).toBe('"users"')
    expect(quoteIdent('say "hi"')).toBe('"say ""hi"""')
  })
})

describe('quoteMysqlIdent (renderer)', () => {
  it('wraps with backticks and doubles embedded backticks', () => {
    expect(quoteMysqlIdent('users')).toBe('`users`')
    expect(quoteMysqlIdent('we`ird')).toBe('`we``ird`')
  })
})

describe('quoteQualified', () => {
  it('joins double-quoted schema and table', () => {
    expect(quoteQualified('public', 'users')).toBe('"public"."users"')
  })
})

describe('quoteRelation', () => {
  it('uses double quotes for postgres', () => {
    expect(quoteRelation('postgres', 'public', 'users')).toBe('"public"."users"')
  })

  it('uses backticks for mysql', () => {
    expect(quoteRelation('mysql', 'app', 'users')).toBe('`app`.`users`')
  })

  it('routes mssql through the postgres-style quoting', () => {
    // mssql is the only other engine in the union; matches the non-mysql branch.
    expect(quoteRelation('mssql', 'dbo', 'users')).toBe('"dbo"."users"')
  })
})

describe('quoteLiteral', () => {
  it('wraps a plain string in single quotes', () => {
    expect(quoteLiteral('hello')).toBe("'hello'")
  })

  it("doubles embedded single quotes to escape them", () => {
    expect(quoteLiteral("it's a test")).toBe("'it''s a test'")
  })

  it('handles empty strings', () => {
    expect(quoteLiteral('')).toBe("''")
  })
})
