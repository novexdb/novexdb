import { connectionInputSchema } from '@shared/schemas/connection.schema'
import {
  CONNECTION_COLORS,
  DEFAULT_PORTS,
  DEFAULT_SSH_CONFIG,
  ENGINE_OPTION_DEFAULTS
} from '@renderer/features/connections/constants'
import type { Connection, ConnectionInput } from '@shared/types/connection'

export type ConnectionFieldErrors = Partial<
  Record<Exclude<keyof ConnectionInput, 'ssh'>, string>
> & {
  /** Per-field errors for the nested SSH config. */
  ssh?: Partial<
    Record<'host' | 'port' | 'username' | 'privateKeyPath' | 'password' | 'passphrase', string>
  >
}

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
      color: CONNECTION_COLORS[0],
      ssh: DEFAULT_SSH_CONFIG
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
    options: target.options ?? ENGINE_OPTION_DEFAULTS[target.engine],
    // Prefill SSH metadata; secrets never come back to the renderer, so the
    // password/passphrase stay blank ("keep existing" on save).
    ssh: target.ssh
      ? { ...DEFAULT_SSH_CONFIG, ...target.ssh, password: '', passphrase: '' }
      : DEFAULT_SSH_CONFIG
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
    const [first, second] = issue.path
    if (first === 'ssh') {
      if (typeof second === 'string') {
        const key = second as keyof NonNullable<ConnectionFieldErrors['ssh']>
        errors.ssh = errors.ssh ?? {}
        if (!(key in errors.ssh)) errors.ssh[key] = issue.message
      }
      continue
    }
    if (typeof first === 'string' && !(first in errors)) {
      errors[first as Exclude<keyof ConnectionInput, 'ssh'>] = issue.message
    }
  }
  return { ok: false, errors }
}

/**
 * Convert a validated draft into an update payload. On edit, a blank password
 * means "keep the existing one", so the key is dropped rather than sent empty.
 */
export function toUpdateChanges(data: ConnectionInput): Partial<ConnectionInput> {
  const changes: Partial<ConnectionInput> = { ...data }
  // Blank DB password = keep the existing one.
  if (changes.password === '') delete changes.password
  // Blank SSH secrets = keep existing — strip them from the nested object.
  if (changes.ssh) {
    const ssh = { ...changes.ssh }
    if (ssh.password === '') delete ssh.password
    if (ssh.passphrase === '') delete ssh.passphrase
    changes.ssh = ssh
  }
  return changes
}
