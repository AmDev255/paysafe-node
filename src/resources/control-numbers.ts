import { InvalidRequestError } from "../errors.js"
import type { RequestOptions } from "../http/options.js"
import type { WithResponse } from "../http/response.js"
import type {
  ControlNumber,
  ControlNumberWithEntries,
  CreateControlNumberParams,
  ListControlNumbersParams,
} from "../models.js"
import type { Page } from "../page.js"
import * as validate from "../validate.js"
import { Resource } from "./base.js"

export const CONTROL_NUMBER_STATUSES = ["active", "paid", "expired", "cancelled"] as const
export const CONTROL_NUMBER_STATES = ["unpaid", "partial", "paid", "overdue"] as const
export const CONTROL_NUMBER_MODES = ["full", "instalment"] as const
export const MAX_CONTROL_NUMBER_AMOUNT = 1_000_000_000_000

export class ControlNumbers extends Resource {
  /** Issues a 12-digit pay-by-reference number (201). The number itself is assigned by the server. */
  async create(params: CreateControlNumberParams, options?: RequestOptions): Promise<WithResponse<ControlNumber>> {
    const p: Record<string, unknown> = { ...params }
    validate.required(p, ["payer_name", "title", "amount"])
    validate.string(p, "payer_name", 1, 120)
    validate.string(p, "payer_phone", 0, 20)
    validate.string(p, "payer_email", 0, 255)
    validate.string(p, "payer_reference", 0, 120)
    validate.string(p, "title", 1, 150)
    validate.string(p, "description", 0, 500)
    validate.string(p, "reference", 0, 120)
    validate.string(p, "payment_type", 0, 60)
    validate.string(p, "notes", 0, 1000)
    validate.string(p, "image", 0, 240)
    validate.enumValue(p, "mode", CONTROL_NUMBER_MODES)
    validate.enumValue(p, "currency", ["TZS"])
    validate.amount(params.amount, 1, MAX_CONTROL_NUMBER_AMOUNT)
    validate.metadata(p)
    if ("expires_at" in params) p["expires_at"] = validate.dateTime(params.expires_at, "expires_at")
    if (params.instalments !== undefined) {
      if (!Array.isArray(params.instalments) || params.instalments.length === 0) {
        throw new InvalidRequestError("instalments must be a non-empty list", "instalments")
      }
      p["instalments"] = params.instalments.map((item, i) => {
        validate.amount(item.amount, 1, MAX_CONTROL_NUMBER_AMOUNT, `instalments[${i}].amount`)
        const due = validate.dateTime(item.due_at, `instalments[${i}].due_at`)
        if (due === null) throw new InvalidRequestError(`instalments[${i}].due_at is required`, "instalments")
        return { amount: item.amount, due_at: due }
      })
    }
    const response = await this.transport.request("POST", this.path("control-numbers"), {}, p, options)
    return this.object<ControlNumber>(response)
  }

  async list(params: ListControlNumbersParams = {}, options?: RequestOptions): Promise<Page<ControlNumber>> {
    const p = params as Record<string, unknown>
    validate.enumValue(p, "status", CONTROL_NUMBER_STATUSES)
    validate.enumValue(p, "state", CONTROL_NUMBER_STATES)
    validate.string(p, "q", 0, 80)
    const response = await this.transport.request("GET", this.path("control-numbers"), this.query(p), null, options)
    return this.page<ControlNumber>(response, (cursor) => this.list({ ...params, cursor }, options))
  }

  /** The number with every payment entry recorded against it. */
  async get(id: string, options?: RequestOptions): Promise<WithResponse<ControlNumberWithEntries>> {
    const response = await this.transport.request(
      "GET",
      this.path("control-numbers", validate.id(id)),
      {},
      null,
      options,
    )
    return this.object<ControlNumberWithEntries>(response)
  }

  /** Only active numbers can be cancelled; the reason is kept on the number. */
  async cancel(id: string, reason: string, options?: RequestOptions): Promise<WithResponse<ControlNumber>> {
    const body = { reason }
    validate.string(body, "reason", 3, 500)
    const response = await this.transport.request(
      "POST",
      this.path("control-numbers", validate.id(id), "cancel"),
      {},
      body,
      options,
    )
    return this.object<ControlNumber>(response)
  }
}
