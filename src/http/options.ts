import { InvalidRequestError } from "../errors.js"
import * as validate from "../validate.js"

export interface RequestOptions {
  /** Required for payments.create, refunds.create and transfers.create; generated when omitted. */
  idempotencyKey?: string
  /** Your own correlation id, 8 to 64 characters of A-Z a-z 0-9 . _ - */
  requestId?: string
  /** Per-attempt timeout in milliseconds. */
  timeoutMs?: number
  /** Retries after the first attempt for this call only. */
  maxRetries?: number
  /** Extra headers. Authorization, Host and framing headers cannot be set here. */
  headers?: Record<string, string>
  /** Abort the whole call, including retries. */
  signal?: AbortSignal
}

export function validateOptions(options: RequestOptions | undefined): RequestOptions {
  if (!options) return {}
  if (options.idempotencyKey !== undefined) validate.idempotencyKey(options.idempotencyKey)
  if (options.requestId !== undefined) validate.requestId(options.requestId)
  if (options.maxRetries !== undefined && (!Number.isInteger(options.maxRetries) || options.maxRetries < 0)) {
    throw new InvalidRequestError("maxRetries must be zero or more")
  }
  if (options.timeoutMs !== undefined && (!(options.timeoutMs > 0) || !Number.isFinite(options.timeoutMs))) {
    throw new InvalidRequestError("timeoutMs must be a positive number")
  }
  validate.headers(options.headers)
  return options
}
