import { describe, expect, it } from 'vitest'
import {
  flattenSystem,
  structuredInstruction,
  toGeminiContents
} from '@main/services/ai/providers/gemini-provider'

describe('flattenSystem (gemini)', () => {
  it('joins system blocks with a blank line between them', () => {
    expect(flattenSystem([{ text: 'You are NovexDB AI.' }, { text: 'Schema: users(id)' }])).toBe(
      'You are NovexDB AI.\n\nSchema: users(id)'
    )
  })

  it('drops the Anthropic cache flag and preserves block order', () => {
    expect(
      flattenSystem([{ text: 'first', cache: true }, { text: 'second' }, { text: 'third' }])
    ).toBe('first\n\nsecond\n\nthird')
  })

  it('returns an empty string when there are no blocks', () => {
    expect(flattenSystem([])).toBe('')
  })
})

describe('toGeminiContents', () => {
  it("maps the assistant role to Gemini's 'model' role and wraps text in parts", () => {
    expect(
      toGeminiContents([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' }
      ])
    ).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'hello' }] }
    ])
  })

  it('returns an empty array when given no messages', () => {
    expect(toGeminiContents([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [{ role: 'user' as const, content: 'x' }]
    toGeminiContents(input)
    expect(input).toEqual([{ role: 'user', content: 'x' }])
  })
})

describe('structuredInstruction', () => {
  it('embeds the tool description and a serialized schema', () => {
    const result = structuredInstruction({
      name: 'provide_sql',
      description: 'Return the SQL.',
      inputSchema: { type: 'object', properties: { sql: { type: 'string' } } }
    })
    expect(result).toContain('Return the SQL.')
    expect(result).toContain('"type":"object"')
    expect(result).toContain('Output only the JSON object')
  })
})
