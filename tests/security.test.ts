import { describe, expect, it } from "vitest"
import {
  ApiConnectionError,
  ApiError,
  ConfigurationError,
  InvalidRequestError,
  PaySafe,
  verifySignature,
} from "../src/index.js"
import { FakeFetch, TEST_KEY, client, fixture, successOf, type OperationFixture } from "./support.js"

const payment = successOf(fixture<OperationFixture>("getPayment")).body
const list = successOf(fixture<OperationFixture>("listPayments")).body
const vector = fixture<{ secret: string; body: string; header: string; nowValid: number }>("webhook-vector")

describe("security", () => {
  it.each([
    ["../balance"],
    ["pay_1/cancel"],
    ["pay_1?limit=1"],
    ["pay_1#x"],
    ["pay%2F1"],
    ["pay 1"],
    ["pay_1\n"],
    [""],
    ["a".repeat(65)],
  ])("rejects id %j before any request", async (id) => {
    const { client: c, http } = client()
    await expect(c.payments.get(id)).rejects.toBeInstanceOf(InvalidRequestError)
    expect(http.requests).toHaveLength(0)
  })

  it("encodes ids in the path and values in the query", async () => {
    const { client: c, http } = client()
    http.json(200, payment)
    await c.payments.get("pay_01J7A9Q0K3M4N5P6R7S8T9V0W1")
    expect(http.last.url).toBe("https://api.test.invalid/v1/payments/pay_01J7A9Q0K3M4N5P6R7S8T9V0W1")
    http.json(200, list)
    await c.payments.list({ reference: "order&x=1 #2", limit: 5 })
    expect(http.last.url).toBe("https://api.test.invalid/v1/payments?reference=order%26x%3D1%20%232&limit=5")
  })

  it.each([["abc\r\nX-Injected: 1"], ["abc\nX-Injected: 1"], ["abc\0"]])(
    "rejects header injection %j",
    async (value) => {
      const { client: c } = client()
      await expect(c.balance.get({ headers: { "X-Custom": value } })).rejects.toBeInstanceOf(InvalidRequestError)
    },
  )

  it("rejects bad idempotency keys, request ids and protected headers", async () => {
    const { client: c } = client()
    await expect(c.balance.get({ idempotencyKey: "key\r\nX: 1" })).rejects.toBeInstanceOf(InvalidRequestError)
    await expect(c.balance.get({ requestId: "bad id" })).rejects.toBeInstanceOf(InvalidRequestError)
    await expect(c.balance.get({ headers: { authorization: "Bearer other" } })).rejects.toBeInstanceOf(
      InvalidRequestError,
    )
  })

  it.each([
    ["http://api.paysafe.co.tz"],
    ["https://user:pass@api.paysafe.co.tz"],
    ["https://api.paysafe.co.tz/?x=1"],
    ["https://api.paysafe.co.tz/#x"],
    ["api.paysafe.co.tz"],
    ["https://api.paysafe.co.tz\n"],
    ["ftp://api.paysafe.co.tz"],
  ])("rejects unsafe base URL %j", (baseUrl) => {
    expect(() => new PaySafe({ apiKey: TEST_KEY, baseUrl, fetch: new FakeFetch().fetch })).toThrow(ConfigurationError)
  })

  it("allows plain http for loopback or with explicit opt-in", () => {
    expect(
      new PaySafe({ apiKey: TEST_KEY, baseUrl: "http://localhost:8088", fetch: new FakeFetch().fetch }).environment,
    ).toBe("test")
    expect(
      new PaySafe({
        apiKey: TEST_KEY,
        baseUrl: "http://api.internal",
        allowInsecureHttp: true,
        fetch: new FakeFetch().fetch,
      }).environment,
    ).toBe("test")
    expect(() => new PaySafe({ apiKey: `${TEST_KEY}\n`, fetch: new FakeFetch().fetch })).toThrow(ConfigurationError)
  })

  it("surfaces redirects as errors instead of following them", async () => {
    const { client: c, http } = client()
    http.push(new Response(null, { status: 302, headers: { location: "https://evil.invalid/steal" } }))
    const error = await c.balance.get().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe("unexpected_redirect")
    expect(http.requests).toHaveLength(1)
  })

  it("rejects oversized bodies and metadata before sending", async () => {
    const { client: c, http } = client()
    const base = { amount: 10000, customer: { phone: "+255712340000" } }
    await expect(c.payments.create({ ...base, metadata: { big: "b".repeat(70000) } })).rejects.toBeInstanceOf(
      InvalidRequestError,
    )
    await expect(c.payments.create({ ...base, metadata: { x: "y".repeat(9000) } })).rejects.toBeInstanceOf(
      InvalidRequestError,
    )
    expect(http.requests).toHaveLength(0)
  })

  it("validates amounts, phones and enums", async () => {
    const { client: c } = client()
    for (const bad of ["10000", 10000.5, true, null, undefined]) {
      const error = await c.payments
        .create({ amount: bad as number, customer: { phone: "+255712340000" } })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(InvalidRequestError)
      expect((error as InvalidRequestError).param).toBe("amount")
    }
    for (const bad of ["0712340000", "+25571234000", "+255 712 340 000", "+1255712340000", "+255712340000\n"]) {
      const error = await c.payments.create({ amount: 10000, customer: { phone: bad } }).catch((e: unknown) => e)
      expect((error as InvalidRequestError).param).toBe("customer.phone")
    }
    await expect(
      c.payments.create({ amount: 10000, customer: { phone: "+255712340000" }, channel: "paypal" as never }),
    ).rejects.toBeInstanceOf(InvalidRequestError)
    await expect(c.webhookEndpoints.create({ url: "http://merchant.example/hook" })).rejects.toBeInstanceOf(
      InvalidRequestError,
    )
    await expect(c.payments.list({ cursor: "c".repeat(201) })).rejects.toBeInstanceOf(InvalidRequestError)
  })

  it("refuses oversized responses without retrying", async () => {
    const { client: c, http } = client()
    http.push(new Response("x", { status: 200, headers: { "content-length": String(16 * 1024 * 1024 + 1) } }))
    await expect(c.balance.get()).rejects.toBeInstanceOf(ApiConnectionError)
    expect(http.requests).toHaveLength(1)
  })

  it("truncates non-JSON error bodies and keeps the key out of errors", async () => {
    const { client: c, http } = client({ maxRetries: 0 })
    http.push(new Response("<b>".repeat(5000), { status: 400, headers: { "content-type": "text/html" } }))
    const error = (await c.balance.get().catch((e: unknown) => e)) as ApiError
    expect(error.code).toBe("unknown")
    expect((error.details?.["raw"] as string).length).toBeLessThanOrEqual(4096)
    expect(String(error)).not.toContain(TEST_KEY)
    expect(JSON.stringify(error.headers)).not.toContain(TEST_KEY)
  })

  it("bounds webhook input sizes", () => {
    expect(verifySignature(vector.secret, "x".repeat(1048577), vector.header, { now: vector.nowValid })).toBe(false)
    expect(verifySignature(vector.secret, vector.body, "t".repeat(5000), { now: vector.nowValid })).toBe(false)
  })
})
