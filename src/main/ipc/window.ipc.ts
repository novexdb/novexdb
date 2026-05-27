import { BrowserWindow, ipcMain } from 'electron'
import { createMainWindow } from '@main/window'
import { registerHandler } from '@main/ipc/handler'
import { IpcChannels } from '@shared/ipc-contract'
import { connectionIdSchema } from '@shared/schemas/connection.schema'

/**
 * Window-chrome controls for the custom (frameless) title bar. These are
 * fire-and-forget — they act on the BrowserWindow that owns the calling
 * webContents, so a renderer can never target another window.
 */
export function registerWindowHandlers(): void {
  ipcMain.handle(IpcChannels.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle(IpcChannels.windowMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })

  ipcMain.handle(IpcChannels.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle(IpcChannels.windowIsMaximized, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  ipcMain.handle(IpcChannels.windowIsFullScreen, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  })

  registerHandler(IpcChannels.windowOpenWithConnection, connectionIdSchema, (id) => {
    createMainWindow(id)
    return null
  })
}
