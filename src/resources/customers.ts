import type { RequestOptions } from "../http/options.js"
import type { WithResponse } from "../http/response.js"
import type { Customer, ListCustomersParams } from "../models.js"
import type { Page } from "../page.js"
import * as validate from "../validate.js"
import { Resource } from "./base.js"

export class Customers extends Resource {
  async list(params: ListCustomersParams = {}, options?: RequestOptions): Promise<Page<Customer>> {
    const p = params as Record<string, unknown>
    validate.string(p, "search", 0, 120)
    const response = await this.transport.request("GET", this.path("customers"), this.query(p), null, options)
    return this.page<Customer>(response, (cursor) => this.list({ ...params, cursor }, options))
  }

  async get(id: string, options?: RequestOptions): Promise<WithResponse<Customer>> {
    const response = await this.transport.request("GET", this.path("customers", validate.id(id)), {}, null, options)
    return this.object<Customer>(response)
  }
}
