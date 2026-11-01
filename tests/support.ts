import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { FetchLike } from "../src/http/transport.js"
import { PaySafe } from "../src/index.js"

export const TEST_KEY = "paysafe_test_9f2Kx7Qm3Rt8Vw2Yz5Ab1Cd4Ef6Gh9Jk"
export const REQUEST_ID = "req_01J7A9Q0K3M4N5P6R7S8T9V0W1"

const here = dirname(fileURLToPath(import.meta.url))

export function fixture<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(readFileSync(join(here, "fixtures", `${name}.json`), "utf8")) as T
}

export interface OperationFixture {
  operationId: string
  method: string
  path: string
  resolvedPath: string
  pathParams: Record<string, string>
  query: Record<string, unknown>
  headers: Record<string, string>
  body: Record<string, unknown> | null
  minimalBody: Record<string, unknown> | null
  responses: Record<
    string,
    { headers: Record<string, string>; body: Record<string, unknown> | null; code?: string; schema?: string | null }
  >
}

export type Queued = Response | Error | ((input: string, init: RequestInit) => Response | Promise<Response>)

export class FakeFetch {
  readonly requests: Array<{ url: string; init: RequestInit }> = []
  private readonly queue: Queued[] = []

  readonly fetch: FetchLike = (input, init) => {
    this.requests.push({ url: input, init })
    const next = this.queue.shift()
    if (next === undefined) return Promise.reject(new Error(`No queued response for ${init.method ?? "GET"} ${input}`))
    if (next instanceof Error) return Promise.reject(next)
    if (typeof next === "function") return Promise.resolve(next(input, init))
    return Promise.resolve(next)
  }

  push(item: Queued): this {
    this.queue.push(item)
    return this
  }

  json(status: number, body: unknown, headers: Record<string, string> = {}): this {
    const raw = body === null || body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body)
    const h = new Headers(headers)
    if (!h.has("x-request-id")) h.set("x-request-id", REQUEST_ID)
    if (raw !== "" && !h.has("content-type")) h.set("content-type", "application/json")
    return this.push(new Response(status === 204 ? null : raw, { status, headers: h }))
  }

  get last(): { url: string; init: RequestInit } {
    const last = this.requests.at(-1)
    if (!last) throw new Error("No request was sent")
    return last
  }

  lastHeader(name: string): string | null {
    const headers = this.last.init.headers as Record<string, string>
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
    return key ? headers[key]! : null
  }

  lastBody(): unknown {
    const body = this.last.init.body
    return typeof body === "string" && body !== "" ? JSON.parse(body) : null
  }

  get pending(): number {
    return this.queue.length
  }

  /** A request that never completes until the SDK aborts it, like a stalled server. */
  hang(): this {
    return this.push(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal
          if (!signal) return
          if (signal.aborted) {
            reject(signal.reason as Error)
            return
          }
          signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true })
        }),
    )
  }
}

export class Sleeps {
  readonly sleeps: number[] = []
  readonly sleep = (ms: number): Promise<void> => {
    this.sleeps.push(ms)
    return Promise.resolve()
  }
  get total(): number {
    return this.sleeps.reduce((a, b) => a + b, 0)
  }
}

export function client(overrides: { maxRetries?: number } = {}): { client: PaySafe; http: FakeFetch; sleeps: Sleeps } {
  const http = new FakeFetch()
  const sleeps = new Sleeps()
  const c = new PaySafe({
    apiKey: TEST_KEY,
    baseUrl: "https://api.test.invalid",
    maxRetries: overrides.maxRetries ?? 4,
    fetch: http.fetch,
    sleep: sleeps.sleep,
    random: () => 0.5,
  })
  return { client: c, http, sleeps }
}

export function successOf(f: OperationFixture): {
  code: number
  body: Record<string, unknown> | null
  headers: Record<string, string>
} {
  const code = Object.keys(f.responses).find((c) => c.startsWith("2"))!
  const r = f.responses[code]!
  return { code: Number(code), body: r.body, headers: r.headers }
}
