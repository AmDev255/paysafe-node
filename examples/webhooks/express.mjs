// Express handler for PaySafe webhooks. Mount it BEFORE any JSON body parser, with express.raw,
// so the signature is computed over the exact bytes PaySafe sent.
import express from "express"
import { SignatureVerificationError, constructEvent } from "paysafe-tz"

const app = express()
const secret = process.env.PAYSAFE_WEBHOOK_SECRET

app.post("/paysafe/webhook", express.raw({ type: "application/json", limit: "1mb" }), (req, res) => {
  let event
  try {
    event = constructEvent(secret, req.body, req.get("PaySafe-Signature"))
  } catch (error) {
    if (error instanceof SignatureVerificationError) return res.status(400).send("invalid signature")
    throw error
  }
  // Persist event.id first and skip duplicates; deliveries can repeat and arrive out of order.
  if (event.type === "payment.succeeded") {
    // Mark the order identified by event.data.object.reference as paid.
  }
  res.status(200).send("ok")
})

app.listen(8080)
