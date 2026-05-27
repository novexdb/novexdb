export type {
  DatabaseEngine,
  SslMode,
  ConnectionInput,
  ConnectionOptions,
  UpdateConnectionPayload
} from '@shared/schemas/connection.schema'

import type {
  ConnectionOptions,
  DatabaseEngine,
  SslMode
} from '@shared/schemas/connection.schema'

/**
 * A persisted connection. This is what the renderer ever sees — note the
 * deliberate absence of `password`: credentials live only in the encrypted
 * vault and are resolved in the main process at connect time.
 */
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
  createdAt: string
  updatedAt: string
}

export interface ConnectionTestResult {
  serverVersion: string
  latencyMs: number
}
