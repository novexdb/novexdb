/** Shared AI-feature types — the contract between the renderer and the AI service. */

export type AiProvider = 'anthropic' | 'openai'

export type IssueSeverity = 'high' | 'medium' | 'low'

export interface AiStatus {
  /** True when an API key is available (stored or via env var). */
  configured: boolean
  provider: AiProvider
  model: string
}

/** Natural-language → SQL. */
export interface Nl2SqlResult {
  sql: string
  explanation: string
  warnings: string[]
  /** Model's self-reported confidence, 0..1. */
  confidence: number
}

export interface ExplainStep {
  title: string
  detail: string
}

/** Plain-English explanation of a SQL query. */
export interface ExplainResult {
  summary: string
  steps: ExplainStep[]
}

export interface OptimizationIssue {
  severity: IssueSeverity
  title: string
  detail: string
}

/** Query optimization analysis. */
export interface OptimizeResult {
  issues: OptimizationIssue[]
  suggestedSql: string | null
  missingIndexes: string[]
  reasoning: string
}

/** Explanation + fix for a SQL error. */
export interface ErrorExplainResult {
  explanation: string
  fix: string
  correctedSql: string | null
}

export interface AnalysisIssue {
  severity: IssueSeverity
  title: string
  detail: string
}

/** Whole-database review. */
export interface AnalysisResult {
  overview: string
  issues: AnalysisIssue[]
  recommendations: string[]
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** IPC request payloads. */
export interface Nl2SqlPayload {
  connectionId: string
  prompt: string
}

export interface ExplainSqlPayload {
  connectionId: string
  sql: string
}

export interface OptimizeSqlPayload {
  connectionId: string
  sql: string
}

export interface ErrorExplainPayload {
  connectionId: string
  sql: string
  errorMessage: string
}

export interface AnalyzeDatabasePayload {
  connectionId: string
}

export interface AiSaveConfigPayload {
  provider: AiProvider
  model: string
  /** Omitted/empty keeps the existing key. */
  apiKey?: string
}

/** Streaming-chat wire payloads (event-based IPC). */
export interface AiChatStartPayload {
  streamId: string
  connectionId: string
  messages: AiChatMessage[]
}

export interface AiChatChunk {
  streamId: string
  delta: string
}

export interface AiChatDone {
  streamId: string
  text: string
}

export interface AiChatFailure {
  streamId: string
  error: string
}

export interface AiChatCancelPayload {
  streamId: string
}
