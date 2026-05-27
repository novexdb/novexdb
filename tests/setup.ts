import { tmpdir } from 'node:os'
import { vi } from 'vitest'

/**
 * Stub the `electron` module — main-process utilities like `JsonStore` call
 * `app.getPath('userData')` at runtime and we don't have a real Electron
 * process behind the tests. Individual test files override `app.getPath`
 * with `vi.mocked` when they need a specific path.
 */
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tmpdir()),
    getName: vi.fn(() => 'novexdb-test')
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => []
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn()
  },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn()
  }
}))
