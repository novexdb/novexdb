import { z } from 'zod'
import { aiProviderSchema } from '@shared/schemas/settings.schema'

const connectionId = z.string().uuid()

export const nl2SqlPayloadSchema = z.object({
  connectionId,
  prompt: z.string().trim().min(1).max(4000)
})

export const explainSqlPayloadSchema = z.object({
  connectionId,
  sql: z.string().trim().min(1).max(100_000)
})

export const optimizeSqlPayloadSchema = explainSqlPayloadSchema

export const errorExplainPayloadSchema = z.object({
  connectionId,
  sql: z.string().trim().min(1).max(100_000),
  errorMessage: z.string().trim().min(1).max(10_000)
})

export const analyzeDatabasePayloadSchema = z.object({ connectionId })

export const aiSaveConfigSchema = z.object({
  provider: aiProviderSchema,
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().max(500).optional()
})

export const aiChatStartSchema = z.object({
  streamId: z.string().uuid(),
  connectionId,
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(100_000)
      })
    )
    .min(1)
    .max(50)
})

export const aiChatCancelSchema = z.object({ streamId: z.string().uuid() })
