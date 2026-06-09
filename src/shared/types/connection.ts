export type {
  DatabaseEngine,
  SslMode,
  ConnectionInput,
  ConnectionOptions,
  SshAuthMethod,
  SshConfig,
  UpdateConnectionPayload
} from '@shared/schemas/connection.schema'

import type {
  ConnectionOptions,
  DatabaseEngine,
  SshAuthMethod,
  SslMode
} from '@shared/schemas/connection.schema'

/**
 * A persisted connection. This is what the renderer ever sees — note the
 * deliberate absence of `password`: credentials live only in the encrypted
 * vault and are resolved in the main process at connect time.
 */
/**
 * Persisted SSH-tunnel settings — the secret-free subset. The SSH password and
 * key passphrase live encrypted in the vault (resolved in main at connect time),
 * mirroring how the database password is handled.
 */
export interface SshConnectionConfig {
  enabled: boolean
  host: string
  port: number
  username: string
  authMethod: SshAuthMethod
  /** Absolute path to the private key file (privateKey auth). */
  privateKeyPath?: string
}

export interface Connection {
  id: string
  name: string
  engine: DatabaseEngine
  host: string
  port: number
  database: string
  username: string
  ssl: SslMode
  color: string
  /** Engine-specific extras (e.g. SQL Server's `encrypt`). Undefined for older records. */
  options?: ConnectionOptions
  /** Optional SSH tunnel; undefined for direct connections. */
  ssh?: SshConnectionConfig
  createdAt: string
  updatedAt: string
}

export interface ConnectionTestResult {
  serverVersion: string
  latencyMs: number
}
