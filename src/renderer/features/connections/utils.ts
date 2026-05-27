import { connectionInputSchema } from '@shared/schemas/connection.schema'
import {
  CONNECTION_COLORS,
  DEFAULT_PORTS,
  ENGINE_OPTION_DEFAULTS
} from '@renderer/features/connections/constants'
import type { Connection, ConnectionInput } from '@shared/types/connection'

export type ConnectionFieldErrors = Partial<Record<keyof ConnectionInput, string>>

/** Build the initial form draft — defaults for create, prefilled for edit. */
export function buildDraft(target: Connection | null): ConnectionInput {
  if (!target) {
    return {
      name: '',
      engine: 'postgres',
      host: 'localhost',
      port: DEFAULT_PORTS.postgres,
      database: '',
      username: '',
      password: '',
      ssl: 'prefer',
      color: CONNECTION_COLORS[0]
    }
  }
  // Password is intentionally blank — it is never sent back to the renderer.
  return {
    name: target.name,
    engine: target.engine,
    host: target.host,
    port: target.port,
    database: target.database,
    username: target.username,
    password: '',
    ssl: target.ssl,
    color: target.color,
    options: target.options ?? ENGINE_OPTION_DEFAULTS[target.engine]
  }
}

type ValidationOutcome =
  | { ok: true; data: ConnectionInput }
  | { ok: false; errors: ConnectionFieldErrors }

/** Validate a draft against the shared Zod schema, mapping issues per field. */
export function validateDraft(draft: ConnectionInput): ValidationOutcome {
  const parsed = connectionInputSchema.safeParse(draft)
  if (parsed.success) return { ok: true, data: parsed.data }

  const errors: ConnectionFieldErrors = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !(key in errors)) {
      errors[key as keyof ConnectionInput] = issue.message
    }
  }
  return { ok: false, errors }
}

/**
 * Convert a validated draft into an update payload. On edit, a blank password
 * means "keep the existing one", so the key is dropped rather than sent empty.
 */
export function toUpdateChanges(data: ConnectionInput): Partial<ConnectionInput> {
  if (data.password !== '') return data
  const { password: _omit, ...rest } = data
  return rest
}
