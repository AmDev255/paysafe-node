// Minimal webhook receiver on node:http. Verifies the signature before anything else.
// Run:  PAYSAFE_WEBHOOK_SECRET=paysafe_webhook_... node examples/verify-webhook.mjs
// Self-test without a secret: node examples/verify-webhook.mjs
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import { SignatureVerificationError, constructEvent } from "paysafe-tz"

const secret = process.env.PAYSAFE_WEBHOOK_SECRET
if (!secret) {
  const vector = JSON.parse(readFileSync(new URL("../tests/fixtures/webhook-vector.json", import.meta.url), "utf8"))
  const event = constructEvent(vector.secret, vector.body, vector.header, { now: vector.nowValid })
  console.log(`Self-test ok: ${event.type} ${event.data.object.id}`)
  process.exit(0)
}

const seen = new Set()

createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end()
    return
  }
  const chunks = []
  req.on("data", (chunk) => chunks.push(chunk))
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks)
    let event
    try {
      event = constructEvent(secret, rawBody, req.headers["paysafe-signature"])
    } catch (error) {
      if (error instanceof SignatureVerificationError) {
        res.writeHead(400).end(`invalid signature: ${error.reason}`)
        return
      }
      throw error
    }
    if (seen.has(event.id)) {
      res.writeHead(200).end("duplicate")
      return
    }
    seen.add(event.id)
    switch (event.type) {
      case "payment.succeeded":
        console.log(`paid ${event.data.object.id} ${event.data.object.amount}`)
        break
      case "payment.failed":
      case "payment.expired":
        console.log(`not paid: ${event.type}`)
        break
      default:
        console.log(`ignored ${event.type}`)
    }
    res.writeHead(200).end("ok")
  })
}).listen(8080, () => console.log("Listening on http://localhost:8080"))
