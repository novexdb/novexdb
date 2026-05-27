import { z } from 'zod'
import { registerHandler, registerQuery } from '@main/ipc/handler'
import { scanEngine } from '@main/services/intelligence/scan-engine'
import { IpcChannels } from '@shared/ipc-contract'

const scanKindSchema = z.enum([
  'full',
  'schema',
  'data-quality',
  'transaction',
  'performance'
])

const scanStartSchema = z.object({
  connectionId: z.string().uuid(),
  kind: scanKindSchema
})

const scanCancelSchema = z.object({
  scanId: z.string().uuid()
})

const connectionIdSchema = z.string().uuid()

/** Wire up the intelligence-dashboard IPC channels. */
export function registerIntelligenceHandlers(): void {
  registerHandler(IpcChannels.intelligenceScanStart, scanStartSchema, (payload) =>
    scanEngine.start(payload)
  )

  registerHandler(IpcChannels.intelligenceScanCancel, scanCancelSchema, async (payload) => {
    scanEngine.cancel(payload)
    return null
  })

  registerHandler(IpcChannels.intelligenceLatest, connectionIdSchema, (connectionId) =>
    scanEngine.latest(connectionId)
  )

  registerHandler(IpcChannels.intelligenceHistory, connectionIdSchema, (connectionId) =>
    scanEngine.history(connectionId)
  )

  registerQuery(IpcChannels.intelligenceList, () => scanEngine.list())
}
