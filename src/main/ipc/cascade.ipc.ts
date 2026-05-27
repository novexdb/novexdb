import { z } from 'zod'
import { registerHandler } from '@main/ipc/handler'
import { IpcChannels } from '@shared/ipc-contract'
import { scanDependencies } from '@main/services/cascade/dependency-scanner'
import { executeCascade } from '@main/services/cascade/cascade-executor'

// Row keys are `Record<string, unknown>` — zod can't fully validate the union of
// every SQL value type, so we accept any non-array object per row.
const rowKeySchema = z.record(z.string(), z.unknown())

const scanRequestSchema = z.object({
  connectionId: z.string().uuid(),
  schema: z.string().min(1).max(255),
  table: z.string().min(1).max(255),
  rowKeys: z.array(rowKeySchema).min(1).max(100),
  maxDepth: z.number().int().min(1).max(10).optional(),
  maxRowsPerTable: z.number().int().min(1).max(10_000).optional()
})

const executeRequestSchema = z.object({
  connectionId: z.string().uuid(),
  selections: z
    .array(
      z.object({
        schema: z.string().min(1).max(255),
        table: z.string().min(1).max(255),
        rowKey: rowKeySchema
      })
    )
    .min(1),
  dryRun: z.boolean().optional()
})

/** Connected-Transaction-Delete IPC. The renderer only ever talks to these
 *  two channels — `scan` for the preview tree, `execute` for the commit. */
export function registerCascadeHandlers(): void {
  registerHandler(IpcChannels.cascadeScan, scanRequestSchema, (payload) =>
    scanDependencies(payload)
  )

  registerHandler(IpcChannels.cascadeExecute, executeRequestSchema, (payload) =>
    executeCascade(payload)
  )
}
