// Lists recent payment events and shows the delivery attempts for the newest one.
import { PaySafe } from "paysafe-tz"

const client = new PaySafe()
const events = await client.events.list({
  type: "payment.succeeded",
  from: new Date(Date.now() - 24 * 3600 * 1000),
  limit: 10,
})

for (const event of events) console.log(`${event.created_at} ${event.id} ${event.data.object.id ?? ""}`)

const first = events.data[0]
if (first) {
  const detail = await client.events.get(first.id)
  for (const d of detail.deliveries)
    console.log(`  attempt ${d.attempt} ${d.status} HTTP ${d.response_status ?? "-"} ${d.latency_ms ?? "-"}ms`)
}
