// Reads the balance, the latest ledger entries and recent customers.
import { PaySafe, balanceAmount } from "paysafe-tz"

const client = new PaySafe()
const balance = await client.balance.get()
console.log(`Available TZS ${balanceAmount(balance.available)}, pending TZS ${balanceAmount(balance.pending)}`)

for (const tx of await client.balance.transactions({ limit: 5 })) {
  console.log(
    `${tx.created_at} ${tx.direction.padEnd(6)} ${tx.bucket.padEnd(9)} ${String(tx.amount).padStart(8)} → ${tx.balance_after}`,
  )
}

for (const customer of await client.customers.list({ limit: 5 })) {
  console.log(
    `${customer.id} ${customer.phone} paid ${customer.payment_count ?? 0} times, TZS ${customer.total_paid ?? 0}`,
  )
}
