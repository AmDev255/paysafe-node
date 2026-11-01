import { ConfigurationError } from "./errors.js"
import type { Environment } from "./environment.js"
import { environmentFromKey } from "./environment.js"
import type { RequestOptions } from "./http/options.js"
import type { ApiResponse } from "./http/response.js"
import type { FetchLike, LogRecord, Sleeper } from "./http/transport.js"
import { Transport, defaultSleep } from "./http/transport.js"
import { Balance } from "./resources/balance.js"
import { ControlNumbers } from "./resources/control-numbers.js"
import { Customers } from "./resources/customers.js"
import { Events } from "./resources/events.js"
import { PaymentLinks } from "./resources/payment-links.js"
import { Payments } from "./resources/payments.js"
import { Refunds } from "./resources/refunds.js"
import { Transfers } from "./resources/transfers.js"
import { WebhookEndpoints } from "./resources/webhook-endpoints.js"
import { isLoopback } from "./validate.js"
import { webhooks } from "./webhooks.js"

export const VERSION = "0.1.0"
export const DEFAULT_BASE_URL = "https://api.paysafe.co.tz"
export const DEFAULT_TIMEOUT_MS = 30000
export const DEFAULT_MAX_RETRIES = 4

export interface PaySafeOptions {
  /** Secret key. Defaults to process.env.PAYSAFE_SECRET_KEY. */
  apiKey?: string
  /** Defaults to process.env.PAYSAFE_BASE_URL or https://api.paysafe.co.tz. */
  baseUrl?: string
  /** Per-attempt timeout in milliseconds (default 30000). */
  timeoutMs?: number
  /** Retries after the first attempt (default 4, so 5 attempts). */
  maxRetries?: number
  /** Value for the PaySafe-Version header. */
  apiVersion?: string
  /** Custom fetch implementation (tests, proxies). */
  fetch?: FetchLike
  /** Receives one record per attempt; never contains the key or bodies. */
  logger?: (record: LogRecord) => void
  /** Appended to the User-Agent. */
  userAgentSuffix?: string
  /** Allow a plain-http base URL for a non-loopback host. */
  allowInsecureHttp?: boolean
  /** @internal test hook */
  sleep?: Sleeper
  /** @internal test hook */
  random?: () => number
}

export class PaySafe {
  readonly environment: Environment
  readonly payments: Payments
  readonly paymentLinks: PaymentLinks
  readonly controlNumbers: ControlNumbers
  readonly refunds: Refunds
  readonly balance: Balance
  readonly customers: Customers
  readonly transfers: Transfers
  readonly webhookEndpoints: WebhookEndpoints
  readonly events: Events
  readonly webhooks = webhooks

  private readonly transport: Transport

  constructor(options: PaySafeOptions = {}) {
    const apiKey = options.apiKey ?? process.env["PAYSAFE_SECRET_KEY"]
    if (!apiKey) throw new ConfigurationError("No API key given and PAYSAFE_SECRET_KEY is not set")
    if (!/^[A-Za-z0-9_]+$/.test(apiKey)) throw new ConfigurationError("API key contains invalid characters")
    this.environment = environmentFromKey(apiKey)

    let baseUrl = options.baseUrl ?? process.env["PAYSAFE_BASE_URL"] ?? DEFAULT_BASE_URL
    if (/[\s\x00-\x1F\x7F]/.test(baseUrl))
      throw new ConfigurationError("baseUrl contains whitespace or control characters")
    baseUrl = baseUrl.replace(/\/+$/, "")
    if (baseUrl.endsWith("/v1")) baseUrl = baseUrl.slice(0, -3)
    let parsed: URL
    try {
      parsed = new URL(baseUrl)
    } catch {
      throw new ConfigurationError("baseUrl must be an absolute URL")
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new ConfigurationError("baseUrl must not contain credentials, a query or a fragment")
    }
    if (
      parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && (options.allowInsecureHttp === true || isLoopback(parsed.hostname)))
    ) {
      throw new ConfigurationError(
        "baseUrl must use https (plain http is only allowed for localhost or with allowInsecureHttp)",
      )
    }
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!(timeoutMs > 0)) throw new ConfigurationError("timeoutMs must be positive")
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new ConfigurationError("maxRetries must be zero or more")
    if (options.userAgentSuffix !== undefined && /[\x00-\x1F\x7F]/.test(options.userAgentSuffix)) {
      throw new ConfigurationError("userAgentSuffix contains control characters")
    }

    const sleep = options.sleep ?? defaultSleep
    this.transport = new Transport({
      apiKey,
      baseUrl,
      timeoutMs,
      maxRetries,
      apiVersion: options.apiVersion ?? null,
      userAgent: `paysafe-node/${VERSION} (Node ${process.versions.node})${options.userAgentSuffix ? " " + options.userAgentSuffix : ""}`,
      fetch: options.fetch ?? ((input, init) => fetch(input, init)),
      sleep,
      logger: options.logger ?? null,
      random: options.random ?? Math.random,
    })

    this.payments = new Payments(this.transport, sleep)
    this.paymentLinks = new PaymentLinks(this.transport, sleep)
    this.controlNumbers = new ControlNumbers(this.transport, sleep)
    this.refunds = new Refunds(this.transport, sleep)
    this.balance = new Balance(this.transport, sleep)
    this.customers = new Customers(this.transport, sleep)
    this.transfers = new Transfers(this.transport, sleep)
    this.webhookEndpoints = new WebhookEndpoints(this.transport, sleep)
    this.events = new Events(this.transport, sleep)
  }

  /** Low-level escape hatch: any request under /v1 with the decoded response. */
  request(
    method: string,
    path: string,
    query: Record<string, unknown> = {},
    body: Record<string, unknown> | null = null,
    options?: RequestOptions,
  ): Promise<ApiResponse> {
    return this.transport.request(method.toUpperCase(), "/" + path.replace(/^\/+/, ""), query, body, options)
  }
}
