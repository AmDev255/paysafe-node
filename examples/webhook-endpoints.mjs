// Registers a webhook endpoint, stores its secret, disables it and deletes it again.
// Usage: node examples/webhook-endpoints.mjs https://your-server.example/paysafe/webhook
import { PaySafe } from "paysafe-tz"

const url = process.argv[2]
if (!url) {
  console.error("usage: node examples/webhook-endpoints.mjs <https url>")
  process.exit(2)
}

const client = new PaySafe()
const endpoint = await client.webhookEndpoints.create({
  url,
  description: "Order fulfilment",
  events: ["payment.succeeded", "payment.failed", "refund.succeeded"],
})
// The secret is returned once. Put it in your secret store as PAYSAFE_WEBHOOK_SECRET.
console.log(`Endpoint ${endpoint.id} created; secret starts with ${endpoint.secret.slice(0, 20)}…`)

for (const item of await client.webhookEndpoints.list()) {
  console.log(`${item.id} ${item.status} ${item.url} streak=${item.failure_streak}`)
}

const disabled = await client.webhookEndpoints.update(endpoint.id, { status: "DISABLED" })
console.log(`Now ${disabled.status}`)
await client.webhookEndpoints.delete(endpoint.id)
console.log("Deleted")
