import type { IpcApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    /** The typed IPC surface exposed by the preload script. */
    api: IpcApi
  }
}

export {}
