import { afterEach, describe, expect, it } from "vitest"
import { ConfigurationError, PaySafe, VERSION } from "../src/index.js"
import { FakeFetch, TEST_KEY, client, fixture, successOf, type OperationFixture } from "./support.js"

const balance = successOf(fixture<OperationFixture>("getBalance"))

describe("PaySafe client", () => {
  afterEach(() => {
    delete process.env["PAYSAFE_SECRET_KEY"]
    delete process.env["PAYSAFE_BASE_URL"]
  })

  it("derives the environment from the key prefix", () => {
    const http = new FakeFetch()
    expect(new PaySafe({ apiKey: TEST_KEY, fetch: http.fetch }).environment).toBe("test")
    expect(
      new PaySafe({ apiKey: "paysafe_live_9f2Kx7Qm3Rt8Vw2Yz5Ab1Cd4Ef6Gh9Jk", fetch: http.fetch }).environment,
    ).toBe("live")
    expect(() => new PaySafe({ apiKey: "sk_test_abc", fetch: http.fetch })).toThrow(ConfigurationError)
  })

  it("requires a key", () => {
    expect(() => new PaySafe({ fetch: new FakeFetch().fetch })).toThrow(ConfigurationError)
  })

  it("reads the key and base URL from the environment", async () => {
    process.env["PAYSAFE_SECRET_KEY"] = TEST_KEY
    process.env["PAYSAFE_BASE_URL"] = "http://127.0.0.1:8088/v1"
    const http = new FakeFetch().json(200, balance.body)
    const c = new PaySafe({ fetch: http.fetch })
    await c.balance.get()
    expect(http.last.url).toBe("http://127.0.0.1:8088/v1/balance")
  })

  it("sends the standard headers and never follows redirects", async () => {
    const { client: c, http } = client()
    http.json(200, balance.body)
    await c.balance.get()
    expect(http.lastHeader("Authorization")).toBe(`Bearer ${TEST_KEY}`)
    expect(http.lastHeader("Accept")).toBe("application/json")
    expect(http.lastHeader("User-Agent")).toMatch(new RegExp(`^paysafe-node/${VERSION}`))
    expect(http.lastHeader("Content-Type")).toBeNull()
    expect(http.last.init.redirect).toBe("manual")
  })

  it("sends PaySafe-Version when configured", async () => {
    const http = new FakeFetch().json(200, balance.body)
    const c = new PaySafe({ apiKey: TEST_KEY, apiVersion: "2026-09-07", fetch: http.fetch })
    await c.balance.get()
    expect(http.lastHeader("PaySafe-Version")).toBe("2026-09-07")
  })

  it("exposes response metadata on models", async () => {
    const { client: c, http } = client()
    http.json(200, balance.body, {
      "x-ratelimit-limit": "50",
      "x-ratelimit-remaining": "49",
      "x-ratelimit-reset": "1788775205",
    })
    const result = await c.balance.get()
    expect(result.lastResponse.status).toBe(200)
    expect(result.lastResponse.requestId).toBe("req_01J7A9Q0K3M4N5P6R7S8T9V0W1")
    expect(result.lastResponse.rateLimit).toEqual({ limit: 50, remaining: 49, reset: 1788775205 })
    expect(result.lastResponse.idempotentReplayed).toBe(false)
    expect(JSON.stringify(result)).not.toContain("lastResponse")
    expect(JSON.parse(JSON.stringify(result))).toEqual(balance.body)
  })

  it("offers a low-level request escape hatch", async () => {
    const { client: c, http } = client()
    http.json(200, balance.body)
    const response = await c.request("get", "v1/balance")
    expect(response.status).toBe(200)
    expect(http.last.url).toBe("https://api.test.invalid/v1/balance")
  })

  it("logs one record per attempt without secrets", async () => {
    const records: unknown[] = []
    const http = new FakeFetch().json(200, balance.body)
    const c = new PaySafe({ apiKey: TEST_KEY, fetch: http.fetch, logger: (r) => records.push(r) })
    await c.balance.get()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ method: "GET", path: "/v1/balance", status: 200, attempt: 1 })
    expect(JSON.stringify(records)).not.toContain(TEST_KEY)
  })
})
