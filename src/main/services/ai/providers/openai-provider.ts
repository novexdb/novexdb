import OpenAI from 'openai'
import type {
  LlmMessage,
  LlmProvider,
  StreamRequest,
  StructuredRequest,
  SystemBlock
} from '@main/services/ai/providers/provider.types'

/**
 * Flatten our multi-block system prompt into the single `content` string
 * OpenAI's chat API expects. Anthropic's `cache_control: ephemeral` flag
 * is silently dropped — OpenAI does prompt caching automatically based on
 * prefix hashing, so concatenating in a stable order is enough to keep
 * cache hit rates high across repeated calls.
 */
export function flattenSystem(blocks: SystemBlock[]): string {
  return blocks.map((b) => b.text).join('\n\n')
}

/** Map our internal message shape onto OpenAI's role/content tuple. */
export function toOpenAIMessages(
  messages: LlmMessage[]
): { role: 'user' | 'assistant'; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

/** OpenAI implementation of the LLM provider abstraction. */
export class OpenAIProvider implements LlmProvider {
  readonly id = 'openai' as const

  private readonly client: OpenAI

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    // The SDK retries 429 / 5xx with exponential backoff.
    this.client = new OpenAI({ apiKey, maxRetries: 3 })
  }

  /**
   * Structured output via OpenAI Structured Outputs. The model is forced
   * to return JSON matching `tool.inputSchema` exactly — `strict: true`
   * makes the API guarantee schema adherence on supported models
   * (gpt-4o-2024-08-06+ and the entire gpt-5 family).
   *
   * We model this with `response_format: json_schema` rather than
   * function-calling because the result *is* the response — there's no
   * second turn where the model would observe a tool result.
   */
  async completeStructured<T>(request: StructuredRequest): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: request.maxTokens,
      messages: [
        { role: 'system', content: flattenSystem(request.system) },
        ...toOpenAIMessages(request.messages)
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: request.tool.name,
          description: request.tool.description,
          schema: request.tool.inputSchema,
          strict: true
        }
      }
    })

    const text = response.choices[0]?.message?.content
    if (!text) {
      throw new Error('The AI did not return a structured response. Please retry.')
    }
    return JSON.parse(text) as T
  }

  /**
   * Streaming free-text chat. `request.thinking` is silently ignored for
   * v1 — mapping it to `reasoning_effort` on `o*` models is a follow-up;
   * GPT-5 doesn't accept that field on plain chat completions.
   */
  async streamText(
    request: StreamRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        stream: true,
        max_completion_tokens: request.maxTokens,
        messages: [
          { role: 'system', content: flattenSystem(request.system) },
          ...toOpenAIMessages(request.messages)
        ]
      },
      signal ? { signal } : undefined
    )

    let full = ''
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (!delta) continue
      onDelta(delta)
      full += delta
    }
    return full
  }
}
