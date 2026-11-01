import type { RequestOptions } from "../http/options.js"
import type { WithResponse } from "../http/response.js"
import type { Event, EventWithDeliveries, ListEventsParams } from "../models.js"
import { EVENT_TYPES } from "../models.js"
import type { Page } from "../page.js"
import * as validate from "../validate.js"
import { Resource } from "./base.js"

export class Events extends Resource {
  async list(params: ListEventsParams = {}, options?: RequestOptions): Promise<Page<Event>> {
    const p: Record<string, unknown> = { ...params }
    validate.enumValue(p, "type", EVENT_TYPES)
    if ("from" in params) p["from"] = validate.dateTime(params.from, "from")
    if ("to" in params) p["to"] = validate.dateTime(params.to, "to")
    if (params.resourceId !== undefined) validate.id(params.resourceId, "resourceId")
    const response = await this.transport.request("GET", this.path("events"), this.query(p), null, options)
    return this.page<Event>(response, (cursor) => this.list({ ...params, cursor }, options))
  }

  /** The event plus every delivery attempt to your endpoints. */
  async get(id: string, options?: RequestOptions): Promise<WithResponse<EventWithDeliveries>> {
    const response = await this.transport.request("GET", this.path("events", validate.id(id)), {}, null, options)
    return this.object<EventWithDeliveries>(response)
  }
}
