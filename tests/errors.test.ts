import { describe, expect, it } from "vitest"
import {
  ApiError,
  AuthenticationError,
  ConflictError,
  FeatureDisabledError,
  IdempotencyConflictError,
  IdempotencyInProgressError,
  InsufficientFundsError,
  InternalError,
  InvalidStateError,
  NotFoundError,
  PermissionError,
  ProviderError,
  ProviderUnavailableError,
  RateLimitError,
  ServiceUnavailableError,
  ValidationError,
} from "../src/index.js"
import { errorFromResponse } from "../src/http/transport.js"
import { buildApiResponse, retryAfterFromHeaders } from "../src/http/response.js"

const cases: Array<[number, string, new (...args: never[]) => ApiError, boolean]> = [
  [400, "validation_error", ValidationError, false],
  [401, "authentication_error", AuthenticationError, false],
  [403, "permission_error", PermissionError, false],
  [403, "feature_disabled", FeatureDisabledError, false],
  [404, "not_found", NotFoundError, false],
  [402, "insufficient_funds", InsufficientFundsError, false],
  [409, "conflict", ConflictError, false],
  [409, "idempotency_conflict", IdempotencyConflictError, false],
  [409, "idempotency_in_progress", IdempotencyInProgressError, true],
  [409, "invalid_state", InvalidStateError, false],
  [429, "rate_limited", RateLimitError, true],
  [502, "provider_error", ProviderError, false],
  [503, "provider_unavailable", ProviderUnavailableError, true],
  [503, "service_unavailable", ServiceUnavailableError, true],
  [500, "internal_error", InternalError, true],
]

describe("error mapping", () => {
  it.each(cases)("%d %s maps to its class", (status, code, Ctor, retryable) => {
    const body = {
      error: {
        code,
        message: "m",
        request_id: "req_1",
        param: "amount",
        details: { scope: "api:key" },
        doc_url: `https://paysafe.co.tz/docs/errors#${code}`,
      },
    }
    const response = buildApiResponse(
      status,
      { "x-request-id": "req_1", "retry-after": "3" },
      JSON.stringify(body),
      null,
    )
    const error = errorFromResponse(response)
    expect(error).toBeInstanceOf(Ctor)
    expect(error).toMatchObject({
      status,
      code,
      requestId: "req_1",
      param: "amount",
      details: { scope: "api:key" },
      retryAfter: 3,
    })
    expect(error.isRetryable).toBe(retryable)
    expect(String(error)).toContain(code)
  })

  it("falls back to the status for unknown codes", () => {
    const a = errorFromResponse(
      buildApiResponse(404, {}, JSON.stringify({ error: { code: "brand_new", message: "x", request_id: "r" } }), null),
    )
    expect(a).toBeInstanceOf(NotFoundError)
    expect(a.code).toBe("brand_new")
    const b = errorFromResponse(
      buildApiResponse(418, {}, JSON.stringify({ error: { code: "teapot", message: "x", request_id: "r" } }), null),
    )
    expect(b.constructor).toBe(ApiError)
    const c = errorFromResponse(buildApiResponse(500, { "x-request-id": "req_h" }, "oops", null))
    expect(c).toBeInstanceOf(InternalError)
    expect(c.requestId).toBe("req_h")
    expect(c.code).toBe("unknown")
  })

  it("parses Retry-After as seconds or an HTTP date", () => {
    expect(retryAfterFromHeaders({ "retry-after": "7" })).toBe(7)
    const now = Date.now()
    expect(retryAfterFromHeaders({ "retry-after": new Date(now + 120000).toUTCString() }, now)).toBe(120)
    expect(retryAfterFromHeaders({})).toBeNull()
  })

  it("exposes helpers on specific errors", () => {
    const p = errorFromResponse(
      buildApiResponse(
        403,
        {},
        JSON.stringify({
          error: {
            code: "permission_error",
            message: "x",
            request_id: "r",
            details: { code: "ip_not_allowed", ip: "2a02::1" },
          },
        }),
        null,
      ),
    ) as PermissionError
    expect(p.isIpNotAllowed).toBe(true)
    expect(p.observedIp).toBe("2a02::1")
    const f = errorFromResponse(
      buildApiResponse(
        402,
        {},
        JSON.stringify({
          error: {
            code: "insufficient_funds",
            message: "x",
            request_id: "r",
            details: { available: 10, requested: 20 },
          },
        }),
        null,
      ),
    ) as InsufficientFundsError
    expect(f.available).toBe(10)
    expect(f.requested).toBe(20)
  })
})
