import Anthropic from '@anthropic-ai/sdk'
import type {
  LlmProvider,
  StreamRequest,
  StructuredRequest,
  SystemBlock
} from '@main/services/ai/providers/provider.types'

const ADAPTIVE_THINKING = { type: 'adaptive' } as const

/** Build the `system` parameter, marking cacheable blocks with cache_control. */
function toSystemParam(blocks: SystemBlock[]): Anthropic.TextBlockParam[] {
  return blocks.map((block) => ({
    type: 'text',
    text: block.text,
    ...(block.cache ? { cache_control: { type: 'ephemeral' as const } } : {})
  }))
}

/** Anthropic Claude implementation of the LLM provider abstraction. */
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const

  private readonly client: Anthropic

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    // The SDK retries 429 / 5xx / overloaded with exponential backoff.
    this.client = new Anthropic({ apiKey, maxRetries: 3 })
  }

  /** Structured output via forced tool use — the tool input *is* the result. */
  async completeStructured<T>(request: StructuredRequest): Promise<T> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens,
      system: toSystemParam(request.system),
      messages: request.messages,
      tools: [
        {
          name: request.tool.name,
          description: request.tool.description,
          input_schema: request.tool.inputSchema as Anthropic.Tool['input_schema'],
          strict: true
        }
      ],
      tool_choice: { type: 'tool', name: request.tool.name }
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )
    if (!toolUse) {
      throw new Error('The AI did not return a structured response. Please retry.')
    }
    return toolUse.input as T
  }

  async streamText(
    request: StreamRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: request.maxTokens,
        system: toSystemParam(request.system),
        messages: request.messages,
        ...(request.thinking ? { thinking: ADAPTIVE_THINKING } : {})
      },
      signal ? { signal } : undefined
    )
    stream.on('text', onDelta)
    const final = await stream.finalMessage()
    return final.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }
}
