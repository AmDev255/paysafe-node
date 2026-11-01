import type { RequestOptions } from "../http/options.js"
import type { WithResponse } from "../http/response.js"
import type { CreateTransferParams, ListParams, Transfer } from "../models.js"
import { isTransferTerminal } from "../models.js"
import type { Page } from "../page.js"
import type { WaitOptions } from "../polling.js"
import { poll } from "../polling.js"
import * as validate from "../validate.js"
import { Resource } from "./base.js"

export class Transfers extends Resource {
  /** Moves money from this project's available balance to another PaySafe project (201). */
  async create(params: CreateTransferParams, options?: RequestOptions): Promise<WithResponse<Transfer>> {
    const p = params as unknown as Record<string, unknown>
    validate.required(p, ["to", "amount"])
    validate.string(p, "to", 3, 31)
    validate.amount(params.amount, 1, Number.MAX_SAFE_INTEGER)
    validate.enumValue(p, "currency", ["TZS"])
    validate.string(p, "note", 0, 140)
    const response = await this.transport.request("POST", this.path("transfers"), {}, p, Resource.withKey(options))
    return this.object<Transfer>(response)
  }

  async list(params: ListParams = {}, options?: RequestOptions): Promise<Page<Transfer>> {
    const response = await this.transport.request(
      "GET",
      this.path("transfers"),
      this.query(params as Record<string, unknown>),
      null,
      options,
    )
    return this.page<Transfer>(response, (cursor) => this.list({ ...params, cursor }, options))
  }

  async get(id: string, options?: RequestOptions): Promise<WithResponse<Transfer>> {
    const response = await this.transport.request("GET", this.path("transfers", validate.id(id)), {}, null, options)
    return this.object<Transfer>(response)
  }

  waitForTerminal(id: string, options?: WaitOptions<Transfer>): Promise<WithResponse<Transfer>> {
    validate.id(id)
    return poll(
      () => this.get(id),
      isTransferTerminal,
      this.sleep,
      { intervalMs: 2000, timeoutMs: 120000 },
      options,
      `transfer ${id}`,
    )
  }
}
