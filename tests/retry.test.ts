import { describe, expect, it } from "vitest"
import type { PaySafeError } from "../src/index.js"
import {
  ApiConnectionError,
  ApiError,
  ApiTimeoutError,
  IdempotencyConflictError,
  InternalError,
  PaySafe,
  ProviderError,
  ValidationError,
} from "../src/index.js"
import { TEST_KEY, client, fixture, successOf, type OperationFixture } from "./support.js"

const ERRORS: Record<string, new (...args: never[]) => PaySafeError> = {
  ApiError,
  ApiConnectionError,
  IdempotencyConflictError,
  ValidationError,
  InternalError,
  ProviderError,
}

interface Step {
  status?: number
  code?: string
  headers?: Record<string, string>
  networkError?: boolean
  timeout?: boolean
  rawBody?: string
}
interface Scenario {
  name: string
  request: string
  sequence: Step[]
  expect: {
    attempts: number
    result?: string
    error?: string
    code?: string
    sameIdempotencyKey?: boolean
    sleptAtLeastMs?: number
    idempotentReplayed?: boolean
  }
}

const scenarios = fixture<{ scenarios: Scenario[] }>("retry-scenarios").scenarios

function call(c: PaySafe, operationId: string, f: OperationFixture): Promise<unknown> {
  switch (operationId) {
    case "getBalance":
      return c.balance.get()
    case "getPayment":
      return c.payments.get("pay_01J7A9Q0K3M4N5P6R7S8T9V0W1")
    case "listPayments":
      return c.payments.list()
    case "createPayment":
      return c.payments.create(f.minimalBody as never)
    case "createRefund":
      return c.refunds.create(f.minimalBody as never)
    case "createWebhookEndpoint":
      return c.webhookEndpoints.create(f.minimalBody as never)
    default:
      throw new Error(`unsupported operation ${operationId}`)
  }
}

describe("retry scenarios", () => {
  it.each(scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const f = fixture<OperationFixture>(scenario.request)
    const success = successOf(f)
    const { client: c, http, sleeps } = client()
    for (const step of scenario.sequence) {
      if (step.networkError) http.push(new TypeError("fetch failed"))
      else if (step.timeout) http.hang()
      else if (step.rawBody !== undefined)
        http.push(new Response(step.rawBody, { status: step.status!, headers: { "content-type": "text/html" } }))
      else if (step.status! < 300) http.json(step.status!, success.body, { ...success.headers, ...step.headers })
      else
        http.json(
          step.status!,
          {
            error: { code: step.code ?? "internal_error", message: step.code ?? "internal_error", request_id: "req_x" },
          },
          step.headers,
        )
    }
    const timeoutClient = scenario.sequence.some((s) => s.timeout)
      ? new PaySafe({
          apiKey: TEST_KEY,
          baseUrl: "https://api.test.invalid",
          fetch: http.fetch,
          sleep: sleeps.sleep,
          random: () => 0.5,
          timeoutMs: 5,
        })
      : c

    const outcome = await call(timeoutClient, scenario.request, f).then(
      (value) => ({ value, error: null as unknown }),
      (error: unknown) => ({ value: null, error }),
    )
    if (scenario.expect.error) {
      expect(outcome.error, `expected ${scenario.expect.error}`).toBeInstanceOf(ERRORS[scenario.expect.error])
      if (scenario.expect.code) expect((outcome.error as ApiError).code).toBe(scenario.expect.code)
    } else {
      expect(outcome.error, String(outcome.error)).toBeNull()
    }
    expect(http.requests, "attempt count").toHaveLength(scenario.expect.attempts)
    expect(http.pending, "every queued response consumed").toBe(0)
    if (scenario.expect.sameIdempotencyKey) {
      const keys = new Set(http.requests.map((r) => (r.init.headers as Record<string, string>)["Idempotency-Key"]))
      expect(keys.size).toBe(1)
      expect([...keys][0]).toBeTruthy()
    }
    if (scenario.expect.sleptAtLeastMs !== undefined)
      expect(sleeps.total).toBeGreaterThanOrEqual(scenario.expect.sleptAtLeastMs)
    if (scenario.expect.idempotentReplayed !== undefined) {
      expect((outcome.value as { lastResponse: { idempotentReplayed: boolean } }).lastResponse.idempotentReplayed).toBe(
        scenario.expect.idempotentReplayed,
      )
    }
  })

  it("distinguishes timeouts from other connection errors", async () => {
    const http = new (await import("./support.js")).FakeFetch()
    http.hang()
    const c = new PaySafe({
      apiKey: TEST_KEY,
      baseUrl: "https://api.test.invalid",
      fetch: http.fetch,
      maxRetries: 0,
      timeoutMs: 5,
    })
    await expect(c.balance.get()).rejects.toBeInstanceOf(ApiTimeoutError)
  })

  it("honours per-request maxRetries and reuses a generated key", async () => {
    const { client: c, http } = client()
    http.json(503, { error: { code: "service_unavailable", message: "x", request_id: "r" } })
    await expect(
      c.payments.create(
        { amount: 10000, customer: { phone: "+255712340000" } },
        { idempotencyKey: "k-1", maxRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(ApiError)
    expect(http.requests).toHaveLength(1)

    const success = successOf(fixture<OperationFixture>("createPayment"))
    http.json(500, { error: { code: "internal_error", message: "x", request_id: "r" } })
    http.json(202, success.body, success.headers)
    const payment = await c.payments.create({ amount: 10000, customer: { phone: "+255712340000" } })
    const key = payment.lastResponse.idempotencyKey
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    expect((http.requests[1]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe(key)
    expect((http.requests[2]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe(key)
  })
})
