import { describe, expect, it } from 'vitest'
import { formatCellValue, isNull } from '@renderer/features/results/utils/format-cell'

describe('isNull', () => {
  it('is true for null and undefined', () => {
    expect(isNull(null)).toBe(true)
    expect(isNull(undefined)).toBe(true)
  })

  it('is false for empty strings, zero, false', () => {
    expect(isNull('')).toBe(false)
    expect(isNull(0)).toBe(false)
    expect(isNull(false)).toBe(false)
  })
})

describe('formatCellValue', () => {
  it('returns "" for null and undefined (caller paints NULL UI)', () => {
    expect(formatCellValue(null)).toBe('')
    expect(formatCellValue(undefined)).toBe('')
  })

  it('renders Date as ISO 8601', () => {
    const d = new Date('2024-01-15T10:30:00.000Z')
    expect(formatCellValue(d)).toBe('2024-01-15T10:30:00.000Z')
  })

  it('summarizes a Uint8Array by byte length', () => {
    expect(formatCellValue(new Uint8Array([1, 2, 3]))).toBe('[3 bytes]')
  })

  it('JSON-stringifies plain objects', () => {
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}')
  })

  it('JSON-stringifies arrays', () => {
    expect(formatCellValue([1, 2])).toBe('[1,2]')
  })

  it('stringifies primitives', () => {
    expect(formatCellValue(42)).toBe('42')
    expect(formatCellValue(true)).toBe('true')
    expect(formatCellValue('hello')).toBe('hello')
  })

  it('falls back to String() if JSON.stringify throws (circular ref)', () => {
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(formatCellValue(obj)).toBe('[object Object]')
  })
})
