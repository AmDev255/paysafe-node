// Proves the key works with a read-only call and prints the rate-limit budget.
// Usage: PAYSAFE_SECRET_KEY=paysafe_test_... node examples/auth.mjs
import { ApiError, PaySafe } from "paysafe-tz"

try {
  const client = new PaySafe()
  const balance = await client.balance.get()
  const rate = balance.lastResponse.rateLimit
  console.log(`Environment : ${client.environment}`)
  console.log(`Available   : TZS ${balance.available.find((m) => m.currency === "TZS")?.amount ?? 0}`)
  console.log(`Rate limit  : ${rate?.remaining ?? "?"} remaining of ${rate?.limit ?? "?"}`)
  console.log(`Request id  : ${balance.lastResponse.requestId}`)
} catch (error) {
  if (error instanceof ApiError)
    console.error(`API error ${error.code} (${error.status}): ${error.message} [${error.requestId}]`)
  else console.error(error)
  process.exit(1)
}
