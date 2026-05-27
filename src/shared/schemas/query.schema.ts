import { z } from 'zod'

export const executeQuerySchema = z.object({
  connectionId: z.string().uuid(),
  queryId: z.string().uuid(),
  sql: z.string().trim().min(1, 'Query is empty').max(1_000_000)
})

export const cancelQuerySchema = z.object({
  connectionId: z.string().uuid(),
  queryId: z.string().uuid()
})

export const fileExportSchema = z.object({
  defaultName: z.string().trim().min(1).max(255),
  content: z.string().max(50_000_000)
})

export const fileOpenSchema = z.object({
  format: z.enum(['csv', 'json', 'sql'])
})

export const sqlImportStartSchema = z.object({
  importId: z.string().uuid(),
  connectionId: z.string().uuid(),
  path: z.string().min(1).max(4096)
})

export const sqlImportCancelSchema = z.object({
  importId: z.string().uuid()
})

export const executeBatchSchema = z.object({
  connectionId: z.string().uuid(),
  statements: z
    .array(
      z.object({
        // Generous cap — a chunk of a large SQL dump can be sizeable.
        sql: z.string().trim().min(1).max(5_000_000),
        // Postgres caps a statement at 65535 bind parameters.
        params: z.array(z.unknown()).max(65_535).optional()
      })
    )
    .min(1)
    .max(5_000)
})
