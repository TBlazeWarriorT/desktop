/**
 * Runs at most `max` tasks at once; the rest wait their turn. For lists that
 * would otherwise start a git process per visible row.
 */
export function createConcurrencyLimit(max: number) {
  let running = 0
  const waiting = new Array<() => void>()

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (running >= max) {
      await new Promise<void>(resolve => waiting.push(resolve))
    }
    running++
    try {
      return await task()
    } finally {
      running--
      waiting.shift()?.()
    }
  }
}
