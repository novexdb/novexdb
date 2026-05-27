import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { join } from 'node:path'

/** electron-vite sets this only while the dev server is running. */
const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

/**
 * Load the app icon for the BrowserWindow. In packaged builds Electron
 * pulls the icon from the bundled .icns / .ico automatically; this only
 * matters in dev, where we point at the PNG that `npm run icons` emits.
 * Lives at `build/icons/512.png` relative to the repo root.
 */
function loadDevIcon(): Electron.NativeImage | undefined {
  if (app.isPackaged) return undefined
  const iconPath = join(__dirname, '..', '..', 'build', 'icons', '512.png')
  const image = nativeImage.createFromPath(iconPath)
  return image.isEmpty() ? undefined : image
}

/**
 * Creates the main application window. The window is frameless: on macOS we
 * keep the native traffic lights via `hiddenInset`; on Windows/Linux the chrome
 * is fully custom and the React title bar renders its own controls.
 */
export function createMainWindow(initialConnectionId?: string): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const devIcon = loadDevIcon()

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d1117',
    // Packaged builds embed the icon via electron-builder; the explicit
    // `icon:` field only matters in dev and on Linux (where there's no
    // packaged-icon fallback for the Dock/Taskbar).
    ...(devIcon ? { icon: devIcon } : {}),
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 16 } }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  // Avoid a white flash — show only once the renderer has painted.
  window.once('ready-to-show', () => window.show())

  // Broadcast fullscreen state so the renderer can reclaim the macOS
  // traffic-light reserve when the window enters fullscreen.
  const broadcastFullScreen = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send('app:window:fullscreen-changed', window.isFullScreen())
    }
  }
  window.on('enter-full-screen', broadcastFullScreen)
  window.on('leave-full-screen', broadcastFullScreen)

  // External links open in the user's browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const query = initialConnectionId
    ? `?initialConnection=${encodeURIComponent(initialConnectionId)}`
    : ''
  if (rendererDevUrl) {
    void window.loadURL(rendererDevUrl + query)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), {
      search: query.slice(1)
    })
  }

  return window
}
