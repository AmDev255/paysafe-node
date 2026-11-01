// Creates a hosted payment link, lists links, then pauses and archives the new one.
import { PaySafe } from "paysafe-tz"

const client = new PaySafe()

const link = await client.paymentLinks.create({
  title: "Workshop ticket",
  description: "One seat, Saturday session",
  amount: 25000,
  collect_name: true,
  collect_email: true,
  max_payments: 50,
  expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000),
})
console.log(`Share this: ${link.url} (${link.id})`)

for (const item of await client.paymentLinks.list({ status: "active", limit: 10 })) {
  console.log(`${item.id} ${item.title} paid ${item.paid_count}/${item.max_payments ?? "∞"}`)
}

const paused = await client.paymentLinks.pause(link.id)
console.log(`Paused: ${paused.status} state=${paused.state}`)
const archived = await client.paymentLinks.archive(link.id)
console.log(`Archived: ${archived.status}`)
