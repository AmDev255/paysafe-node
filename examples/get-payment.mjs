// Retrieves a payment by id and waits for a terminal state.
// Usage: node examples/get-payment.mjs pay_01J7A9Q0K3M4N5P6R7S8T9V0W1
import { NotFoundError, PaySafe, isPaymentTerminal } from "paysafe-tz"

const id = process.argv[2]
if (!id) {
  console.error("usage: node examples/get-payment.mjs <payment id>")
  process.exit(2)
}

const client = new PaySafe()
try {
  let payment = await client.payments.get(id)
  console.log(`${payment.id} ${payment.status} TZS ${payment.amount} for ${payment.customer.phone}`)
  if (!isPaymentTerminal(payment)) {
    payment = await client.payments.waitForTerminal(payment.id)
    console.log(`Final status: ${payment.status}`)
  }
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error("No such payment in this project and environment")
    process.exit(1)
  }
  throw error
}
