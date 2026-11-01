import { ApiConnectionError, ApiError, ApiTimeoutError, ResponseTooLargeError, mapApiError } from "../errors.js"
import * as validate from "../validate.js"
import type { RequestOptions } from "./options.js"
import { validateOptions } from "./options.js"
import type { ApiResponse } from "./response.js"
import { buildApiResponse } from "./response.js"

export const INITIAL_BACKOFF_MS = 500
export const MAX_BACKOFF_MS = 8000
export const IN_PROGRESS_SLEEP_MS = 1000
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>
export type Sleeper = (ms: number, signal?: AbortSignal) => Promise<void>
export type LogRecord = {
  method: string
  path: string
  status: number | null
  attempt: number
  durationMs: number
  requestId: string | null
  error: string | null
}

export interface TransportConfig {
  apiKey: string
  baseUrl: string
  timeoutMs: number
  maxRetries: number
  apiVersion: string | null
  userAgent: string
  fetch: FetchLike
  sleep: Sleeper
  logger: ((record: LogRecord) => void) | null
  random: () => number
}

export const defaultSleep: Sleeper = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortError(signal))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })

function abortError(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason
  return reason instanceof Error ? reason : new ApiConnectionError("Request aborted")
}

export class Transport {
  constructor(private readonly config: TransportConfig) {}

  async request(
    method: string,
    path: string,
    query: Record<string, unknown> = {},
    body: Record<string, unknown> | null = null,
    options?: RequestOptions,
  ): Promise<ApiResponse> {
    const opts = validateOptions(options)
    const url = this.config.baseUrl + path + queryString(query)
    const json = body === null ? null : encodeBody(body)
    if (json !== null) validate.bodySize(json)
    const retryable = method === "GET" || method === "DELETE" || method === "PATCH" || opts.idempotencyKey !== undefined
    const maxAttempts = 1 + (opts.maxRetries ?? this.config.maxRetries)
    let attempt = 0

    for (;;) {
      attempt++
      const started = Date.now()
      let response: ApiResponse
      try {
        response = await this.send(method, url, json, opts)
      } catch (error) {
        if (!(error instanceof ApiConnectionError)) throw error
        this.log(method, path, null, attempt, started, null, error.message)
        if (!retryable || attempt >= maxAttempts || error instanceof ResponseTooLargeError || opts.signal?.aborted)
          throw error
        await this.config.sleep(this.backoff(attempt), opts.signal)
        continue
      }

      this.log(method, path, response.status, attempt, started, response.requestId, null)
      if (response.status < 300) return response
      if (response.status < 400) {
        throw new ApiError({
          status: response.status,
          code: "unexpected_redirect",
          message: "The API answered with a redirect, which this SDK never follows",
          requestId: response.requestId,
          param: null,
          details: null,
          docUrl: null,
          headers: response.headers,
          retryAfter: null,
          rateLimit: response.rateLimit,
        })
      }

      const error = errorFromResponse(response)
      const delay = this.retryDelay(error, retryable, attempt)
      if (delay === null || attempt >= maxAttempts) throw error
      await this.config.sleep(delay, opts.signal)
    }
  }

  private retryDelay(error: ApiError, retryable: boolean, attempt: number): number | null {
    if (error.code === "idempotency_in_progress") return IN_PROGRESS_SLEEP_MS
    if (error.status === 429 || error.status === 503)
      return error.retryAfter !== null ? error.retryAfter * 1000 : this.backoff(attempt)
    if (error.status >= 500 && error.code !== "provider_error" && retryable) return this.backoff(attempt)
    return null
  }

