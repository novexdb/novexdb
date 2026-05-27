export interface QueryHistoryEntry {
  id: string
  connectionId: string
  connectionName: string
  sql: string
  status: 'success' | 'error'
  rowCount: number
  durationMs: number
  executedAt: string
  errorMessage?: string
}
