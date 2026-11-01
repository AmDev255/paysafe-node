// Fastify handler for PaySafe webhooks. A raw-body content type parser keeps the exact bytes for signing.
import Fastify from "fastify"
import { SignatureVerificationError, constructEvent } from "paysafe-tz"

const app = Fastify()
const secret = process.env.PAYSAFE_WEBHOOK_SECRET

app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body))

app.post("/paysafe/webhook", async (request, reply) => {
  let event
  try {
    event = constructEvent(secret, request.body, request.headers["paysafe-signature"])
  } catch (error) {
    if (error instanceof SignatureVerificationError) return reply.code(400).send("invalid signature")
    throw error
  }
  if (event.type === "payment.succeeded") {
    // Deduplicate on event.id, then mark the order identified by event.data.object.reference as paid.
  }
  return reply.code(200).send("ok")
})

await app.listen({ port: 8080 })
