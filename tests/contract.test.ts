import { describe, expect, it } from "vitest"
import { ApiError, Page, type PaySafe } from "../src/index.js"
import { client, fixture, successOf, type OperationFixture } from "./support.js"

const ID = "pay_01J7A9Q0K3M4N5P6R7S8T9V0W1"
const KEY = "order-8812-attempt-1"
const opts = { idempotencyKey: KEY }

type Call = (c: PaySafe, f: OperationFixture) => Promise<unknown>
const calls: Record<string, Call> = {
  createPayment: (c, f) => c.payments.create(f.body as never, opts),
  listPayments: (c, f) => c.payments.list(f.query),
  getPayment: (c) => c.payments.get(ID),
  cancelPayment: (c, f) => c.payments.cancel(ID, f.body as never, opts),
  createPaymentLink: (c, f) => c.paymentLinks.create(f.body as never),
  listPaymentLinks: (c, f) => c.paymentLinks.list(f.query),
  getPaymentLink: (c) => c.paymentLinks.get(ID),
  updatePaymentLink: (c, f) => c.paymentLinks.update(ID, f.body as never),
  createControlNumber: (c, f) => c.controlNumbers.create(f.body as never),
  listControlNumbers: (c, f) => c.controlNumbers.list(f.query),
  getControlNumber: (c) => c.controlNumbers.get(ID),
  cancelControlNumber: (c, f) => c.controlNumbers.cancel(ID, f.body!["reason"] as string),
  createRefund: (c, f) => c.refunds.create(f.body as never, opts),
  listRefunds: (c, f) => c.refunds.list(f.query),
  getRefund: (c) => c.refunds.get(ID),
  getBalance: (c) => c.balance.get(),
  listTransactions: (c, f) => c.balance.transactions(f.query),
  listCustomers: (c, f) => c.customers.list(f.query),
  getCustomer: (c) => c.customers.get(ID),
  createTransfer: (c, f) => c.transfers.create(f.body as never, opts),
  listTransfers: (c, f) => c.transfers.list(f.query),
  getTransfer: (c) => c.transfers.get(ID),
  listWebhookEndpoints: (c) => c.webhookEndpoints.list(),
  createWebhookEndpoint: (c, f) => c.webhookEndpoints.create(f.body as never),
  getWebhookEndpoint: (c) => c.webhookEndpoints.get(ID),
  updateWebhookEndpoint: (c, f) => c.webhookEndpoints.update(ID, f.body as never),
  deleteWebhookEndpoint: (c) => c.webhookEndpoints.delete(ID),
  listEvents: (c, f) => c.events.list(f.query),
  getEvent: (c) => c.events.get(ID),
}

const index = fixture<{ operations: Array<{ operationId: string }> }>("index")
const operations = index.operations.map((o) => o.operationId)

describe("contract", () => {
  it("covers every operation in the contract", () => {
    expect(Object.keys(calls).sort()).toEqual([...operations].sort())
  })

  it.each(operations)("%s builds the documented request and parses the success response", async (operationId) => {
    const f = fixture<OperationFixture>(operationId)
    const success = successOf(f)
    const { client: c, http } = client()
    http.json(success.code, success.body, success.headers)
    const result = await calls[operationId]!(c, f)
    const request = http.last
    const url = new URL(request.url)

    expect(request.init.method).toBe(f.method)
    expect(url.pathname).toBe(f.resolvedPath)
    const expectedQuery = Object.fromEntries(
      Object.entries(f.query)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, String(v)]),
    )
    expect(Object.fromEntries(url.searchParams)).toEqual(expectedQuery)
    expect(http.lastHeader("Authorization")).toBe(`Bearer ${f.headers["Authorization"]!.replace("Bearer ", "")}`)
    if (f.headers["Idempotency-Key"]) expect(http.lastHeader("Idempotency-Key")).toBe(KEY)
    else expect(http.lastHeader("Idempotency-Key")).toBeNull()
    if (f.body !== null) {
      expect(http.lastHeader("Content-Type")).toBe("application/json")
      expect(http.lastBody()).toEqual(f.body)
    } else {
      expect(request.init.body).toBeUndefined()
    }

    if (success.body === null) {
      expect(result).toBeUndefined()
    } else if (success.body["object"] === "list" && operationId !== "listWebhookEndpoints") {
      expect(result).toBeInstanceOf(Page)
      const page = result as Page<Record<string, unknown>>
      expect(page.length).toBe((success.body["data"] as unknown[]).length)
      expect(page.hasMore).toBe(success.body["has_more"])
      expect(page.nextCursor).toBe(success.body["next_cursor"])
    } else if (operationId === "listWebhookEndpoints") {
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual(success.body["data"])
    } else {
      expect(JSON.parse(JSON.stringify(result))).toEqual(success.body)
      expect((result as { lastResponse: { requestId: string } }).lastResponse.requestId).toBe(
        "req_01J7A9Q0K3M4N5P6R7S8T9V0W1",
      )
    }
  })

  it.each(operations)("%s raises the mapped error for every documented error response", async (operationId) => {
    const f = fixture<OperationFixture>(operationId)
    for (const [code, response] of Object.entries(f.responses)) {
      if (code.startsWith("2")) continue
      const { client: c, http } = client({ maxRetries: 0 })
      http.json(parseInt(code, 10), response.body, response.headers)
      const error = (await calls[operationId]!(c, f).then(
        () => null,
        (e: unknown) => e,
      )) as ApiError | null
      expect(error, `${operationId} ${code}`).toBeInstanceOf(ApiError)
      expect(error!.status).toBe(parseInt(code, 10))
      expect(error!.code).toBe(response.code)
      expect(error!.requestId).toBe((response.body!["error"] as { request_id: string }).request_id)
      if (response.headers["Retry-After"]) expect(error!.retryAfter).toBe(Number(response.headers["Retry-After"]))
    }
  })
})
