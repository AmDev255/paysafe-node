import { PollingTimeoutError } from "./errors.js"
import type { Sleeper } from "./http/transport.js"

export const MIN_POLL_INTERVAL_MS = 500
const SLOW_POLL_AFTER_MS = 30000
const SLOW_POLL_INTERVAL_MS = 5000

export interface WaitOptions<T> {
  /** Milliseconds between polls (minimum 500). */
  intervalMs?: number
  /** Give up after this many milliseconds of waiting. */
  timeoutMs?: number
  /** Called whenever the status changes. */
  onUpdate?: (object: T) => void
  /** Abort the wait. */
  signal?: AbortSignal
}

export async function poll<T extends { status: string }>(
  fetch: () => Promise<T>,
  isTerminal: (object: T) => boolean,
  sleep: Sleeper,
  defaults: { intervalMs: number; timeoutMs: number },
  options: WaitOptions<T> | undefined,
  what: string,
): Promise<T> {
  const intervalMs = Math.max(MIN_POLL_INTERVAL_MS, options?.intervalMs ?? defaults.intervalMs)
  const timeoutMs = options?.timeoutMs ?? defaults.timeoutMs
  let waited = 0
  let lastStatus: string | null = null
  for (;;) {
    const object = await fetch()
    if (options?.onUpdate && object.status !== lastStatus) {
      options.onUpdate(object)
      lastStatus = object.status
    }
    if (isTerminal(object)) return object
    if (options?.signal?.aborted) throw new PollingTimeoutError(`Polling for ${what} was cancelled`, object)
    if (waited >= timeoutMs)
      throw new PollingTimeoutError(`${what} did not reach a terminal state within ${timeoutMs} ms`, object)
    let delay = waited >= SLOW_POLL_AFTER_MS ? Math.max(intervalMs, SLOW_POLL_INTERVAL_MS) : intervalMs
    delay = Math.min(delay, timeoutMs - waited)
    await sleep(delay, options?.signal)
    waited += delay
  }
}
