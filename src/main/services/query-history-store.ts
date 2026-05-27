import { randomUUID } from 'node:crypto'
import { JsonStore } from '@main/utils/json-store'
import type { QueryHistoryEntry } from '@shared/types/history'

/** Keep history bounded so the JSON file stays small. */
const MAX_HISTORY = 200

interface HistoryFile {
  entries: QueryHistoryEntry[]
}

/** Persists executed-query history (newest first) as a JSON file. */
class QueryHistoryStore {
  private readonly store = new JsonStore<HistoryFile>('query-history.json', { entries: [] })

  async list(): Promise<QueryHistoryEntry[]> {
    const { entries } = await this.store.read()
    return entries
  }

  async add(entry: Omit<QueryHistoryEntry, 'id'>): Promise<void> {
    const { entries } = await this.store.read()
    const next = [{ ...entry, id: randomUUID() }, ...entries].slice(0, MAX_HISTORY)
    await this.store.write({ entries: next })
  }

  async clear(): Promise<void> {
    await this.store.write({ entries: [] })
  }
}

export const queryHistoryStore = new QueryHistoryStore()
