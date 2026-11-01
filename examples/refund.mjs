// Refunds part of a succeeded payment and waits for the result.
// Usage: node examples/refund.mjs pay_... [amount]
import { InsufficientFundsError, InvalidStateError, PaySafe } from "paysafe-tz"

const paymentId = process.argv[2]
if (!paymentId) {
  console.error("usage: node examples/refund.mjs <payment id> [amount]")
  process.exit(2)
}
const amount = process.argv[3] ? Number(process.argv[3]) : undefined

const client = new PaySafe()
try {
  const refund = await client.refunds.create(
    { payment: paymentId, reason: "requested_by_customer", ...(amount !== undefined ? { amount } : {}) },
    { idempotencyKey: `refund-${paymentId}-1` },
  )
  console.log(`Refund ${refund.id} ${refund.status}`)
  const final = await client.refunds.waitForTerminal(refund.id)
  console.log(`Final: ${final.status} ${final.failure_reason ?? ""}`)
} catch (error) {
  if (error instanceof InsufficientFundsError)
    console.log(`Not enough available balance: have ${error.available}, need ${error.requested}`)
  else if (error instanceof InvalidStateError) console.log(`Cannot refund: ${error.message}`)
  else throw error
}
