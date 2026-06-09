import { GoogleGenAI } from '@google/genai'
import type { Content } from '@google/genai'
import type {
  LlmMessage,
  LlmProvider,
  StreamRequest,
  StructuredRequest,
  StructuredTool,
  SystemBlock
} from '@main/services/ai/providers/provider.types'

/**
 * Flatten our multi-block system prompt into the single string Gemini's
 * `systemInstruction` expects. As with OpenAI, the Anthropic `cache` flag is
 * dropped — Gemini caches large stable prefixes implicitly, so preserving
 * block order is what keeps repeated calls cheap.
 */
export function flattenSystem(blocks: SystemBlock[]): string {
  return blocks.map((b) => b.text).join('\n\n')
}

/**
 * Map our internal messages onto Gemini's `Content[]`. Gemini names the
 * assistant turn "model"; the user role is unchanged.
 */
export function toGeminiContents(messages: LlmMessage[]): Content[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
}

/**
 * Instruction that pins the JSON shape for structured output. Gemini's
 * `responseSchema` rejects some constructs our tool schemas rely on
 * (`additionalProperties: false`, `anyOf: [..., {type:'null'}]`), so instead
 * we force syntactically valid JSON with `responseMimeType` and describe the
 * exact shape in-prompt — robust across every tool schema.
 */
export function structuredInstruction(tool: StructuredTool): string {
  return [
    tool.description,
    'Respond with a single JSON object that strictly matches this JSON Schema:',
    JSON.stringify(tool.inputSchema),
    'Output only the JSON object — no markdown, no code fences, no commentary.'
  ].join('\n\n')
}

/** Google Gemini implementation of the LLM provider abstraction. */
export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini' as const

  private readonly client: GoogleGenAI

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new GoogleGenAI({ apiKey })
  }

  /**
   * Structured output via `responseMimeType: 'application/json'` plus an
   * in-prompt schema (see `structuredInstruction`). The model returns a JSON
   * object which we parse into the result type.
   */
  async completeStructured<T>(request: StructuredRequest): Promise<T> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: toGeminiContents(request.messages),
      config: {
        systemInstruction: flattenSystem([
          ...request.system,
          { text: structuredInstruction(request.tool) }
        ]),
        maxOutputTokens: request.maxTokens,
        responseMimeType: 'application/json'
      }
    })

    const text = response.text
    if (!text) {
      throw new Error('The AI did not return a structured response. Please retry.')
    }
    return JSON.parse(text) as T
  }

  /** Streaming free-text chat. `request.thinking` is left to the model default. */
  async streamText(
    request: StreamRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents: toGeminiContents(request.messages),
      config: {
        systemInstruction: flattenSystem(request.system),
        maxOutputTokens: request.maxTokens,
        ...(signal ? { abortSignal: signal } : {})
      }
    })

    let full = ''
    for await (const chunk of stream) {
      const delta = chunk.text
      if (!delta) continue
      onDelta(delta)
      full += delta
    }
    return full
  }
}
