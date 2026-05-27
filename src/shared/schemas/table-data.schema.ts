import { z } from 'zod'

export const tableFetchSchema = z.object({
  connectionId: z.string().uuid(),
  schema: z.string().min(1).max(255),
  table: z.string().min(1).max(255),
  limit: z.number().int().min(1).max(1000),
  offset: z.number().int().min(0),
  orderBy: z.string().max(255).nullable(),
  orderDir: z.enum(['asc', 'desc']),
  search: z.string().max(255)
})

const rowValues = z.record(z.string(), z.unknown())

export const tableMutateSchema = z.object({
  connectionId: z.string().uuid(),
  schema: z.string().min(1).max(255),
  table: z.string().min(1).max(255),
  changes: z.object({
    inserts: z.array(z.object({ values: rowValues })).max(2000),
    updates: z.array(z.object({ pk: rowValues, set: rowValues })).max(5000),
    deletes: z.array(z.object({ pk: rowValues })).max(5000)
  })
})
