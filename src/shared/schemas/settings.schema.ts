import { z } from 'zod'

export const themeModeSchema = z.enum(['light', 'dark', 'system'])

export const aiProviderSchema = z.enum(['anthropic', 'openai'])

export const pinnedTableSchema = z.object({
  connectionId: z.string().uuid(),
  schema: z.string().min(1).max(255),
  table: z.string().min(1).max(255)
})

export const appSettingsSchema = z.object({
  theme: themeModeSchema,
  queryTimeoutMs: z.number().int().min(1000).max(600000),
  autoSaveTabs: z.boolean(),
  fontSize: z.number().int().min(10).max(24),
  sidebarWidth: z.number().int().min(180).max(600),
  resultPanelHeight: z.number().int().min(120).max(900),
  aiProvider: aiProviderSchema,
  aiModel: z.string().min(1).max(120),
  pinnedTables: z.array(pinnedTableSchema).default([]),
  autoUpdateEnabled: z.boolean().default(true),
  allowPrerelease: z.boolean().default(false),
  // 15 min floor stops the feed from being hammered; 24h ceiling keeps the
  // app from sitting on an unpatched build for a week if the user picks "rare".
  updateCheckIntervalMinutes: z.number().int().min(15).max(1440).default(60)
})

/** A partial patch is accepted by settings:set — callers update one key at a time. */
export const appSettingsPatchSchema = appSettingsSchema.partial()

export type ThemeMode = z.infer<typeof themeModeSchema>
