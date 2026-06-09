import { DEFAULT_SSH_CONFIG, DEFAULT_PORTS } from '@renderer/features/connections/constants'
import type { ConnectionInput, DatabaseEngine, SslMode } from '@shared/types/connection'

/**
 * Parses a TablePlus-style connection URL into form values. Supports both the
 * plain form and the `+ssh` tunnel form:
 *
 *   postgresql://user:pass@host:5432/db?name=Local
 *   postgresql+ssh://sshUser@bastion:22/dbUser:dbPass@127.0.0.1:5432/db?name=Prod&usePrivateKey=true
 *
 * The `+ssh` form has two `@`-segments: SSH credentials@host, then the database
 * credentials@host/name. Secrets that aren't in the URL (e.g. the private key
 * file) are left for the user to fill in after import.
 */

const ENGINE_BY_SCHEME: Record<string, DatabaseEngine> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  mysql: 'mysql',
  mssql: 'mssql',
  sqlserver: 'mssql'
}

const SSL_BY_MODE: Record<string, SslMode> = {
  disable: 'disable',
  disabled: 'disable',
  prefer: 'prefer',
  require: 'require',
  required: 'require'
}

export type UrlParseResult =
  | { ok: true; value: Partial<ConnectionInput> }
  | { ok: false; error: string }

/** decodeURIComponent that tolerates values which aren't percent-encoded. */
function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Split "host:port" → { host, port? }; falls back to a bare host on a bad port. */
function splitHostPort(value: string): { host: string; port?: number } {
  const idx = value.lastIndexOf(':')
  if (idx === -1) return { host: value }
  const host = value.slice(0, idx)
  const port = Number(value.slice(idx + 1))
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return { host: value }
  return { host, port }
}

/** Split "user:password" → { user, password? }, decoding each part. */
function splitCreds(value: string): { user: string; password?: string } {
  const idx = value.indexOf(':')
  if (idx === -1) return { user: decode(value) }
  return { user: decode(value.slice(0, idx)), password: decode(value.slice(idx + 1)) }
}

export function parseConnectionUrl(raw: string): UrlParseResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: 'Paste a connection URL to import.' }

  const schemeMatch = /^([a-z0-9+]+):\/\//i.exec(trimmed)
  if (!schemeMatch) return { ok: false, error: 'That doesn’t look like a connection URL.' }

  const scheme = schemeMatch[1].toLowerCase()
  const isSsh = scheme.endsWith('+ssh')
  const baseScheme = isSsh ? scheme.slice(0, -4) : scheme
  const engine = ENGINE_BY_SCHEME[baseScheme]
  if (!engine) return { ok: false, error: `Unsupported database type “${baseScheme}”.` }

  const afterScheme = trimmed.slice(schemeMatch[0].length)
  const qIndex = afterScheme.indexOf('?')
  const authority = qIndex === -1 ? afterScheme : afterScheme.slice(0, qIndex)
  const params = new URLSearchParams(qIndex === -1 ? '' : afterScheme.slice(qIndex + 1))

  const value: Partial<ConnectionInput> = { engine }

  if (isSsh) {
    const firstSlash = authority.indexOf('/')
    if (firstSlash === -1) {
      return { ok: false, error: 'SSH URL is missing the database section after the host.' }
    }
    const sshPart = authority.slice(0, firstSlash)
    const dbPart = authority.slice(firstSlash + 1)

    const sshAt = sshPart.lastIndexOf('@')
    const sshCreds = sshAt === -1 ? '' : sshPart.slice(0, sshAt)
    const sshHost = splitHostPort(sshAt === -1 ? sshPart : sshPart.slice(sshAt + 1))
    const sshUser = splitCreds(sshCreds)

    const dbAt = dbPart.lastIndexOf('@')
    if (dbAt === -1) return { ok: false, error: 'SSH URL is missing the database host.' }
    const dbCreds = splitCreds(dbPart.slice(0, dbAt))
    const dbHostAndName = dbPart.slice(dbAt + 1)
    const dbSlash = dbHostAndName.indexOf('/')
    const dbHost = splitHostPort(dbSlash === -1 ? dbHostAndName : dbHostAndName.slice(0, dbSlash))
    const dbName = dbSlash === -1 ? '' : decode(dbHostAndName.slice(dbSlash + 1))

    value.host = dbHost.host
    value.port = dbHost.port ?? DEFAULT_PORTS[engine]
    value.database = dbName
    value.username = dbCreds.user
    if (dbCreds.password !== undefined) value.password = dbCreds.password

    value.ssh = {
      ...DEFAULT_SSH_CONFIG,
      enabled: true,
      host: sshHost.host,
      port: sshHost.port ?? DEFAULT_SSH_CONFIG.port,
      username: sshUser.user,
      authMethod: params.get('usePrivateKey') === 'true' ? 'privateKey' : 'password',
      password: sshUser.password ?? ''
    }
  } else {
    const at = authority.lastIndexOf('@')
    const creds = splitCreds(at === -1 ? '' : authority.slice(0, at))
    const hostAndName = at === -1 ? authority : authority.slice(at + 1)
    const slash = hostAndName.indexOf('/')
    const host = splitHostPort(slash === -1 ? hostAndName : hostAndName.slice(0, slash))

    value.host = host.host
    value.port = host.port ?? DEFAULT_PORTS[engine]
    value.database = slash === -1 ? '' : decode(hostAndName.slice(slash + 1))
    value.username = creds.user
    if (creds.password !== undefined) value.password = creds.password
    // Import is authoritative — a plain URL means "no tunnel".
    value.ssh = { ...DEFAULT_SSH_CONFIG }
  }

  const name = params.get('name')
  if (name) value.name = decode(name)

  const sslmode = params.get('sslmode') ?? params.get('ssl')
  if (sslmode && SSL_BY_MODE[sslmode.toLowerCase()]) {
    value.ssl = SSL_BY_MODE[sslmode.toLowerCase()]
  }

  if (!value.host) return { ok: false, error: 'Could not find a database host in the URL.' }
  return { ok: true, value }
}
