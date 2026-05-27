import { ipcMain } from 'electron'
import { type z, ZodError } from 'zod'
import { fail, failFrom, ok } from '@main/utils/result'
import type { IpcFailure } from '@main/utils/result'

/** Turn validation/runtime errors into a normalized IpcFailure (never throw across IPC). */
function buildFailure(err: unknown): IpcFailure {
  if (err instanceof ZodError) {
    const message = err.issues
      .map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`)
      .join('; ')
    return fail('E_VALIDATION', message || 'Invalid request payload')
  }
  return failFrom(err)
}

/**
 * Register an IPC handler whose payload is validated by a Zod schema. The input
 * type is inferred from the schema, so handlers are fully typed end to end.
 */
export function registerHandler<S extends z.ZodTypeAny, TOutput>(
  channel: string,
  schema: S,
  handler: (input: z.infer<S>) => Promise<TOutput> | TOutput
): void {
  ipcMain.handle(channel, async (_event, rawInput) => {
    try {
      const input = schema.parse(rawInput) as z.infer<S>
      return ok(await handler(input))
    } catch (err) {
      return buildFailure(err)
    }
  })
}

/** Register an IPC handler that takes no payload (queries). */
export function registerQuery<TOutput>(
  channel: string,
  handler: () => Promise<TOutput> | TOutput
): void {
  ipcMain.handle(channel, async () => {
    try {
      return ok(await handler())
    } catch (err) {
      return buildFailure(err)
    }
  })
}
