import type { RequestOptions } from "../http/options.js"
import type { ApiResponse, WithResponse } from "../http/response.js"
import { attachResponse } from "../http/response.js"
import type { Sleeper, Transport } from "../http/transport.js"
import { Page } from "../page.js"
import { uuid } from "../uuid.js"
import * as validate from "../validate.js"

export abstract class Resource {
  constructor(
    protected readonly transport: Transport,
    protected readonly sleep: Sleeper,
  ) {}

  protected path(...segments: string[]): string {
    return "/v1/" + segments.map((s) => encodeURIComponent(s)).join("/")
  }

  /** Validates list filters, formats dates and drops nulls. */
  protected query(params: Record<string, unknown>): Record<string, unknown> {
    validate.listParams(params)
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      out[key] = value instanceof Date ? value.toISOString() : value
    }
    return out
  }

  protected object<T extends object>(response: ApiResponse): WithResponse<T> {
    const body = response.body
    const value = (typeof body === "object" && body !== null ? body : {}) as T
    return attachResponse(value, response)
  }

  protected page<T>(response: ApiResponse, next: (cursor: string) => Promise<Page<T>>): Page<T> {
    return Page.fromBody<T>(response.body, response, next)
  }

  protected static withKey(options: RequestOptions | undefined): RequestOptions {
    if (options?.idempotencyKey !== undefined) return options
    return { ...options, idempotencyKey: uuid() }
  }
}
