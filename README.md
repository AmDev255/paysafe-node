# PaySafe Node.js SDK

Official Node.js library (JavaScript and TypeScript) for the [PaySafe](https://paysafe.co.tz) payments API. Accept mobile-money payments in Tanzania, issue refunds, control numbers and payment links, move money between projects, and receive signed webhooks.

Part of the [PaySafe SDK directory](https://github.com/AmDev255/paysafe-sdks). API reference: https://paysafe.co.tz/docs.

## Features

- Every served PaySafe API operation (29 operations, 10 resources) with typed request and response models
- Sandbox and production selected automatically from the key prefix
- Safe retries that honour `Retry-After`, idempotency keys that survive retries, cursor pagination helpers
- Polling helpers that wait for a payment, refund or transfer to reach a terminal state
- Webhook signature verification with secret rotation support and constant-time comparison
- One structured exception per documented error code, every error carries the request id
- Configurable timeouts, base URL, logger and HTTP client

## Installation

```bash
npm install paysafe-tz
```

## Requirements

Node.js 20 or newer (uses the global `fetch`). Written in TypeScript; ships ESM and CommonJS builds with bundled type definitions, so it works from plain JavaScript and from TypeScript. Also runs on Bun and Deno with Node compatibility.

## Authentication

Create a secret key in the dashboard under API keys. Test keys start with `paysafe_test_`, live keys with `paysafe_live_`. Keep keys on the server; never ship them in browsers or mobile apps. The SDK reads `PAYSAFE_SECRET_KEY` when no key is passed.

## Sandbox setup

Use a `paysafe_test_` key. The sandbox is the same API with a simulated provider; the last four digits of the customer phone choose the outcome (`0000` succeeds, `1111` is declined, `4444` expires, see the [Sandbox guide](https://paysafe.co.tz/docs/sandbox)).

## Production setup

Switch to a `paysafe_live_` key once your organisation is verified. Register a live webhook endpoint and add your server's address to the project's IP allowlist. Nothing else changes.

## Quickstart

```ts
import { PaySafe, isPaymentSuccessful } from "paysafe-tz"
// CommonJS: const { PaySafe } = require("paysafe-tz")

const client = new PaySafe({ apiKey: process.env.PAYSAFE_SECRET_KEY }) // paysafe_test_… selects the sandbox

const payment = await client.payments.create(
  {
    amount: 10000, // TZS, integer
    customer: { phone: "+255712340000", name: "Amina Juma" },
    reference: "order-8812",
  },
  { idempotencyKey: "order-8812-attempt-1" }, // persist the key before calling
)
console.log(payment.id, payment.status) // 202 Accepted: still pending

const final = await client.payments.waitForTerminal(payment.id) // or wait for the webhook
if (isPaymentSuccessful(final)) console.log("Paid, net TZS", final.net)
```

## Supported API resources

| Resource          | Operations                                 |
| ----------------- | ------------------------------------------ |
| Payments          | create, list, get, cancel, waitForTerminal |
| Payment links     | create, list, get, update                  |
| Control numbers   | create, list, get, cancel                  |
| Refunds           | create, list, get, waitForTerminal         |
| Balance           | get, transactions                          |
| Customers         | list, get                                  |
| Transfers         | create, list, get, waitForTerminal         |
| Webhook endpoints | list, create, get, update, delete          |
| Events            | list, get                                  |
| Webhooks          | verifySignature, constructEvent            |

Planned by PaySafe and not yet served (not included): `ping`, payouts (`createPayout`, `getPayout`), `rotateWebhookEndpointSecret`.

## Usage examples

Runnable programs live in [`examples/`](examples/): authentication, creating and polling a payment, listing with pagination, refunds, payment links, control numbers, transfers, webhook endpoints, events and webhook verification, plus framework handlers under `examples/webhooks/`.

Every resource follows the same shape: `create`, `list`, `get`, plus resource-specific actions. Lists return a `Page` with `data`, `hasMore`, `nextCursor`; iterate the page for its items or `for await` it to walk every page.

```ts
// Pagination
for await (const payment of await client.payments.list({ status: "succeeded", limit: 100 })) {
  // every payment across all pages
}

// Refunds
const refund = await client.refunds.create({ payment: payment.id, amount: 5000, reason: "requested_by_customer" })

// Payment links and control numbers
const link = await client.paymentLinks.create({ title: "Workshop ticket", amount: 25000 })
const number = await client.controlNumbers.create({ payer_name: "Amina Juma", title: "Term 2 fees", amount: 450000 })

// Transfers, balance, customers, events
const transfer = await client.transfers.create({ to: "merchant_shop", amount: 5000 })
const balance = await client.balance.get()
const customer = await client.customers.get("cus_…")
const event = await client.events.get("evt_…")

// Webhook endpoints (the secret is returned once)
const endpoint = await client.webhookEndpoints.create({
  url: "https://example.com/paysafe",
  events: ["payment.succeeded"],
})
```

Models mirror the API JSON exactly (snake_case) and are fully typed; every returned object also carries a non-enumerable `lastResponse` with `status`, `requestId`, `rateLimit`, `idempotentReplayed` and the `idempotencyKey` that was sent. Per-request options: `{ idempotencyKey, requestId, timeoutMs, maxRetries, headers, signal }`.

Retries: 429 and 503 wait for `Retry-After`; `idempotency_in_progress` waits one second; 5xx and network errors are retried only when the request is idempotent (GET, PATCH, DELETE, or a POST with an idempotency key). The SDK generates a UUID key for `payments.create`, `refunds.create`, `transfers.create` and `payments.cancel` when you do not pass one; pass your own key derived from the order to survive process restarts.

Security: ids, filters, headers and amounts are validated before any request; path and query values are percent-encoded; the base URL must be https (plain http only for localhost); redirects are never followed; response bodies are capped at 16 MB; the key never appears in errors or logs.

## Error handling

Every non-2xx response rejects with a subclass of `ApiError` chosen by the error code, carrying `status`, `code`, `requestId`, `param`, `details`, `docUrl`, `retryAfter` and `rateLimit`:

```ts
import {
  ApiConnectionError,
  ApiError,
  InvalidRequestError,
  InvalidStateError,
  RateLimitError,
  ValidationError,
} from "paysafe-tz"

try {
  await client.payments.cancel(id)
} catch (error) {
  if (error instanceof ValidationError) {
    // 400: fix the request (error.param names the field)
  } else if (error instanceof InvalidStateError) {
    // 409: read the object and decide again
  } else if (error instanceof RateLimitError) {
    // 429 after retries: back off error.retryAfter seconds
  } else if (error instanceof ApiError) {
    // anything else from the API
    console.error(String(error)) // code (status) message [request_id]
  } else if (error instanceof ApiConnectionError) {
    // no response at all (DNS, TLS, timeout)
  } else if (error instanceof InvalidRequestError) {
    // rejected locally before any request was sent
  }
}
```

Classes: ValidationError, AuthenticationError, PermissionError (`isIpNotAllowed`, `observedIp`), FeatureDisabledError, NotFoundError, InsufficientFundsError, ConflictError, IdempotencyConflictError, IdempotencyInProgressError, InvalidStateError, RateLimitError, ProviderError, ProviderUnavailableError, ServiceUnavailableError, InternalError, ApiConnectionError, ApiTimeoutError, ResponseTooLargeError, SignatureVerificationError, PollingTimeoutError, ConfigurationError, InvalidRequestError. Unknown codes map by HTTP status.

## Webhook integration

Verify the raw body before parsing it. `constructEvent` checks the `PaySafe-Signature` header (HMAC-SHA256 over `t.body`, 300 s tolerance, constant-time comparison, several `v1=` values during rotation) and returns a typed `Event`:

```ts
import { SignatureVerificationError, constructEvent, type Payment } from "paysafe-tz"

// rawBody must be the exact bytes received (Buffer or string), never re-serialised JSON
try {
  const event = constructEvent<Payment>(process.env.PAYSAFE_WEBHOOK_SECRET, rawBody, req.headers["paysafe-signature"])
  if (event.type === "payment.succeeded") markPaid(event.data.object.reference)
} catch (error) {
  if (error instanceof SignatureVerificationError) return res.status(400).end()
  throw error
}
```

`verifySignature(...)` returns a boolean instead of throwing; both accept an array of secrets. Handlers for Express, Fastify and NestJS are in `examples/webhooks/`, and `examples/verify-webhook.mjs` is a complete receiver on `node:http`. Deduplicate on `event.id` and check `event.livemode`.

## Testing

```bash
npm install
npm run check        # prettier, eslint, tsc, vitest, build
```

Unit, contract, network, security and webhook suites run offline against the fixtures in `tests/fixtures/` that are shared by every PaySafe SDK. The integration suite runs only when `PAYSAFE_SECRET_KEY` holds a `paysafe_test_` key (and optionally `PAYSAFE_BASE_URL`); it refuses live keys and uses the sandbox phone suffixes documented at https://paysafe.co.tz/docs/sandbox. Examples run with `node examples/<name>.mjs` after `npm run build`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
