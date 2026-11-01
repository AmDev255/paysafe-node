// Creates a TZS 10,000 payment with a persisted idempotency key, then polls until it is terminal.
// Usage: node examples/create-payment.mjs [+255712340000]
// Sandbox suffixes: 0000 succeeds, 1111 is declined, 4444 expires.
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ApiError, PaySafe, PollingTimeoutError, isPaymentSuccessful } from "paysafe-tz"

const phone = process.argv[2] ?? "+255712340000"
const orderId = `order-${randomBytes(4).toString("hex")}`

// Store the key with the order before sending, so a crash and restart reuses it instead of charging twice.
const keyFile = join(tmpdir(), `paysafe-${orderId}.key`)
const idempotencyKey = existsSync(keyFile) ? readFileSync(keyFile, "utf8") : `${orderId}-attempt-1`
writeFileSync(keyFile, idempotencyKey)

const client = new PaySafe()
try {
  const payment = await client.payments.create(
    {
      amount: 10000,
      currency: "TZS",
      customer: { phone, name: "Amina Juma" },
      reference: orderId,
      description: `Order ${orderId}`,
      metadata: { order_id: orderId },
    },
    { idempotencyKey },
  )
  console.log(
    `Created ${payment.id} status=${payment.status} (HTTP ${payment.lastResponse.status}${payment.lastResponse.idempotentReplayed ? ", replayed" : ""})`,
  )

  const final = await client.payments.waitForTerminal(payment.id, { onUpdate: (p) => console.log(`  ${p.status}`) })
  if (isPaymentSuccessful(final)) console.log(`Paid: amount ${final.amount} fee ${final.fee} net ${final.net}`)
  else console.log(`Not paid: ${final.status} ${final.failure?.code ?? ""}`)
} catch (error) {
  if (error instanceof PollingTimeoutError)
    console.log(`Still ${error.lastSeen?.status} after the timeout; rely on the webhook`)
  else if (error instanceof ApiError) {
    console.error(`API error ${error.code} (${error.status}): ${error.message} [${error.requestId}]`)
    process.exit(1)
  } else throw error
} finally {
  unlinkSync(keyFile)
}
