/**
 * A small concurrency gate so bursts of AI requests don't all hit the API at
 * once. Transport-level retry/backoff is handled by the Anthropic SDK itself.
 */
export class ConcurrencyLimiter {
  private active = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.active += 1
    try {
      return await task()
    } finally {
      this.active -= 1
      this.queue.shift()?.()
    }
  }
}

export const aiLimiter = new ConcurrencyLimiter(4)
