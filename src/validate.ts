import { InvalidRequestError } from "./errors.js"

export const MAX_BODY_BYTES = 65536
export const MAX_METADATA_BYTES = 8192

const PROTECTED_HEADERS = new Set(["authorization", "host", "content-length", "transfer-encoding", "connection"])
const CONTROL = /[\x00-\x08\x0A-\x1F\x7F]/
const ID = /^[A-Za-z0-9_-]{1,64}$/
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"])

export function idempotencyKey(key: string): void {
  if (key.length < 1 || key.length > 255 || !/^[\x20-\x7E]+$/.test(key)) {
    throw new InvalidRequestError("Idempotency-Key must be 1 to 255 printable ASCII characters")
  }
}

export function requestId(id: string): void {
  if (!/^[A-Za-z0-9._-]{8,64}$/.test(id)) {
    throw new InvalidRequestError("X-Request-ID must be 8 to 64 characters of A-Z a-z 0-9 . _ -")
  }
}

/** Identifiers go into URL paths; anything outside the id alphabet is rejected. */
export function id(value: unknown, name = "id"): string {
  if (typeof value !== "string" || !ID.test(value)) {
    throw new InvalidRequestError(`${name} must be 1 to 64 characters of A-Z a-z 0-9 _ -`, name)
  }
  return value
}

export function headers(h: Record<string, string> | undefined): void {
  if (!h) return
  for (const [name, value] of Object.entries(h)) {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(name))
      throw new InvalidRequestError("Header names may only contain letters, digits and dashes")
    if (PROTECTED_HEADERS.has(name.toLowerCase()))
      throw new InvalidRequestError(`The ${name} header cannot be overridden`)
    if (typeof value !== "string" || CONTROL.test(value) || value.length > 4096)
      throw new InvalidRequestError(`Header ${name} has an invalid value`)
  }
}

export function required(params: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    const value = dig(params, field)
    if (value === undefined || value === null || value === "")
      throw new InvalidRequestError(`${field} is required`, field)
  }
}

export function phone(value: unknown, field = "customer.phone"): void {
  if (typeof value !== "string" || !/^\+255\d{9}$/.test(value)) {
    throw new InvalidRequestError(`${field} must be an E.164 Tanzanian number (+255 followed by nine digits)`, field)
  }
}

export function amount(value: unknown, min: number, max: number, field = "amount"): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new InvalidRequestError(`${field} must be an integer between ${min} and ${max}`, field)
  }
}

export function optionalAmount(params: Record<string, unknown>, field: string, min: number, max: number): void {
  const value = params[field]
  if (value !== undefined && value !== null) amount(value, min, max, field)
}

export function enumValue(params: Record<string, unknown>, field: string, allowed: readonly string[]): void {
  const value = params[field]
  if (value === undefined || value === null) return
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new InvalidRequestError(`${field} must be one of ${allowed.join(", ")}`, field)
  }
}

export function string(params: Record<string, unknown>, field: string, min: number, max: number): void {
  const value = params[field]
  if (value === undefined || value === null) return
  if (
    typeof value !== "string" ||
    value.length < min ||
    value.length > max ||
    /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)
  ) {
    throw new InvalidRequestError(`${field} must be a string of ${min} to ${max} characters`, field)
  }
}

export function boolean(params: Record<string, unknown>, field: string): void {
  const value = params[field]
  if (value !== undefined && value !== null && typeof value !== "boolean") {
    throw new InvalidRequestError(`${field} must be a boolean`, field)
  }
}

export function listParams(params: Record<string, unknown>): void {
  const limit = params["limit"]
  if (
    limit !== undefined &&
    limit !== null &&
    (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100)
  ) {
    throw new InvalidRequestError("limit must be an integer between 1 and 100", "limit")
  }
  const cursor = params["cursor"]
  if (
    cursor !== undefined &&
    cursor !== null &&
    (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 200 || !/^[\x21-\x7E]+$/.test(cursor))
  ) {
    throw new InvalidRequestError("cursor must be an opaque value returned by a previous list call", "cursor")
  }
  for (const [key, value] of Object.entries(params)) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(key)) throw new InvalidRequestError("Query parameter names must be alphanumeric")
    if (
      value === undefined ||
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      value instanceof Date
    )
      continue
    if (typeof value !== "string" || value.length > 500 || /[\x00-\x1F\x7F]/.test(value)) {
      throw new InvalidRequestError(`${key} has an invalid value`, key)
    }
  }
}

export function metadata(params: Record<string, unknown>, field = "metadata"): void {
  const value = params[field]
  if (value === undefined || value === null) return
  if (typeof value !== "object" || Array.isArray(value))
    throw new InvalidRequestError(`${field} must be an object`, field)
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_METADATA_BYTES) {
    throw new InvalidRequestError(`${field} must encode to at most ${MAX_METADATA_BYTES} bytes of JSON`, field)
  }
}

export function isLoopback(host: string): boolean {
  return LOOPBACK.has(host.toLowerCase())
}

export function url(params: Record<string, unknown>, field: string, maxLength = 500): void {
  const value = params[field]
  if (value === undefined || value === null) return
  if (typeof value !== "string" || value.length > maxLength || /[\s\x00-\x1F\x7F]/.test(value)) {
    throw new InvalidRequestError(`${field} must be a URL of at most ${maxLength} characters`, field)
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new InvalidRequestError(`${field} must be an absolute URL`, field)
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback(parsed.hostname))) {
    throw new InvalidRequestError(`${field} must use https`, field)
  }
}

export function bodySize(json: string): void {
  if (Buffer.byteLength(json, "utf8") > MAX_BODY_BYTES)
    throw new InvalidRequestError(`Request body exceeds the ${MAX_BODY_BYTES} byte limit`)
}

export function dateTime(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new InvalidRequestError(`${field} is an invalid date`, field)
    return value.toISOString()
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/.test(value))
    return value
  throw new InvalidRequestError(`${field} must be an RFC 3339 timestamp, a YYYY-MM-DD date or a Date`, field)
}

function dig(params: Record<string, unknown>, path: string): unknown {
  let current: unknown = params
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null || !(segment in current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}
