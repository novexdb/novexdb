import { describe, expect, it } from 'vitest'
import { fail, failFrom, ok } from '@main/utils/result'

describe('ok', () => {
  it('wraps a value with ok=true', () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 })
  })

  it('preserves null + undefined as data', () => {
    expect(ok(null)).toEqual({ ok: true, data: null })
    expect(ok(undefined)).toEqual({ ok: true, data: undefined })
  })
})

describe('fail', () => {
  it('builds an explicit error shape', () => {
    expect(fail('E_BAD', 'nope')).toEqual({
      ok: false,
      error: { code: 'E_BAD', message: 'nope' }
    })
  })
})

describe('failFrom', () => {
  it('unwraps an Error to its message', () => {
    const result = failFrom(new Error('boom'))
    expect(result.ok).toBe(false)
    expect(result.error.message).toBe('boom')
    expect(result.error.code).toBe('E_INTERNAL')
  })

  it('stringifies non-Error throwables', () => {
    expect(failFrom('plain').error.message).toBe('plain')
    expect(failFrom(42).error.message).toBe('42')
  })

  it('respects an explicit code override', () => {
    expect(failFrom(new Error('x'), 'E_CUSTOM').error.code).toBe('E_CUSTOM')
  })
})
