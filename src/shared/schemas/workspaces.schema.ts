import { z } from 'zod'

/** Common tab fields shared by every WorkspaceTab variant. */
const tabBase = {
  id: z.string().min(1),
  title: z.string()
}

const queryTabSchema = z.object({
  ...tabBase,
  kind: z.literal('query'),
  sql: z.string()
})

const tableTabSchema = z.object({
  ...tabBase,
  kind: z.literal('table'),
  connectionId: z.string().min(1),
  schema: z.string().min(1),
  table: z.string().min(1),
  initialView: z.enum(['data', 'structure']).optional()
})

const overviewTabSchema = z.object({
  ...tabBase,
  kind: z.literal('overview'),
  connectionId: z.string().min(1),
  schema: z.string().min(1)
})

const intelligenceTabSchema = z.object({
  ...tabBase,
  kind: z.literal('intelligence')
})

const anomaliesTabSchema = z.object({
  ...tabBase,
  kind: z.literal('anomalies')
})

export const workspaceTabSchema = z.discriminatedUnion('kind', [
  queryTabSchema,
  tableTabSchema,
  overviewTabSchema,
  intelligenceTabSchema,
  anomaliesTabSchema
])

export const workspaceStateSchema = z.object({
  tabs: z.array(workspaceTabSchema),
  activeTabId: z.string(),
  nextNumber: z.number().int().nonnegative()
})

/** The persisted shape: a map from `${connectionId}:${database}` (or `__none__`)
 *  to one workspace's tab state. */
export const workspaceMapSchema = z.record(z.string().min(1), workspaceStateSchema)

export type PersistedWorkspaceState = z.infer<typeof workspaceStateSchema>
export type PersistedWorkspaceMap = z.infer<typeof workspaceMapSchema>