  private backoff(attempt: number): number {
    const ceiling = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** (attempt - 1))
    return Math.floor(this.config.random() * (ceiling + 1))
  }

  private async send(method: string, url: string, json: string | null, opts: RequestOptions): Promise<ApiResponse> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: "application/json",
      "User-Agent": this.config.userAgent,
    }
    if (this.config.apiVersion) headers["PaySafe-Version"] = this.config.apiVersion
    if (opts.idempotencyKey !== undefined) headers["Idempotency-Key"] = opts.idempotencyKey
    if (opts.requestId !== undefined) headers["X-Request-ID"] = opts.requestId
    for (const [name, value] of Object.entries(opts.headers ?? {})) headers[name] = value
    if (json !== null) headers["Content-Type"] = "application/json"

    const controller = new AbortController()
    const timeoutMs = opts.timeoutMs ?? this.config.timeoutMs
    const timer = setTimeout(
      () => controller.abort(new ApiTimeoutError(`Request to PaySafe timed out after ${timeoutMs} ms`)),
      timeoutMs,
    )
    const onOuterAbort = (): void => controller.abort(abortError(opts.signal))
    opts.signal?.addEventListener("abort", onOuterAbort, { once: true })

    try {
      const init: RequestInit = { method, headers, signal: controller.signal, redirect: "manual" }
      if (json !== null) init.body = json
      let response: Response
      try {
        response = await this.config.fetch(url, init)
      } catch (error) {
        if (error instanceof ApiConnectionError) throw error
        if (controller.signal.aborted) {
          const reason: unknown = controller.signal.reason
          if (reason instanceof Error) throw reason
        }
        throw new ApiConnectionError(`Could not reach PaySafe: ${messageOf(error)}`, { cause: error })
      }
      const headerMap: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headerMap[key.toLowerCase()] = value
      })
      const rawBody = await readBounded(response)
      return buildApiResponse(response.status, headerMap, rawBody, opts.idempotencyKey ?? null)
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener("abort", onOuterAbort)
    }
  }

  private log(
    method: string,
    path: string,
    status: number | null,
    attempt: number,
    started: number,
    requestId: string | null,
    error: string | null,
  ): void {
    this.config.logger?.({ method, path, status, attempt, durationMs: Date.now() - started, requestId, error })
  }
}

async function readBounded(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? "0")
  if (length > MAX_RESPONSE_BYTES) throw new ResponseTooLargeError("Response body exceeds the 16 MB limit")
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new ResponseTooLargeError("Response body exceeds the 16 MB limit")
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

export function errorFromResponse(response: ApiResponse): ApiError {
  const body = response.body as { error?: Record<string, unknown> } | null
  const error = body && typeof body === "object" && body.error && typeof body.error === "object" ? body.error : null
  if (error) {
    const code = typeof error["code"] === "string" ? error["code"] : "unknown"
    return mapApiError({
      status: response.status,
      code,
      message: typeof error["message"] === "string" ? error["message"] : "Request failed",
      requestId: typeof error["request_id"] === "string" ? error["request_id"] : response.requestId,
      param: typeof error["param"] === "string" ? error["param"] : null,
      details:
        error["details"] && typeof error["details"] === "object" ? (error["details"] as Record<string, unknown>) : null,
      docUrl: typeof error["doc_url"] === "string" ? error["doc_url"] : null,
      headers: response.headers,
      retryAfter: response.retryAfter,
      rateLimit: response.rateLimit,
    })
  }
  return mapApiError({
    status: response.status,
    code: "unknown",
    message: `HTTP ${response.status} from the PaySafe API`,
    requestId: response.requestId,
    param: null,
    details: response.rawBody === "" ? null : { raw: response.rawBody.slice(0, 4096) },
    docUrl: null,
    headers: response.headers,
    retryAfter: response.retryAfter,
    rateLimit: response.rateLimit,
  })
}

export function queryString(query: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    const text =
      value instanceof Date
        ? value.toISOString()
        : typeof value === "string"
          ? value
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : JSON.stringify(value)
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`)
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`
}

export function encodeBody(body: Record<string, unknown>): string {
  return JSON.stringify(body, (_key, value: unknown) => (value instanceof Date ? value.toISOString() : value))
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause
    return cause instanceof Error ? `${error.message} (${cause.message})` : error.message
  }
  return String(error)
}
