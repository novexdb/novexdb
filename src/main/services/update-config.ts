import { settingsStore } from '@main/services/settings-store'

/**
 * Resolved auto-update configuration — the union of:
 *  - **deploy-time** wiring (provider + feed URL) via env vars
 *  - **user-controlled** behaviour (enabled, prereleases, interval) via settings
 *
 * The `provider` defaults to GitHub; set `NOVEXDB_UPDATE_PROVIDER=generic`
 * + `NOVEXDB_UPDATE_FEED_URL=https://updates.novexdb.app` to point at an
 *  S3 bucket or any HTTPS host serving `latest-mac.yml` / `latest.yml`.
 */
export interface UpdateConfig {
  /** Master switch from settings — when false the updater never starts. */
  enabled: boolean
  /** Release feed kind. `generic` lets you serve from S3 / CloudFront / nginx. */
  provider: 'github' | 'generic'
  /** Required when `provider === 'generic'`; ignored for GitHub (electron-builder
   *  reads owner/repo from the publish block instead). */
  feedURL: string | null
  /** Include `-beta` / `-rc` channels in the lookup. */
  allowPrerelease: boolean
  /** Time between recurring checks, in ms. Clamped 15 min – 24 h by the schema. */
  checkIntervalMs: number
  /** Always-on for a polished UX — silent background download. */
  autoDownload: boolean
  /** Always-on for the "install on next quit" pattern. */
  autoInstallOnAppQuit: boolean
}

export async function resolveUpdateConfig(): Promise<UpdateConfig> {
  const settings = await settingsStore.get()
  const envProvider =
    (process.env.NOVEXDB_UPDATE_PROVIDER ?? '').toLowerCase() === 'generic'
      ? 'generic'
      : 'github'
  const feedURL = process.env.NOVEXDB_UPDATE_FEED_URL?.trim() || null
  return {
    enabled: settings.autoUpdateEnabled,
    provider: envProvider,
    feedURL,
    allowPrerelease: settings.allowPrerelease,
    checkIntervalMs: settings.updateCheckIntervalMinutes * 60 * 1000,
    autoDownload: true,
    autoInstallOnAppQuit: true
  }
}
