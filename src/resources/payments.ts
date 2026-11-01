import type { RequestOptions } from "../http/options.js"
import type { WithResponse } from "../http/response.js"
import type { CreatePaymentParams, ListPaymentsParams, Payment } from "../models.js"
import { isPaymentTerminal } from "../models.js"
import type { Page } from "../page.js"
import type { WaitOptions } from "../polling.js"
import { poll } from "../polling.js"
import * as validate from "../validate.js"
import { Resource } from "./base.js"

export const PAYMENT_CHANNELS = ["mpesa", "tigopesa", "airtel", "halopesa"] as const
export const PAYMENT_STATUSES = [
  "created",
  "pending",
  "processing",
  "requires_action",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "partially_refunded",
  "refunded",
] as const
export const MIN_PAYMENT_AMOUNT = 1000
export const MAX_PAYMENT_AMOUNT = 10_000_000

export class Payments extends Resource {
  /**
   * Starts a mobile-money charge (202 Accepted). An Idempotency-Key is generated when none is given;
   * read it from `payment.lastResponse.idempotencyKey` and persist it before retrying yourself.
   */
  async create(params: CreatePaymentParams, options?: RequestOptions): Promise<WithResponse<Payment>> {
    const p = params as unknown as Record<string, unknown>
    validate.required(p, ["amount", "customer.phone"])
    validate.amount(params.amount, MIN_PAYMENT_AMOUNT, MAX_PAYMENT_AMOUNT)
    const customer = params.customer as unknown as Record<string, unknown>
    validate.phone(customer["phone"])
    validate.string(customer, "name", 1, 100)
    validate.string(customer, "email", 3, 255)
    validate.enumValue(p, "currency", ["TZS"])
    validate.enumValue(p, "channel", PAYMENT_CHANNELS)
    validate.string(p, "reference", 1, 120)
    validate.string(p, "description", 1, 255)
    validate.metadata(p)
    if (params.expires_in !== undefined) validate.amount(params.expires_in, 60, 900, "expires_in")
    const response = await this.transport.request("POST", this.path("payments"), {}, p, Resource.withKey(options))
    return this.object<Payment>(response)
  }

  async list(params: ListPaymentsParams = {}, options?: RequestOptions): Promise<Page<Payment>> {
    const p = params as Record<string, unknown>
    validate.enumValue(p, "status", PAYMENT_STATUSES)
    const response = await this.transport.request("GET", this.path("payments"), this.query(p), null, options)
    return this.page<Payment>(response, (cursor) => this.list({ ...params, cursor }, options))
  }

  async get(id: string, options?: RequestOptions): Promise<WithResponse<Payment>> {
    const response = await this.transport.request("GET", this.path("payments", validate.id(id)), {}, null, options)
    return this.object<Payment>(response)
  }

  /** Only payments in created or pending can be cancelled; later states raise InvalidStateError. The API requires an Idempotency-Key here, so one is generated when omitted. */
  async cancel(id: string, params: { reason?: string } = {}, options?: RequestOptions): Promise<WithResponse<Payment>> {
    validate.string(params, "reason", 0, 255)
    const response = await this.transport.request(
      "POST",
      this.path("payments", validate.id(id), "cancel"),
      {},
      params,
      Resource.withKey(options),
    )
    return this.object<Payment>(response)
  }

  /** Polls `get` until the payment is terminal (default every 2 s, up to 120 s). */
  waitForTerminal(id: string, options?: WaitOptions<Payment>): Promise<WithResponse<Payment>> {
    validate.id(id)
    return poll(
      () => this.get(id),
      isPaymentTerminal,
      this.sleep,
      { intervalMs: 2000, timeoutMs: 120000 },
      options,
      `payment ${id}`,
    )
  }
}
