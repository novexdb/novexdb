/**
 * Every IPC call returns an IpcResult — a discriminated union. Handlers never
 * throw across the process boundary; failures are normalized into IpcFailure so
 * the renderer can branch exhaustively without try/catch.
 */
export interface IpcError {
  code: string
  message: string
}

export interface IpcSuccess<T> {
  ok: true
  data: T
}

export interface IpcFailure {
  ok: false
  error: IpcError
}

export type IpcResult<T> = IpcSuccess<T> | IpcFailure

export type Platform = 'darwin' | 'win32' | 'linux'
