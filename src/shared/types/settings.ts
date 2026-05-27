import type { ThemeMode } from '@shared/schemas/settings.schema'
import type { AiProvider } from '@shared/types/ai'

export type { ThemeMode }

/** A schema-qualified table the user has pinned to the top of the explorer. */
export interface PinnedTable {
  connectionId: string
  schema: string
  table: string
}

export interface AppSettings {
  theme: ThemeMode
  queryTimeoutMs: number
  autoSaveTabs: boolean
  fontSize: number
  sidebarWidth: number
  resultPanelHeight: number
  /** AI provider — the API key itself is stored separately, encrypted. */
  aiProvider: AiProvider
  aiModel: string
  /** Per-connection pinned tables — rendered above the schema tree. */
  pinnedTables: PinnedTable[]
  /** Master switch for the background updater. */
  autoUpdateEnabled: boolean
  /** Include `-beta` / `-rc` builds in the update feed. */
  allowPrerelease: boolean
  /** How often the updater pings the release feed, in minutes. */
  updateCheckIntervalMinutes: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  queryTimeoutMs: 30000,
  autoSaveTabs: true,
  fontSize: 13,
  sidebarWidth: 260,
  resultPanelHeight: 240,
  aiProvider: 'anthropic',
  aiModel: 'claude-sonnet-4-6',
  pinnedTables: [],
  autoUpdateEnabled: true,
  allowPrerelease: false,
  updateCheckIntervalMinutes: 60
}
