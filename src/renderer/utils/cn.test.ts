import { describe, expect, it } from 'vitest'
import { cn } from '@renderer/utils/cn'

describe('cn', () => {
  it('joins string arguments with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('drops falsy values', () => {
    const falseFlag = false as boolean
    expect(cn('a', falseFlag && 'x', null, undefined, '', 'b')).toBe('a b')
  })

  it('flattens arrays', () => {
    expect(cn(['a', 'b'], ['c'])).toBe('a b c')
  })

  it('expands an object map by truthy keys', () => {
    expect(cn({ a: true, b: false, c: true })).toBe('a c')
  })

  it('resolves conflicting Tailwind utilities (last one wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
  })
})
