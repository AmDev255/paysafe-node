import { describe, expect, it } from "vitest"
import { PollingTimeoutError, type Payment } from "../src/index.js"
import { client, fixture, successOf, type OperationFixture } from "./support.js"

const payment = successOf(fixture<OperationFixture>("getPayment")).body as unknown as Payment
const refund = successOf(fixture<OperationFixture>("getRefund")).body!
const transfer = successOf(fixture<OperationFixture>("getTransfer")).body!

describe("pagination", () => {
  it("auto-pages with the same filters", async () => {
    const { client: c, http } = client()
    http.json(200, {
      object: "list",
      data: [
        { ...payment, id: "pay_1" },
        { ...payment, id: "pay_2" },
      ],
      has_more: true,
      next_cursor: "c2",
    })
    http.json(200, { object: "list", data: [{ ...payment, id: "pay_3" }], has_more: false, next_cursor: null })
    const page = await c.payments.list({ status: "succeeded", limit: 2 })
    expect(page.length).toBe(2)
    expect(page.hasMore).toBe(true)
    const ids: string[] = []
    for await (const p of page) ids.push(p.id)
    expect(ids).toEqual(["pay_1", "pay_2", "pay_3"])
    expect(http.requests).toHaveLength(2)
    expect(http.requests[1]!.url).toBe("https://api.test.invalid/v1/payments?status=succeeded&limit=2&cursor=c2")
    expect([...page].map((p) => p.id)).toEqual(["pay_1", "pay_2"])
  })

  it("stops on the last page", async () => {
    const { client: c, http } = client()
    http.json(200, { object: "list", data: [], has_more: false, next_cursor: null })
    const page = await c.customers.list()
    expect(await page.nextPage()).toBeNull()
    expect(page.toJSON()).toEqual({ object: "list", data: [], has_more: false, next_cursor: null })
  })
})

describe("polling", () => {
  it("waits for a terminal state and reports updates", async () => {
    const { client: c, http, sleeps } = client()
    for (const status of ["pending", "processing", "processing", "succeeded"]) http.json(200, { ...payment, status })
    const seen: string[] = []
    const final = await c.payments.waitForTerminal("pay_01J7A9Q0K3M4N5P6R7S8T9V0W1", {
      onUpdate: (p) => seen.push(p.status),
    })
    expect(final.status).toBe("succeeded")
    expect(seen).toEqual(["pending", "processing", "succeeded"])
    expect(sleeps.sleeps).toEqual([2000, 2000, 2000])
  })

  it("times out with the last object", async () => {
    const { client: c, http } = client()
    for (let i = 0; i < 4; i++) http.json(200, { ...payment, status: "processing" })
    const error = await c.payments
      .waitForTerminal("pay_01J7A9Q0K3M4N5P6R7S8T9V0W1", { intervalMs: 2000, timeoutMs: 6000 })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PollingTimeoutError)
    expect((error as PollingTimeoutError).lastSeen).toMatchObject({ status: "processing" })
    expect(http.requests).toHaveLength(4)
  })

  it("can be cancelled with an AbortSignal", async () => {
    const { client: c, http } = client()
    http.json(200, { ...refund, status: "pending" })
    const controller = new AbortController()
    controller.abort()
    await expect(
      c.refunds.waitForTerminal("rfd_01J7A9Q0K3M4N5P6R7S8T9V0W1", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(PollingTimeoutError)
  })

  it("slows down after thirty seconds", async () => {
    const { client: c, http, sleeps } = client()
    for (let i = 0; i < 20; i++) http.json(200, { ...transfer, status: "in_review" })
    http.json(200, { ...transfer, status: "completed" })
    await c.transfers.waitForTerminal("trf_01J7A9Q0K3M4N5P6R7S8T9V0W1")
    expect(sleeps.sleeps[0]).toBe(2000)
    expect(sleeps.sleeps.at(-1)).toBe(5000)
  })
})
