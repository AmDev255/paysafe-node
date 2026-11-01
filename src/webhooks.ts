import { createHmac, timingSafeEqual } from "node:crypto"
import { SignatureVerificationError } from "./errors.js"
import type { Event } from "./models.js"

export const DEFAULT_TOLERANCE_SECONDS = 300
export const SIGNATURE_HEADER = "PaySafe-Signature"
export const MAX_HEADER_BYTES = 4096
export const MAX_PAYLOAD_BYTES = 1024 * 1024

export interface VerifyOptions {
  /** Seconds the delivery timestamp may differ from now (default 300). */
  tolerance?: number
  /** Unix seconds to compare against; defaults to the current time. */
  now?: number
}

type Payload = string | Buffer | Uint8Array

function toBuffer(payload: Payload): Buffer {
  return typeof payload === "string" ? Buffer.from(payload, "utf8") : Buffer.from(payload)
}

/** Builds a `PaySafe-Signature` value. Intended for tests. */
export function sign(secret: string, payload: Payload, timestamp = Math.floor(Date.now() / 1000)): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.`).update(toBuffer(payload)).digest("hex")
  return `t=${timestamp},v1=${digest}`
}

function check(
  secret: string | string[],
  payload: Payload,
  header: string | null | undefined,
  options?: VerifyOptions,
): void {
  if (header === null || header === undefined || header.trim() === "") {
    throw new SignatureVerificationError("missing_header", "PaySafe-Signature header is missing")
  }
  const body = toBuffer(payload)
  if (header.length > MAX_HEADER_BYTES || body.byteLength > MAX_PAYLOAD_BYTES) {
    throw new SignatureVerificationError("malformed_header", "Webhook header or payload is too large")
  }
  let timestamp: string | null = null
  const signatures: string[] = []
  for (const part of header.split(",")) {
    const index = part.indexOf("=")
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key === "t") timestamp = value
    else if (key === "v1") signatures.push(value.toLowerCase())
  }
  if (timestamp === null || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    throw new SignatureVerificationError("malformed_header", "PaySafe-Signature header is malformed")
  }
  const t = Number(timestamp)
  const now = options?.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - t) > (options?.tolerance ?? DEFAULT_TOLERANCE_SECONDS)) {
    throw new SignatureVerificationError(
      "timestamp_outside_tolerance",
      "Webhook timestamp is outside the tolerance window",
    )
  }
  const secrets = Array.isArray(secret) ? secret : [secret]
  for (const candidate of secrets) {
    const expected = Buffer.from(createHmac("sha256", candidate).update(`${t}.`).update(body).digest("hex"), "utf8")
    for (const signature of signatures) {
      const given = Buffer.from(signature, "utf8")
      if (given.byteLength === expected.byteLength && timingSafeEqual(given, expected)) return
    }
  }
  throw new SignatureVerificationError("signature_mismatch", "Webhook signature does not match")
}

/** True when the raw payload was signed by one of the secrets within the tolerance window. Never throws. */
export function verifySignature(
  secret: string | string[],
  payload: Payload,
  header: string | null | undefined,
  options?: VerifyOptions,
): boolean {
  try {
    check(secret, payload, header, options)
    return true
  } catch (error) {
    if (error instanceof SignatureVerificationError) return false
    throw error
  }
}

/** Verifies the delivery and returns the typed event. Throws SignatureVerificationError with a reason. */
export function constructEvent<T = Record<string, unknown>>(
  secret: string | string[],
  payload: Payload,
  header: string | null | undefined,
  options?: VerifyOptions,
): Event<T> {
  check(secret, payload, header, options)
  let decoded: unknown
  try {
    decoded = JSON.parse(toBuffer(payload).toString("utf8")) as unknown
  } catch {
    throw new SignatureVerificationError("invalid_payload", "Webhook payload is not valid JSON")
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw new SignatureVerificationError("invalid_payload", "Webhook payload is not an event object")
  }
  const event = decoded as Partial<Event<T>>
  if (typeof event.id !== "string" || typeof event.type !== "string") {
    throw new SignatureVerificationError("invalid_payload", "Webhook payload is not an event object")
  }
  return event as Event<T>
}

export const webhooks = { verifySignature, constructEvent, sign }
