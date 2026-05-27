import { ipcMain } from 'electron'
import { registerHandler, registerQuery } from '@main/ipc/handler'
import { aiService } from '@main/services/ai/ai-service'
import { IpcChannels } from '@shared/ipc-contract'
import {
  aiChatCancelSchema,
  aiChatStartSchema,
  aiSaveConfigSchema,
  analyzeDatabasePayloadSchema,
  errorExplainPayloadSchema,
  explainSqlPayloadSchema,
  nl2SqlPayloadSchema,
  optimizeSqlPayloadSchema
} from '@shared/schemas/ai.schema'

/** In-flight chat streams, so `ai:chat:cancel` can abort them. */
const activeChatStreams = new Map<string, AbortController>()

export function registerAiHandlers(): void {
  registerQuery(IpcChannels.aiStatus, () => aiService.getStatus())

  registerHandler(IpcChannels.aiSaveConfig, aiSaveConfigSchema, (payload) =>
    aiService.saveConfig(payload)
  )

  registerQuery(IpcChannels.aiTest, async () => {
    await aiService.test()
    return null
  })

  registerHandler(IpcChannels.aiNl2sql, nl2SqlPayloadSchema, (payload) =>
    aiService.generateSql(payload.connectionId, payload.prompt)
  )

  registerHandler(IpcChannels.aiExplain, explainSqlPayloadSchema, (payload) =>
    aiService.explainSql(payload.connectionId, payload.sql)
  )

  registerHandler(IpcChannels.aiOptimize, optimizeSqlPayloadSchema, (payload) =>
    aiService.optimizeSql(payload.connectionId, payload.sql)
  )

  registerHandler(IpcChannels.aiErrorExplain, errorExplainPayloadSchema, (payload) =>
    aiService.explainError(payload.connectionId, payload.sql, payload.errorMessage)
  )

  registerHandler(IpcChannels.aiAnalyze, analyzeDatabasePayloadSchema, (payload) =>
    aiService.analyzeDatabase(payload.connectionId)
  )

  // Streaming chat — event-based rather than request/response.
  ipcMain.on(IpcChannels.aiChatStart, (event, rawPayload) => {
    const parsed = aiChatStartSchema.safeParse(rawPayload)
    if (!parsed.success) return
    const { streamId, connectionId, messages } = parsed.data

    const controller = new AbortController()
    activeChatStreams.set(streamId, controller)

    aiService
      .chat(
        connectionId,
        messages,
        (delta) => event.sender.send(IpcChannels.aiChatChunk, { streamId, delta }),
        controller.signal
      )
      .then((text) => {
        event.sender.send(IpcChannels.aiChatDone, { streamId, text })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          // User-initiated cancel — finalize quietly with whatever streamed.
          event.sender.send(IpcChannels.aiChatDone, { streamId, text: '' })
          return
        }
        const error = err instanceof Error ? err.message : String(err)
        event.sender.send(IpcChannels.aiChatError, { streamId, error })
      })
      .finally(() => {
        activeChatStreams.delete(streamId)
      })
  })

  ipcMain.on(IpcChannels.aiChatCancel, (_event, rawPayload) => {
    const parsed = aiChatCancelSchema.safeParse(rawPayload)
    if (!parsed.success) return
    activeChatStreams.get(parsed.data.streamId)?.abort()
  })
}
