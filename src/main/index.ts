import { app, BrowserWindow, nativeImage, session } from 'electron'
import { join } from 'node:path'
import { createMainWindow } from '@main/window'
import { registerIpcHandlers } from '@main/ipc'
import { connectionManager } from '@main/services/connection-manager'
import { initAutoUpdater } from '@main/services/updater'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

/**
 * Override the macOS Dock icon in dev. Packaged builds use the .icns
 * baked in by electron-builder; this only matters when running
 * `npm run dev`, where the Dock would otherwise show the default
 * Electron logo.
 */
function setDevDockIcon(): void {
  if (!isDev || process.platform !== 'darwin' || !app.dock) return
  const iconPath = join(__dirname, '..', '..', 'build', 'icons', '512.png')
  const image = nativeImage.createFromPath(iconPath)
  if (!image.isEmpty()) app.dock.setIcon(image)
}

/**
 * Apply a Content-Security-Policy to every response. Production is locked down;
 * dev is relaxed so the Vite dev server and HMR websocket keep working.
 */
function applyContentSecurityPolicy(): void {
  const policy = isDev
    ? "default-src 'self' 'unsafe-inline' data: blob: ws://localhost:* http://localhost:*"
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        // Monaco editor spins up its tokenizer in a web worker.
        "worker-src 'self' blob:"
      ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

/** Block any attempt to navigate the window away from the app's own content. */
function lockDownNavigation(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      const allowed = isDev && url.startsWith('http://localhost')
      if (!allowed) event.preventDefault()
    })
  })
}

function bootstrap(): void {
  applyContentSecurityPolicy()
  lockDownNavigation()
  setDevDockIcon()
  registerIpcHandlers()
  createMainWindow()
  void initAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
}

// Single-instance: a second launch focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
  })

  // Override the application name reported to the OS. In dev we run from
  // `node_modules/electron`, whose bundled Info.plist says "Electron" —
  // that's what surfaces in the macOS Dock tooltip, the app menu, and the
  // About panel. `app.setName()` overrides every consumer of `app.getName()`
  // so the right name shows up in dev without waiting for a packaged build.
  // Must be called before `app.whenReady()` to take effect on the menu bar.
  app.setName('NovexDB')
  app.setAppUserModelId('com.novexdb.app')
  void app.whenReady().then(bootstrap)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Gracefully close every pool before the process exits.
let isShuttingDown = false
app.on('before-quit', (event) => {
  if (isShuttingDown) return
  event.preventDefault()
  isShuttingDown = true
  void connectionManager.disposeAll().finally(() => app.quit())
})
