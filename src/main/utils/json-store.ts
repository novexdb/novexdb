import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * A tiny persistence primitive: one JSON file under the app's userData dir,
 * written atomically (tmp file + rename) so a crash mid-write cannot corrupt
 * the store. Defaults are shallow-merged on read to tolerate schema growth.
 */
export class JsonStore<T extends object> {
  private cache: T | null = null

  constructor(
    private readonly fileName: string,
    private readonly defaults: T
  ) {}

  /** Resolved lazily — app.getPath must not be called before `app` is ready. */
  private get filePath(): string {
    return join(app.getPath('userData'), this.fileName)
  }

  async read(): Promise<T> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      this.cache = { ...this.defaults, ...(JSON.parse(raw) as Partial<T>) }
    } catch {
      this.cache = { ...this.defaults }
    }
    return this.cache
  }

  async write(value: T): Promise<void> {
    this.cache = value
    const tmpPath = `${this.filePath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf-8')
    await fs.rename(tmpPath, this.filePath)
  }
}
