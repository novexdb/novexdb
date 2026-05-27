import { describe, expect, it } from 'vitest'
import { clamp } from '@renderer/utils/clamp'

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('returns min when below', () => {
    expect(clamp(-3, 0, 10)).toBe(0)
  })

  it('returns max when above', () => {
    expect(clamp(99, 0, 10)).toBe(10)
  })

  it('treats the bounds as inclusive', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})
