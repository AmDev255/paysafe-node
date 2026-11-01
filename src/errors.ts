import type { RateLimit } from "./http/response.js"

export class PaySafeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
  }
}

export class ConfigurationError extends PaySafeError {}

/** Rejected locally before any request was sent. */
export class InvalidRequestError extends PaySafeError {
  constructor(
    message: string,
    public readonly param: string | null = null,
  ) {
    super(message)
  }
}

/** No HTTP response was received. */
export class ApiConnectionError extends PaySafeError {}
export class ApiTimeoutError extends ApiConnectionError {}
export class ResponseTooLargeError extends ApiConnectionError {}

export class PollingTimeoutError extends PaySafeError {
  constructor(
    message: string,
    public readonly lastSeen: unknown,
  ) {
    super(message)
  }
}

export type SignatureFailureReason =
  "missing_header" | "malformed_header" | "timestamp_outside_tolerance" | "signature_mismatch" | "invalid_payload"

export class SignatureVerificationError extends PaySafeError {
  constructor(
    public readonly reason: SignatureFailureReason,
    message: string,
  ) {
    super(message)
  }
}

export interface ApiErrorInit {
  status: number
  code: string
  message: string
  requestId: string | null
  param: string | null
  details: Record<string, unknown> | null
  docUrl: string | null
  headers: Record<string, string>
  retryAfter: number | null
  rateLimit: RateLimit | null
}

/** Any non-2xx response from the API. */
export class ApiError extends PaySafeError {
  readonly status: number
  readonly code: string
  readonly requestId: string | null
  readonly param: string | null
  readonly details: Record<string, unknown> | null
  readonly docUrl: string | null
  readonly headers: Record<string, string>
  readonly retryAfter: number | null
  readonly rateLimit: RateLimit | null

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId
    this.param = init.param
    this.details = init.details
    this.docUrl = init.docUrl
    this.headers = init.headers
    this.retryAfter = init.retryAfter
    this.rateLimit = init.rateLimit
  }

  get isRetryable(): boolean {
    if (this.status === 429 || this.status === 503 || this.code === "idempotency_in_progress") return true
    return this.status >= 500 && this.code !== "provider_error"
  }

  override toString(): string {
    return `${this.code} (${this.status}) ${this.message} [${this.requestId ?? "no request id"}]`
  }
}

export class ValidationError extends ApiError {}
export class AuthenticationError extends ApiError {}
export class PermissionError extends ApiError {
  get isIpNotAllowed(): boolean {
    const code = this.details?.["code"]
    return code === "ip_not_allowed" || code === "ip_allowlist_empty"
  }
  get observedIp(): string | null {
    const ip = this.details?.["ip"]
    return typeof ip === "string" ? ip : null
  }
}
export class FeatureDisabledError extends ApiError {}
export class NotFoundError extends ApiError {}
export class InsufficientFundsError extends ApiError {
  get available(): number | null {
    const v = this.details?.["available"]
    return typeof v === "number" ? v : null
  }
  get requested(): number | null {
    const v = this.details?.["requested"]
    return typeof v === "number" ? v : null
  }
}
export class ConflictError extends ApiError {}
export class IdempotencyConflictError extends ConflictError {}
export class IdempotencyInProgressError extends ConflictError {}
export class InvalidStateError extends ConflictError {}
export class RateLimitError extends ApiError {
  get scope(): string | null {
    const s = this.details?.["scope"]
    return typeof s === "string" ? s : null
  }
}
export class ProviderError extends ApiError {}
export class ProviderUnavailableError extends ApiError {}
export class ServiceUnavailableError extends ApiError {}
export class InternalError extends ApiError {}

const BY_CODE: Record<string, new (init: ApiErrorInit) => ApiError> = {
  validation_error: ValidationError,
  authentication_error: AuthenticationError,
  permission_error: PermissionError,
  feature_disabled: FeatureDisabledError,
  not_found: NotFoundError,
  insufficient_funds: InsufficientFundsError,
  conflict: ConflictError,
  idempotency_conflict: IdempotencyConflictError,
  idempotency_in_progress: IdempotencyInProgressError,
  invalid_state: InvalidStateError,
  rate_limited: RateLimitError,
  provider_error: ProviderError,
  provider_unavailable: ProviderUnavailableError,
  service_unavailable: ServiceUnavailableError,
}

const BY_STATUS: Record<number, new (init: ApiErrorInit) => ApiError> = {
  400: ValidationError,
  401: AuthenticationError,
  402: InsufficientFundsError,
  403: PermissionError,
  404: NotFoundError,
  409: ConflictError,
  429: RateLimitError,
  503: ServiceUnavailableError,
}

export function mapApiError(init: ApiErrorInit): ApiError {
  const Ctor = BY_CODE[init.code] ?? BY_STATUS[init.status] ?? (init.status >= 500 ? InternalError : ApiError)
  return new Ctor(init)
}
