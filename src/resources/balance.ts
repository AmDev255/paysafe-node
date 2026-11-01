import type { RequestOptions } from "../http/options.js"
import type { WithResponse } from "../http/response.js"
import type { Balance as BalanceModel, ListParams, Transaction } from "../models.js"
import type { Page } from "../page.js"
import { Resource } from "./base.js"

export class Balance extends Resource {
  async get(options?: RequestOptions): Promise<WithResponse<BalanceModel>> {
    const response = await this.transport.request("GET", this.path("balance"), {}, null, options)
    return this.object<BalanceModel>(response)
  }

  /** Ledger entries, newest first. */
  async transactions(params: ListParams = {}, options?: RequestOptions): Promise<Page<Transaction>> {
    const response = await this.transport.request(
      "GET",
      this.path("transactions"),
      this.query(params as Record<string, unknown>),
      null,
      options,
    )
    return this.page<Transaction>(response, (cursor) => this.transactions({ ...params, cursor }, options))
  }
}
