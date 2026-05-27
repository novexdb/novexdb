import type { AiProvider } from '@shared/types/ai'

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface SystemBlock {
  text: string
  /** Mark for prompt caching — use on large, stable content (the schema). */
  cache?: boolean
}

/** A tool whose input schema constrains a structured AI response. */
export interface StructuredTool {
  name: string
  description: string
  /** JSON Schema for the tool input (which becomes the structured result). */
  inputSchema: Record<string, unknown>
}

export interface StructuredRequest {
  system: SystemBlock[]
  messages: LlmMessage[]
  tool: StructuredTool
  maxTokens: number
}

export interface StreamRequest {
  system: SystemBlock[]
  messages: LlmMessage[]
  maxTokens: number
  thinking?: boolean
}

/**
 * Engine-agnostic LLM provider. AnthropicProvider is the only implementation
 * today; an OpenAIProvider would slot in here unchanged.
 */
export interface LlmProvider {
  readonly id: AiProvider
  /** One-shot request that returns a structured result via forced tool use. */
  completeStructured<T>(request: StructuredRequest): Promise<T>
  /** Streaming free-text request; resolves to the full text. */
  streamText(
    request: StreamRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<string>
}
