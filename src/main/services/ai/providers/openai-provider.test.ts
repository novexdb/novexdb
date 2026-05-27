import { describe, expect, it } from 'vitest'
import {
  flattenSystem,
  toOpenAIMessages
} from '@main/services/ai/providers/openai-provider'

describe('flattenSystem', () => {
  it('joins multiple system blocks with a blank line between them', () => {
    expect(
      flattenSystem([
        { text: 'You are NovexDB AI.' },
        { text: 'Schema: users(id, name)' }
      ])
    ).toBe('You are NovexDB AI.\n\nSchema: users(id, name)')
  })

  it('returns an empty string when there are no blocks', () => {
    expect(flattenSystem([])).toBe('')
  })

  it("ignores the Anthropic `cache` flag — OpenAI caches automatically", () => {
    expect(
      flattenSystem([
        { text: 'A', cache: true },
        { text: 'B' }
      ])
    ).toBe('A\n\nB')
  })

  it('preserves block order — prefix stability matters for OpenAI prompt caching', () => {
    expect(
      flattenSystem([{ text: 'first' }, { text: 'second' }, { text: 'third' }])
    ).toBe('first\n\nsecond\n\nthird')
  })
})

describe('toOpenAIMessages', () => {
  it('passes role + content through unchanged for the supported roles', () => {
    expect(
      toOpenAIMessages([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' }
      ])
    ).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ])
  })

  it('returns an empty array when given no messages', () => {
    expect(toOpenAIMessages([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [{ role: 'user' as const, content: 'x' }]
    toOpenAIMessages(input)
    expect(input).toEqual([{ role: 'user', content: 'x' }])
  })
})
