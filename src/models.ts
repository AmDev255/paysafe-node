/** Models mirror the API's JSON exactly (snake_case) so responses can be stored or forwarded unchanged. */

export type Currency = "TZS"

export type PaymentStatus =
  | "created"
  | "pending"
  | "processing"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "partially_refunded"
  | "refunded"
export type PaymentChannel = "mpesa" | "tigopesa" | "airtel" | "halopesa"

export interface Payment {
  id: string
  object: "payment"
  status: PaymentStatus | (string & {})
  amount: number
  currency: Currency
  amount_refunded: number
  fee: number
  net: number
  customer: { phone: string; name: string | null; email: string | null }
  channel: string | null
  reference: string | null
  description: string | null
  payment_link: string | null
  metadata: Record<string, unknown>
  failure: { code: string | null; message: string | null } | null
  livemode: boolean
  expires_at: string | null
  succeeded_at: string | null
  created_at: string
  updated_at: string
}

export const PAYMENT_TERMINAL_STATUSES: readonly string[] = [
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "partially_refunded",
  "refunded",
]
export const PAYMENT_SUCCESSFUL_STATUSES: readonly string[] = ["succeeded", "partially_refunded", "refunded"]
export const isPaymentTerminal = (p: Pick<Payment, "status">): boolean => PAYMENT_TERMINAL_STATUSES.includes(p.status)
export const isPaymentSuccessful = (p: Pick<Payment, "status">): boolean =>
  PAYMENT_SUCCESSFUL_STATUSES.includes(p.status)

export interface CreatePaymentParams {
  amount: number
  currency?: Currency
  customer: { phone: string; name?: string; email?: string }
  reference?: string
  description?: string
  metadata?: Record<string, unknown>
  expires_in?: number
  channel?: PaymentChannel
}

export interface ListPaymentsParams {
  limit?: number
  cursor?: string
  status?: PaymentStatus
  reference?: string
  customer_phone?: string
  created_gte?: string | Date
  created_lte?: string | Date
}

export type PaymentLinkStatus = "active" | "paused" | "archived"

export interface PaymentLink {
  id: string
  object: "payment_link"
  url: string
  title: string
  description: string | null
  amount_type: "fixed" | "customer"
  amount: number | null
  min_amount: number | null
  max_amount: number | null
  currency: Currency
  collect_name: boolean
  collect_email: boolean
  max_payments: number | null
  paid_count: number
  paid_amount: number
  expires_at: string | null
  status: PaymentLinkStatus | (string & {})
  state: "active" | "paused" | "archived" | "expired" | "completed" | (string & {})
  success_message: string | null
  redirect_url: string | null
  logo: string | null
  logo_url: string | null
  accent_color: string | null
  livemode: boolean
  created_at: string
  updated_at: string
}

export interface CreatePaymentLinkParams {
  title: string
  description?: string
  amount?: number
  min_amount?: number
  max_amount?: number
  currency?: Currency
  collect_name?: boolean
  collect_email?: boolean
  max_payments?: number
  expires_at?: string | Date
  success_message?: string
  redirect_url?: string
  logo?: string
  accent_color?: string
}

export interface UpdatePaymentLinkParams {
  title?: string
  description?: string | null
  max_payments?: number | null
  expires_at?: string | Date | null
  status?: PaymentLinkStatus
  success_message?: string | null
  redirect_url?: string | null
  collect_name?: boolean
  collect_email?: boolean
  logo?: string | null
  accent_color?: string | null
}

export interface ListPaymentLinksParams {
  limit?: number
  cursor?: string
  status?: PaymentLinkStatus
}

export type ControlNumberStatus = "active" | "paid" | "expired" | "cancelled"

export interface ControlNumber {
  id: string
  object: "control_number"
  number: string
  formatted: string
  batch: string | null
  customer: string | null
  payer: { name: string; phone: string | null; email: string | null; reference: string | null }
  title: string
  description: string | null
  reference: string | null
  payment_type: string | null
  mode: "full" | "instalment"
  amount: number
  paid_amount: number
  balance: number
  progress_percent: number
  currency: Currency
  payment_count: number
  status: ControlNumberStatus | (string & {})
  payment_status: string
  notes: string | null
  metadata: Record<string, unknown> | null
  issued_at: string
  expires_at: string | null
  paid_at: string | null
  last_paid_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  pay_url: string
  livemode: boolean
  image: string | null
  image_url: string | null
  created_at: string
}

export interface ControlNumberEntry {
  id: string
  object: "control_number_entry"
  control_number: string
  source: "payment" | "manual"
  payment: string | null
  amount: number
  currency: Currency
  method: string
  provider_reference: string | null
  paid_at: string
  status: "pending" | "verified" | "rejected" | "reversed" | (string & {})
  receipt_number: string | null
  recorded_by: string | null
  verified_by: string | null
  verified_at: string | null
  rejected_at: string | null
  reject_reason: string | null
  reversed_at: string | null
  reverse_reason: string | null
  note: string | null
  created_at: string
}

export interface ControlNumberWithEntries extends ControlNumber {
  entries: ControlNumberEntry[]
}

export const isControlNumberTerminal = (c: Pick<ControlNumber, "status">): boolean =>
  ["paid", "expired", "cancelled"].includes(c.status)

export interface CreateControlNumberParams {
  payer_name: string
  payer_phone?: string
  payer_email?: string
  payer_reference?: string
  title: string
  description?: string
  reference?: string
  payment_type?: string
  mode?: "full" | "instalment"
  amount: number
  currency?: Currency
  expires_at?: string | Date
  notes?: string
  instalments?: Array<{ amount: number; due_at: string | Date }>
  metadata?: Record<string, unknown>
  image?: string
}

