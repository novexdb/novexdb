import type { IpcResult } from '@shared/types/ipc'

/** Wrap a value as a successful IpcResult. */
export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export type IpcFailure = Extract<IpcResult<unknown>, { ok: false }>

/** Build a failed IpcResult with an explicit error code. */
export function fail(code: string, message: string): IpcFailure {
  return { ok: false, error: { code, message } }
}

/** Normalize any thrown value into a failed IpcResult — handlers never leak stack traces. */
export function failFrom(err: unknown, code = 'E_INTERNAL'): IpcFailure {
  const message = err instanceof Error ? err.message : String(err)
  return fail(code, message)
}
