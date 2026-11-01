import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import { InvalidStateError, NotFoundError, PaySafe, ValidationError } from "../src/index.js"

/** Runs against a real sandbox when PAYSAFE_SECRET_KEY holds a paysafe_test_ key. Never uses a live key. */
const key = process.env["PAYSAFE_SECRET_KEY"]
const enabled = typeof key === "string" && key.startsWith("paysafe_test_")

describe.skipIf(!enabled)("sandbox integration", () => {
  const client = enabled ? new PaySafe() : null!

  it("reads balance and transactions", async () => {
    const balance = await client.balance.get()
    expect(balance.livemode).toBe(false)
    expect(balance.lastResponse.requestId).toBeTruthy()
    const page = await client.balance.transactions({ limit: 5 })
    expect(page.length).toBeLessThanOrEqual(5)
  })

  it("runs the payment lifecycle with sandbox suffixes", async () => {
    const payment = await client.payments.create({
      amount: 10000,
      customer: { phone: "+255712340000" },
      reference: `sdk-node-${randomBytes(4).toString("hex")}`,
    })
    expect(payment.lastResponse.status).toBe(202)
    const final = await client.payments.waitForTerminal(payment.id, { timeoutMs: 60000 })
    expect(final.status).toBe("succeeded")

    const declined = await client.payments.create({ amount: 10000, customer: { phone: "+255712341111" } })
    const failed = await client.payments.waitForTerminal(declined.id, { timeoutMs: 60000 })
    expect(failed.status).toBe("failed")
    expect(failed.failure?.code).toBe("customer_declined")

    expect((await client.payments.list({ limit: 3 })).length).toBeGreaterThan(0)
    expect((await client.payments.get(payment.id)).id).toBe(payment.id)
    await expect(client.payments.cancel(payment.id)).rejects.toBeInstanceOf(InvalidStateError)
  }, 150000)

  it("maps validation and not-found errors", async () => {
    await expect(
      client.request(
        "POST",
        "/v1/payments",
        {},
        { amount: 5 },
        { idempotencyKey: `sdk-node-bad-${randomBytes(4).toString("hex")}` },
      ),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(client.payments.get("pay_00000000000000000000000000")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("round-trips a webhook endpoint", async () => {
    const created = await client.webhookEndpoints.create({
      url: `https://example.com/paysafe/${randomBytes(4).toString("hex")}`,
      events: ["payment.succeeded"],
    })
    expect(created.secret).toMatch(/^paysafe_webhook_/)
    expect((await client.webhookEndpoints.update(created.id, { status: "DISABLED" })).status).toBe("DISABLED")
    expect((await client.webhookEndpoints.list()).map((e) => e.id)).toContain(created.id)
    await client.webhookEndpoints.delete(created.id)
    await expect(client.webhookEndpoints.get(created.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("reads events and customers", async () => {
    for (const event of await client.events.list({ limit: 2 }))
      expect((await client.events.get(event.id)).id).toBe(event.id)
    for (const customer of await client.customers.list({ limit: 2 }))
      expect((await client.customers.get(customer.id)).id).toBe(customer.id)
  })
})
