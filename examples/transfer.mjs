// Sends TZS 5,000 to another PaySafe project by handle and lists recent transfers.
// Usage: node examples/transfer.mjs <recipient handle>
import { InsufficientFundsError, PaySafe, isTransferTerminal } from "paysafe-tz"

const to = process.argv[2]
if (!to) {
  console.error("usage: node examples/transfer.mjs <recipient handle>")
  process.exit(2)
}

const client = new PaySafe()
try {
  let transfer = await client.transfers.create(
    { to, amount: 5000, note: "Shared delivery cost" },
    { idempotencyKey: `transfer-${to}-${new Date().toISOString().slice(0, 10)}` },
  )
  console.log(`Transfer ${transfer.id} ${transfer.status} to ${transfer.to.name} (${transfer.to.organization})`)
  if (!isTransferTerminal(transfer)) {
    transfer = await client.transfers.waitForTerminal(transfer.id)
    console.log(`Review finished: ${transfer.status}`)
  }
} catch (error) {
  if (error instanceof InsufficientFundsError) console.log(`Not enough available balance (have ${error.available})`)
  else throw error
}

for (const item of await client.transfers.list({ limit: 5 })) {
  console.log(`${item.created_at} ${item.direction} ${item.amount} ${item.status}`)
}
