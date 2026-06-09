import { z } from 'zod'

/**
 * Zod schemas are the single source of truth for connection *input* shapes.
 * Main-process IPC handlers validate every payload against these before use,
 * and the renderer derives its TypeScript types from them (see types/connection.ts).
 */

export const databaseEngineSchema = z.enum(['postgres', 'mysql', 'mssql'])

export const sslModeSchema = z.enum(['disable', 'prefer', 'require'])

/**
 * Engine-specific extras that don't fit the common postgres/mysql shape.
 * Today every field is consumed only by the MSSQL driver — postgres and mysql
 * ignore unknown options so this stays additive without per-engine branching.
 */
export const connectionOptionsSchema = z
  .object({
    encrypt: z.boolean().optional(),
    trustServerCertificate: z.boolean().optional(),
    connectionTimeoutMs: z.number().int().min(1_000).max(600_000).optional()
  })
  .strict()

export const sshAuthMethodSchema = z.enum(['password', 'privateKey'])

/**
 * Optional SSH tunnel ("Over SSH"). `password` and `passphrase` are INPUT-only
 * secrets — they ride in on create/update and are stripped + encrypted into the
 * OS keychain before the record is persisted, exactly like the database
 * `password` (so they never touch connections.json or cross back to the renderer).
 */
export const sshConfigSchema = z
  .object({
    enabled: z.boolean(),
    host: z.string().trim().max(255),
    port: z.number().int().min(1).max(65535),
    username: z.string().trim().max(255),
    authMethod: sshAuthMethodSchema,
    privateKeyPath: z.string().trim().max(4096).optional(),
    password: z.string().max(1024).optional(),
    passphrase: z.string().max(1024).optional()
  })
  .strict()

/**
 * Un-refined base object. `updateConnectionSchema` derives `.partial()` from
 * this — `superRefine` returns a ZodEffects, which has no `.partial()`, so the
 * conditional SSH validation lives only on the refined `connectionInputSchema`.
 */
const connectionInputBase = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  engine: databaseEngineSchema,
  host: z.string().trim().min(1, 'Host is required').max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().trim().min(1, 'Database is required').max(255),
  username: z.string().trim().min(1, 'Username is required').max(255),
  password: z.string().max(1024),
  ssl: sslModeSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color'),
  options: connectionOptionsSchema.optional(),
  ssh: sshConfigSchema.optional()
})

export const connectionInputSchema = connectionInputBase.superRefine((value, ctx) => {
  const ssh = value.ssh
  if (!ssh?.enabled) return
  if (!ssh.host) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ssh', 'host'],
      message: 'SSH host is required'
    })
  }
  if (!ssh.username) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ssh', 'username'],
      message: 'SSH username is required'
    })
  }
  if (ssh.authMethod === 'privateKey' && !ssh.privateKeyPath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ssh', 'privateKeyPath'],
      message: 'Select a private key file'
    })
  }
})

export const updateConnectionSchema = z.object({
  id: z.string().uuid(),
  changes: connectionInputBase.partial()
})

export const connectionIdSchema = z.string().uuid()

export const createDatabaseSchema = z.object({
  connectionId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name is required').max(63)
})

export const switchDatabaseSchema = z.object({
  connectionId: z.string().uuid(),
  database: z.string().trim().min(1, 'Database is required').max(63)
})

export const scriptCreateSchema = z.object({
  connectionId: z.string().uuid(),
  schema: z.string().trim().min(1, 'Schema is required').max(255),
  table: z.string().trim().min(1, 'Table is required').max(255)
})

export type DatabaseEngine = z.infer<typeof databaseEngineSchema>
export type SslMode = z.infer<typeof sslModeSchema>
export type ConnectionOptions = z.infer<typeof connectionOptionsSchema>
export type SshAuthMethod = z.infer<typeof sshAuthMethodSchema>
export type SshConfig = z.infer<typeof sshConfigSchema>
export type ConnectionInput = z.infer<typeof connectionInputSchema>
export type UpdateConnectionPayload = z.infer<typeof updateConnectionSchema>
