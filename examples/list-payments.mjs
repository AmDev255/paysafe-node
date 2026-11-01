// Lists succeeded payments from the last 7 days, walking every page with the async iterator.
import { PaySafe } from "paysafe-tz"

const client = new PaySafe()
const page = await client.payments.list({
  status: "succeeded",
  created_gte: new Date(Date.now() - 7 * 24 * 3600 * 1000),
  limit: 50,
})

let total = 0
for await (const payment of page) {
  console.log(`${payment.created_at} ${payment.id} TZS ${payment.amount} ${payment.reference ?? ""}`)
  total += payment.amount
}
console.log(`Total: TZS ${total}`)
