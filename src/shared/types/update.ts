/** Auto-update event payloads (main → renderer). */

export interface UpdateVersionInfo {
  version: string
}

export interface UpdateProgressInfo {
  /** Download progress, 0–100. */
  percent: number
}

export interface UpdateErrorInfo {
  message: string
}

/** Emitted when a check fires — lets the settings UI show a spinner. */
export interface UpdateCheckingInfo {
  /** ISO timestamp of when the check started. */
  at: string
}

/** Emitted when the feed says you're already on the latest version. */
export interface UpdateNotAvailableInfo {
  at: string
}

/** Settings-UI snapshot: what the updater has done so far + current config. */
export type UpdateOutcome =
  | { status: 'idle' }
  | { status: 'checking'; at: string }
  | { status: 'available'; at: string; version: string }
  | { status: 'downloading'; at: string; version: string; percent: number }
  | { status: 'ready'; at: string; version: string }
  | { status: 'up-to-date'; at: string }
  | { status: 'error'; at: string; message: string }

export interface UpdateStatusSnapshot {
  outcome: UpdateOutcome
  /** False outside a packaged build — the updater is intentionally inert in dev. */
  packaged: boolean
  /** True when the recurring background check is armed. */
  enabled: boolean
  provider: 'github' | 'generic'
  allowPrerelease: boolean
  intervalMinutes: number
}