export interface ListControlNumbersParams {
  limit?: number
  cursor?: string
  status?: ControlNumberStatus
  state?: "unpaid" | "partial" | "paid" | "overdue"
  batch?: string
  customer?: string
  q?: string
}

export type RefundStatus = "pending" | "processing" | "succeeded" | "failed" | "rejected"
export type RefundReason = "requested_by_customer" | "duplicate" | "fraudulent" | "other"

export interface Refund {
  id: string
  object: "refund"
  payment: string
  amount: number
  currency: Currency
  status: RefundStatus | (string & {})
  reason: string | null
  failure_reason: string | null
  metadata: Record<string, unknown>
  created_at: string
  completed_at: string | null
}

export const isRefundTerminal = (r: Pick<Refund, "status">): boolean =>
  ["succeeded", "failed", "rejected"].includes(r.status)

export interface CreateRefundParams {
  payment: string
  amount?: number
  reason?: RefundReason
  metadata?: Record<string, unknown>
}

export interface ListRefundsParams {
  limit?: number
  cursor?: string
  payment?: string
  status?: RefundStatus
}

export interface Money {
  amount: number
  currency: Currency
}

export interface Balance {
  object: "balance"
  livemode: boolean
  available: Money[]
  pending: Money[]
}

export const balanceAmount = (items: Money[], currency: Currency = "TZS"): number =>
  items.find((m) => m.currency === currency)?.amount ?? 0

export interface Transaction {
  id: string
  object: "transaction"
  type: string
  direction: "credit" | "debit"
  bucket: "available" | "pending"
  amount: number
  balance_after: number
  currency: Currency
  source: Record<string, unknown> | null
  description: string | null
  created_at: string
}

export interface Customer {
  id: string
  object: "customer"
  phone: string
  name: string | null
  email: string | null
  total_paid?: number
  payment_count?: number
  first_seen_at?: string
  last_seen_at?: string
}

export interface ListCustomersParams {
  limit?: number
  cursor?: string
  search?: string
}

export type TransferStatus = "completed" | "in_review" | "rejected" | "reversed"

export interface TransferParty {
  handle: string | null
  name: string
  organization: string
  verified: boolean
}

export interface Transfer {
  id: string
  object: "transfer"
  direction: "outgoing" | "incoming"
  amount: number
  currency: Currency
  note: string | null
  status: TransferStatus | (string & {})
  from: TransferParty
  to: TransferParty
  livemode: boolean
  created_at: string
  completed_at: string | null
}

export const isTransferTerminal = (t: Pick<Transfer, "status">): boolean =>
  ["completed", "rejected", "reversed"].includes(t.status)

export interface CreateTransferParams {
  to: string
  amount: number
  currency?: Currency
  note?: string
}

export interface ListParams {
  limit?: number
  cursor?: string
}

export type EventType =
  | "payment.pending"
  | "payment.processing"
  | "payment.requires_action"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.expired"
  | "payment.cancelled"
  | "refund.pending"
  | "refund.succeeded"
  | "refund.failed"
  | "payout.processing"
  | "payout.paid"
  | "payout.failed"
  | "transfer.sent"
  | "transfer.received"
  | "transfer.in_review"
  | "transfer.rejected"
  | "transfer.reversed"
  | "control_number.partially_paid"
  | "control_number.paid"
  | "control_number.expired"
  | "control_number.cancelled"

export const EVENT_TYPES: readonly EventType[] = [
  "payment.pending",
  "payment.processing",
  "payment.requires_action",
  "payment.succeeded",
  "payment.failed",
  "payment.expired",
  "payment.cancelled",
  "refund.pending",
  "refund.succeeded",
  "refund.failed",
  "payout.processing",
  "payout.paid",
  "payout.failed",
  "transfer.sent",
  "transfer.received",
  "transfer.in_review",
  "transfer.rejected",
  "transfer.reversed",
  "control_number.partially_paid",
  "control_number.paid",
  "control_number.expired",
  "control_number.cancelled",
]

export interface WebhookEndpoint {
  id: string
  object: "webhook_endpoint"
  livemode: boolean
  url: string
  description: string | null
  events: string[]
  status: "ENABLED" | "DISABLED" | (string & {})
  failure_streak: number
  disabled_reason: string | null
  disabled_at: string | null
  created_at: string
  updated_at: string
}

/** Returned by webhookEndpoints.create only; the secret is never shown again. */
export interface WebhookEndpointCreated extends WebhookEndpoint {
  secret: string
}

export interface CreateWebhookEndpointParams {
  url: string
  description?: string
  events?: Array<EventType | "*">
}

export interface UpdateWebhookEndpointParams {
  url?: string
  description?: string | null
  events?: Array<EventType | "*">
  status?: "ENABLED" | "DISABLED"
}

export interface WebhookDelivery {
  id: string
  object: "webhook_delivery"
  endpoint_id: string
  event_id: string
  attempt: number
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXHAUSTED" | (string & {})
  is_replay: boolean
  response_status: number | null
  response_body: string | null
  latency_ms: number | null
  error: string | null
  scheduled_at: string
  delivered_at: string | null
  next_retry_at: string | null
}

export interface Event<T = Record<string, unknown>> {
  id: string
  object: "event"
  type: EventType | (string & {})
  api_version: string
  livemode: boolean
  created: number
  created_at: string
  data: { object: T }
  deliveries?: WebhookDelivery[]
  request?: { id: string; idempotency_key: string | null }
}

export interface EventWithDeliveries<T = Record<string, unknown>> extends Event<T> {
  deliveries: WebhookDelivery[]
}

export interface ListEventsParams {
  limit?: number
  cursor?: string
  type?: EventType
  from?: string | Date
  to?: string | Date
  resourceId?: string
}
