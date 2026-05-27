import { describe, expect, it } from 'vitest'
import {
  quoteIdent,
  quoteMssqlIdent,
  quoteMssqlQualified,
  quoteMysqlIdent,
  quoteMysqlQualified,
  quoteQualified
} from '@main/utils/sql'

describe('quoteIdent', () => {
  it('wraps a plain identifier in double quotes', () => {
    expect(quoteIdent('users')).toBe('"users"')
  })

  it('escapes embedded double quotes by doubling them', () => {
    expect(quoteIdent('say "hi"')).toBe('"say ""hi"""')
  })

  it('preserves case-sensitive names', () => {
    expect(quoteIdent('MixedCase')).toBe('"MixedCase"')
  })
})

describe('quoteQualified', () => {
  it('quotes both schema and table', () => {
    expect(quoteQualified('public', 'users')).toBe('"public"."users"')
  })

  it('escapes embedded quotes in either part', () => {
    expect(quoteQualified('we"ird', 'users')).toBe('"we""ird"."users"')
  })
})

describe('quoteMysqlIdent', () => {
  it('wraps in backticks', () => {
    expect(quoteMysqlIdent('users')).toBe('`users`')
  })

  it('escapes embedded backticks by doubling them', () => {
    expect(quoteMysqlIdent('we`ird')).toBe('`we``ird`')
  })
})

describe('quoteMysqlQualified', () => {
  it('joins backticked database + table with a dot', () => {
    expect(quoteMysqlQualified('app', 'users')).toBe('`app`.`users`')
  })
})

describe('quoteMssqlIdent', () => {
  it('wraps in square brackets', () => {
    expect(quoteMssqlIdent('users')).toBe('[users]')
  })

  it('escapes embedded closing brackets by doubling them', () => {
    expect(quoteMssqlIdent('odd]name')).toBe('[odd]]name]')
  })

  it('passes through other punctuation untouched', () => {
    expect(quoteMssqlIdent('dbo.weird')).toBe('[dbo.weird]')
  })
})

describe('quoteMssqlQualified', () => {
  it('joins bracketed schema + table with a dot', () => {
    expect(quoteMssqlQualified('dbo', 'users')).toBe('[dbo].[users]')
  })
})
