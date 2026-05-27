import type { IpcApi } from '@shared/ipc-contract'
import type { IpcResult } from '@shared/types/ipc'

/**
 * The preload-injected API surface. Every feature imports `ipc` from here, so
 * there is exactly one reference to `window.api` in the renderer.
 */
export const ipc: IpcApi = window.api

/** Unwrap an IpcResult, throwing on failure — for call sites that prefer try/catch. */
export function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}
