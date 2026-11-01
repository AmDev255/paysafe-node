import type { RequestOptions } from "../http/options.js"
import type { WithResponse } from "../http/response.js"
import type {
  CreatePaymentLinkParams,
  ListPaymentLinksParams,
  PaymentLink,
  UpdatePaymentLinkParams,
} from "../models.js"
import type { Page } from "../page.js"
import * as validate from "../validate.js"
import { Resource } from "./base.js"
import { MAX_PAYMENT_AMOUNT, MIN_PAYMENT_AMOUNT } from "./payments.js"

export const PAYMENT_LINK_STATUSES = ["active", "paused", "archived"] as const

function validateCommon(p: Record<string, unknown>): void {
  validate.string(p, "description", 1, 1000)
  validate.string(p, "success_message", 1, 255)
  validate.url(p, "redirect_url", 500)
  validate.string(p, "logo", 0, 240)
  validate.string(p, "accent_color", 0, 32)
  if (p["max_payments"] !== undefined && p["max_payments"] !== null)
    validate.amount(p["max_payments"], 1, 1_000_000, "max_payments")
  validate.boolean(p, "collect_name")
  validate.boolean(p, "collect_email")
}

function withDates<T extends { expires_at?: string | Date | null }>(params: T): Record<string, unknown> {
  const p: Record<string, unknown> = { ...params }
  if ("expires_at" in params) p["expires_at"] = validate.dateTime(params.expires_at, "expires_at")
  return p
}

export class PaymentLinks extends Resource {
  async create(params: CreatePaymentLinkParams, options?: RequestOptions): Promise<WithResponse<PaymentLink>> {
    const p = params as unknown as Record<string, unknown>
    validate.required(p, ["title"])
    validate.string(p, "title", 2, 120)
    validateCommon(p)
    for (const field of ["amount", "min_amount", "max_amount"])
      validate.optionalAmount(p, field, MIN_PAYMENT_AMOUNT, MAX_PAYMENT_AMOUNT)
    validate.enumValue(p, "currency", ["TZS"])
    const response = await this.transport.request("POST", this.path("payment-links"), {}, withDates(params), options)
    return this.object<PaymentLink>(response)
  }

  async list(params: ListPaymentLinksParams = {}, options?: RequestOptions): Promise<Page<PaymentLink>> {
    const p = params as Record<string, unknown>
    validate.enumValue(p, "status", PAYMENT_LINK_STATUSES)
    const response = await this.transport.request("GET", this.path("payment-links"), this.query(p), null, options)
    return this.page<PaymentLink>(response, (cursor) => this.list({ ...params, cursor }, options))
  }

  async get(id: string, options?: RequestOptions): Promise<WithResponse<PaymentLink>> {
    const response = await this.transport.request("GET", this.path("payment-links", validate.id(id)), {}, null, options)
    return this.object<PaymentLink>(response)
  }

  /** Pause, resume, archive or edit a link. The amount cannot be changed; archiving is permanent. */
  async update(
    id: string,
    params: UpdatePaymentLinkParams,
    options?: RequestOptions,
  ): Promise<WithResponse<PaymentLink>> {
    const p = params as unknown as Record<string, unknown>
    validate.string(p, "title", 2, 120)
    validate.enumValue(p, "status", PAYMENT_LINK_STATUSES)
    validateCommon(p)
    const response = await this.transport.request(
      "PATCH",
      this.path("payment-links", validate.id(id)),
      {},
      withDates(params),
      options,
    )
    return this.object<PaymentLink>(response)
  }

  pause(id: string, options?: RequestOptions): Promise<WithResponse<PaymentLink>> {
    return this.update(id, { status: "paused" }, options)
  }

  resume(id: string, options?: RequestOptions): Promise<WithResponse<PaymentLink>> {
    return this.update(id, { status: "active" }, options)
  }

  archive(id: string, options?: RequestOptions): Promise<WithResponse<PaymentLink>> {
    return this.update(id, { status: "archived" }, options)
  }
}
