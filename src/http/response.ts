export interface RateLimit {
  limit: number | null
  remaining: number | null
  reset: number | null
}

export interface ApiResponse {
  readonly status: number
  /** Lower-cased header names. */
  readonly headers: Record<string, string>
  readonly body: unknown
  readonly rawBody: string
  readonly requestId: string | null
  readonly rateLimit: RateLimit | null
  readonly idempotentReplayed: boolean
  readonly idempotencyKey: string | null
  readonly retryAfter: number | null
}

export function rateLimitFromHeaders(headers: Record<string, string>): RateLimit | null {
  const limit = headers["x-ratelimit-limit"]
  const remaining = headers["x-ratelimit-remaining"]
  const reset = headers["x-ratelimit-reset"]
  if (limit === undefined && remaining === undefined && reset === undefined) return null
  const num = (v: string | undefined): number | null =>
    v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v)
  return { limit: num(limit), remaining: num(remaining), reset: num(reset) }
}

export function retryAfterFromHeaders(headers: Record<string, string>, now = Date.now()): number | null {
  const value = headers["retry-after"]
  if (value === undefined) return null
  if (/^\d+$/.test(value)) return Number(value)
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000))
}

export function buildApiResponse(
  status: number,
  headers: Record<string, string>,
  rawBody: string,
  idempotencyKey: string | null,
): ApiResponse {
  let body: unknown = null
  if (rawBody !== "") {
    try {
      body = JSON.parse(rawBody) as unknown
    } catch {
      body = null
    }
  }
  return {
    status,
    headers,
    body,
    rawBody,
    requestId: headers["x-request-id"] ?? null,
    rateLimit: rateLimitFromHeaders(headers),
    idempotentReplayed: headers["idempotent-replayed"] === "true",
    idempotencyKey,
    retryAfter: retryAfterFromHeaders(headers),
  }
}

/** Every model returned by the SDK carries the response it came from as a non-enumerable property. */
export type WithResponse<T> = T & { readonly lastResponse: ApiResponse }

export function attachResponse<T extends object>(value: T, response: ApiResponse): WithResponse<T> {
  Object.defineProperty(value, "lastResponse", {
    value: response,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  return value as WithResponse<T>
}
