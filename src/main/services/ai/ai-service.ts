import { settingsStore } from '@main/services/settings-store'
import { connectionManager } from '@main/services/connection-manager'
import { aiConfigStore } from '@main/services/ai/ai-config-store'
import { AnthropicProvider } from '@main/services/ai/providers/anthropic-provider'
import { OpenAIProvider } from '@main/services/ai/providers/openai-provider'
import { GeminiProvider } from '@main/services/ai/providers/gemini-provider'
import type { LlmProvider, SystemBlock } from '@main/services/ai/providers/provider.types'
import { buildSchemaContext, getSchema } from '@main/services/ai/schema-context'
import { analyzeSql } from '@main/services/ai/sql-safety'
import { aiLimiter } from '@main/services/ai/rate-limiter'
import * as prompts from '@main/services/ai/prompts'
import * as resultTools from '@main/services/ai/result-tools'
import type {
  AiChatMessage,
  AiSaveConfigPayload,
  AiStatus,
  AnalysisResult,
  ErrorExplainResult,
  ExplainResult,
  Nl2SqlResult,
  OptimizeResult
} from '@shared/types/ai'

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

/**
 * The centralized AI service: builds schema-aware prompts, runs them through
 * the LLM provider, applies SQL safety checks, and exposes one method per
 * feature. The renderer reaches this only via IPC.
 */
class AiService {
  private async getProvider(): Promise<LlmProvider> {
    const settings = await settingsStore.get()
    const apiKey = await aiConfigStore.getApiKey(settings.aiProvider)
    if (!apiKey) {
      throw new Error('No AI API key configured. Add one in Settings → AI.')
    }
    // Single saved key per the credentials store — its provider is
    // whatever the user picked when they saved it. Switching provider in
    // Settings without re-entering the key will fail loudly on first use.
    switch (settings.aiProvider) {
      case 'openai':
        return new OpenAIProvider(apiKey, settings.aiModel)
      case 'gemini':
        return new GeminiProvider(apiKey, settings.aiModel)
      case 'anthropic':
      default:
        return new AnthropicProvider(apiKey, settings.aiModel)
    }
  }

  /** [general identity, schema context (cached)] — the shared prompt prefix. */
  private async systemBlocks(connectionId: string): Promise<SystemBlock[]> {
    const snapshot = await getSchema(connectionId)
    return [
      { text: prompts.GENERAL_SYSTEM },
      { text: buildSchemaContext(snapshot), cache: true }
    ]
  }

  async getStatus(): Promise<AiStatus> {
    const settings = await settingsStore.get()
    return {
      configured: await aiConfigStore.hasApiKey(settings.aiProvider),
      provider: settings.aiProvider,
      model: settings.aiModel
    }
  }

  async saveConfig(payload: AiSaveConfigPayload): Promise<AiStatus> {
    await settingsStore.set({ aiProvider: payload.provider, aiModel: payload.model })
    const key = payload.apiKey?.trim()
    if (key) await aiConfigStore.setApiKey(key)
    return this.getStatus()
  }

  /** Smoke-test the configured key/model with a tiny request. */
  async test(): Promise<void> {
    const provider = await this.getProvider()
    await provider.streamText(
      {
        system: [{ text: 'You are a connectivity check. Reply with the word OK.' }],
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 16
      },
      () => undefined
    )
  }

  async generateSql(connectionId: string, prompt: string): Promise<Nl2SqlResult> {
    return aiLimiter.run(async () => {
      const provider = await this.getProvider()
      const result = await provider.completeStructured<Nl2SqlResult>({
        system: await this.systemBlocks(connectionId),
        messages: [{ role: 'user', content: prompts.nl2SqlPrompt(prompt) }],
        tool: resultTools.nl2SqlTool,
        maxTokens: 2500
      })
      const safety = analyzeSql(result.sql)
      return {
        sql: result.sql,
        explanation: result.explanation,
        warnings: [...new Set([...result.warnings, ...safety.warnings])],
        confidence: clamp01(result.confidence)
      }
    })
  }

  async explainSql(connectionId: string, sql: string): Promise<ExplainResult> {
    return aiLimiter.run(async () => {
      const provider = await this.getProvider()
      return provider.completeStructured<ExplainResult>({
        system: await this.systemBlocks(connectionId),
        messages: [{ role: 'user', content: prompts.explainPrompt(sql) }],
        tool: resultTools.explainTool,
        maxTokens: 3000
      })
    })
  }

  async optimizeSql(connectionId: string, sql: string): Promise<OptimizeResult> {
    return aiLimiter.run(async () => {
      let plan: string | null = null
      try {
        const planJson = await connectionManager.explain(connectionId, sql)
        plan = JSON.stringify(planJson).slice(0, 8000)
      } catch {
        plan = null
      }
      const provider = await this.getProvider()
      return provider.completeStructured<OptimizeResult>({
        system: await this.systemBlocks(connectionId),
        messages: [{ role: 'user', content: prompts.optimizePrompt(sql, plan) }],
        tool: resultTools.optimizeTool,
        maxTokens: 4000
      })
    })
  }

  async explainError(
    connectionId: string,
    sql: string,
    errorMessage: string
  ): Promise<ErrorExplainResult> {
    return aiLimiter.run(async () => {
      const provider = await this.getProvider()
      return provider.completeStructured<ErrorExplainResult>({
        system: await this.systemBlocks(connectionId),
        messages: [{ role: 'user', content: prompts.errorExplainPrompt(sql, errorMessage) }],
        tool: resultTools.errorExplainTool,
        maxTokens: 2000
      })
    })
  }

  async analyzeDatabase(connectionId: string): Promise<AnalysisResult> {
    return aiLimiter.run(async () => {
      const provider = await this.getProvider()
      return provider.completeStructured<AnalysisResult>({
        system: await this.systemBlocks(connectionId),
        messages: [{ role: 'user', content: prompts.analyzePrompt() }],
        tool: resultTools.analysisTool,
        maxTokens: 5000
      })
    })
  }

  async chat(
    connectionId: string,
    messages: AiChatMessage[],
    onDelta: (delta: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    return aiLimiter.run(async () => {
      const provider = await this.getProvider()
      return provider.streamText(
        {
          system: await this.systemBlocks(connectionId),
          messages,
          maxTokens: 4000,
          thinking: true
        },
        onDelta,
        signal
      )
    })
  }
}

export const aiService = new AiService()
