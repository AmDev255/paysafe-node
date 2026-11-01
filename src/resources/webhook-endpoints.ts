import { InvalidRequestError } from "../errors.js"
import type { RequestOptions } from "../http/options.js"
import type { WithResponse } from "../http/response.js"
import type {
  CreateWebhookEndpointParams,
  UpdateWebhookEndpointParams,
  WebhookEndpoint,
  WebhookEndpointCreated,
} from "../models.js"
import { EVENT_TYPES } from "../models.js"
import * as validate from "../validate.js"
import { Resource } from "./base.js"

function validateEvents(p: Record<string, unknown>): void {
  const events = p["events"]
  if (events === undefined || events === null) return
  if (!Array.isArray(events) || events.length === 0) {
    throw new InvalidRequestError('events must be a non-empty list of event types or ["*"]', "events")
  }
  for (const event of events as unknown[]) {
    if (event !== "*" && !(EVENT_TYPES as readonly string[]).includes(event as string)) {
      throw new InvalidRequestError(`Unknown event type ${String(event)}`, "events")
    }
  }
}

export class WebhookEndpoints extends Resource {
  /** Not paginated: a project has a handful of endpoints. */
  async list(options?: RequestOptions): Promise<WebhookEndpoint[]> {
    const response = await this.transport.request("GET", this.path("webhook-endpoints"), {}, null, options)
    const body = response.body as { data?: unknown } | null
    return Array.isArray(body?.data) ? (body.data as WebhookEndpoint[]) : []
  }

  /** The signing secret is only returned here; store it immediately. */
  async create(
    params: CreateWebhookEndpointParams,
    options?: RequestOptions,
  ): Promise<WithResponse<WebhookEndpointCreated>> {
    const p = params as unknown as Record<string, unknown>
    validate.required(p, ["url"])
    validate.url(p, "url", 500)
    validate.string(p, "description", 0, 255)
    validateEvents(p)
    const response = await this.transport.request("POST", this.path("webhook-endpoints"), {}, p, options)
    return this.object<WebhookEndpointCreated>(response)
  }

  async get(id: string, options?: RequestOptions): Promise<WithResponse<WebhookEndpoint>> {
    const response = await this.transport.request(
      "GET",
      this.path("webhook-endpoints", validate.id(id)),
      {},
      null,
      options,
    )
    return this.object<WebhookEndpoint>(response)
  }

  async update(
    id: string,
    params: UpdateWebhookEndpointParams,
    options?: RequestOptions,
  ): Promise<WithResponse<WebhookEndpoint>> {
    const p = params as unknown as Record<string, unknown>
    validate.url(p, "url", 500)
    validate.string(p, "description", 0, 255)
    validate.enumValue(p, "status", ["ENABLED", "DISABLED"])
    validateEvents(p)
    const response = await this.transport.request(
      "PATCH",
      this.path("webhook-endpoints", validate.id(id)),
      {},
      p,
      options,
    )
    return this.object<WebhookEndpoint>(response)
  }

  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.transport.request("DELETE", this.path("webhook-endpoints", validate.id(id)), {}, null, options)
  }
}
