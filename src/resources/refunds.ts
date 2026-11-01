import type { RequestOptions } from "../http/options.js"
import type { WithResponse } from "../http/response.js"
import type { CreateRefundParams, ListRefundsParams, Refund } from "../models.js"
import { isRefundTerminal } from "../models.js"
import type { Page } from "../page.js"
import type { WaitOptions } from "../polling.js"
import { poll } from "../polling.js"
import * as validate from "../validate.js"
import { Resource } from "./base.js"

export const REFUND_REASONS = ["requested_by_customer", "duplicate", "fraudulent", "other"] as const
export const REFUND_STATUSES = ["pending", "processing", "succeeded", "failed", "rejected"] as const

export class Refunds extends Resource {
  /** Refunds a succeeded payment (202 Accepted). Omit amount to refund the remaining balance. */
  async create(params: CreateRefundParams, options?: RequestOptions): Promise<WithResponse<Refund>> {
    const p = params as unknown as Record<string, unknown>
    validate.required(p, ["payment"])
    validate.id(params.payment, "payment")
    validate.optionalAmount(p, "amount", 1, Number.MAX_SAFE_INTEGER)
    validate.enumValue(p, "reason", REFUND_REASONS)
    validate.metadata(p)
    const response = await this.transport.request("POST", this.path("refunds"), {}, p, Resource.withKey(options))
    return this.object<Refund>(response)
  }

  async list(params: ListRefundsParams = {}, options?: RequestOptions): Promise<Page<Refund>> {
    const p = params as Record<string, unknown>
    validate.enumValue(p, "status", REFUND_STATUSES)
    if (params.payment !== undefined) validate.id(params.payment, "payment")
    const response = await this.transport.request("GET", this.path("refunds"), this.query(p), null, options)
    return this.page<Refund>(response, (cursor) => this.list({ ...params, cursor }, options))
  }

  async get(id: string, options?: RequestOptions): Promise<WithResponse<Refund>> {
    const response = await this.transport.request("GET", this.path("refunds", validate.id(id)), {}, null, options)
    return this.object<Refund>(response)
  }

  waitForTerminal(id: string, options?: WaitOptions<Refund>): Promise<WithResponse<Refund>> {
    validate.id(id)
    return poll(
      () => this.get(id),
      isRefundTerminal,
      this.sleep,
      { intervalMs: 1000, timeoutMs: 60000 },
      options,
      `refund ${id}`,
    )
  }
}
