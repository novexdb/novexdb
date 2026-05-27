import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'
import { IpcChannels } from '@shared/ipc-contract'
import { resolveUpdateConfig, type UpdateConfig } from '@main/services/update-config'

/**
 * Single instance of the updater per app process. We tie the lifecycle to a
 * module-level singleton because `electron-updater` itself is a singleton; the
 * service is the thin wrapper that owns the recurring-check timer and the
 * "did we already wire the event listeners?" flag.
 */
let wired = false
let intervalTimer: NodeJS.Timeout | null = null
let activeConfig: UpdateConfig | null = null

/** Track the last check outcome so the settings UI can render "up to date /
 *  X.Y.Z available / downloading 40 %". */
export type CheckOutcome =
  | { status: 'idle' }
  | { status: 'checking'; at: string }
  | { status: 'available'; at: string; version: string }
  | { status: 'downloading'; at: string; version: string; percent: number }
  | { status: 'ready'; at: string; version: string }
  | { status: 'up-to-date'; at: string }
  | { status: 'error'; at: string; message: string }

let lastOutcome: CheckOutcome = { status: 'idle' }

const logger = log.scope('updater')

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

/** Wire electron-updater + start the recurring check. Idempotent — calling
 *  it twice does not double-register listeners. No-op outside packaged builds. */
export async function initAutoUpdater(): Promise<void> {
  if (!app.isPackaged) {
    logger.info('skipping updater — running in dev')
    return
  }
  if (wired) {
    logger.info('updater already wired — reapplying config')
    await reconfigure()
    return
  }
  wired = true

  // electron-updater pipes its own logs through electron-log when this is set.
  autoUpdater.logger = log

  autoUpdater.on('checking-for-update', () => {
    logger.info('checking for updates…')
    lastOutcome = { status: 'checking', at: new Date().toISOString() }
    broadcast(IpcChannels.appUpdateChecking, { at: lastOutcome.at })
  })
  autoUpdater.on('update-available', (info) => {
    logger.info('update available', info.version)
    lastOutcome = { status: 'available', at: new Date().toISOString(), version: info.version }
    broadcast(IpcChannels.appUpdateAvailable, { version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    logger.info('already up to date')
    lastOutcome = { status: 'up-to-date', at: new Date().toISOString() }
    broadcast(IpcChannels.appUpdateNotAvailable, { at: lastOutcome.at })
  })
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent)
    if (percent % 10 === 0) logger.info('download progress', `${percent}%`)
    const previous = lastOutcome
    lastOutcome = {
      status: 'downloading',
      at: previous.status === 'downloading' ? previous.at : new Date().toISOString(),
      version:
        previous.status === 'downloading' || previous.status === 'available'
          ? previous.version
          : '',
      percent
    }
    broadcast(IpcChannels.appUpdateProgress, { percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    logger.info('update downloaded', info.version)
    lastOutcome = { status: 'ready', at: new Date().toISOString(), version: info.version }
    broadcast(IpcChannels.appUpdateDownloaded, { version: info.version })
  })
  autoUpdater.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('updater error', message)
    lastOutcome = { status: 'error', at: new Date().toISOString(), message }
    broadcast(IpcChannels.appUpdateError, { message })
  })

  await reconfigure()
}

/** Re-pull config from settings + env and apply it. Called on init + every
 *  time the user changes update preferences. Restarts the recurring timer. */
export async function reconfigure(): Promise<void> {
  if (!app.isPackaged) return
  const config = await resolveUpdateConfig()
  activeConfig = config

  autoUpdater.autoDownload = config.autoDownload
  autoUpdater.autoInstallOnAppQuit = config.autoInstallOnAppQuit
  autoUpdater.allowPrerelease = config.allowPrerelease

  // Generic provider lets you serve from S3 / CloudFront / nginx. GitHub uses
  // the publish block in electron-builder.yml — no setFeedURL needed there.
  if (config.provider === 'generic' && config.feedURL) {
    autoUpdater.setFeedURL({ provider: 'generic', url: config.feedURL })
    logger.info('using generic feed', config.feedURL)
  } else {
    logger.info('using github releases as update source')
  }

  if (intervalTimer) {
    clearInterval(intervalTimer)
    intervalTimer = null
  }

  if (!config.enabled) {
    logger.info('auto-updates disabled in settings — recurring check skipped')
    return
  }

  // First check on (re)configure, then on the configured interval.
  void runCheck('startup').catch(() => undefined)
  intervalTimer = setInterval(
    () => void runCheck('interval').catch(() => undefined),
    config.checkIntervalMs
  )
  logger.info(
    'recurring check armed',
    `every ${Math.round(config.checkIntervalMs / 60_000)} min`
  )
}

async function runCheck(reason: 'startup' | 'interval' | 'manual'): Promise<void> {
  if (!app.isPackaged) return
  try {
    logger.info('checkForUpdates', reason)
    await autoUpdater.checkForUpdates()
  } catch (err) {
    // Network failure (no internet, DNS, 5xx) is already broadcast via the
    // `error` event handler. Re-log here with the reason for traceability.
    logger.error('checkForUpdates failed', reason, err)
  }
}

/** Manually trigger an update check — wired to the settings "Check now" button. */
export async function checkForUpdates(): Promise<void> {
  await runCheck('manual')
}

/** Quit and install a downloaded update — only the user can trigger this. */
export function installUpdate(): void {
  logger.info('quitAndInstall invoked')
  autoUpdater.quitAndInstall()
}

/** Current state — used by the settings panel to render "Last checked …". */
export function updateStatus(): {
  outcome: CheckOutcome
  config: UpdateConfig | null
  packaged: boolean
} {
  return { outcome: lastOutcome, config: activeConfig, packaged: app.isPackaged }
}
