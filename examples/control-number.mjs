// Issues a control number for an invoice, reads it back with its payment entries, then cancels it.
import { PaySafe } from "paysafe-tz"

const client = new PaySafe()

const number = await client.controlNumbers.create({
  payer_name: "Amina Juma",
  payer_phone: "+255712340000",
  payer_reference: "STU-2024-0091",
  title: "Term 2 school fees",
  reference: "INV-2026-0042",
  payment_type: "fees",
  mode: "instalment",
  amount: 450000,
  expires_at: "2026-12-31",
  instalments: [
    { amount: 225000, due_at: "2026-11-30T00:00:00Z" },
    { amount: 225000, due_at: "2026-12-31T00:00:00Z" },
  ],
})
console.log(`Control number ${number.formatted} (${number.id}) pay at ${number.pay_url}`)

const detail = await client.controlNumbers.get(number.id)
console.log(`Balance TZS ${detail.balance}, ${detail.entries.length} entries, ${detail.payment_status}`)
for (const entry of detail.entries)
  console.log(`  ${entry.paid_at} ${entry.status} ${entry.amount} via ${entry.method}`)

for (const item of await client.controlNumbers.list({ state: "unpaid", limit: 5 })) {
  console.log(`${item.formatted} ${item.payer.name} owes ${item.balance}`)
}

const cancelled = await client.controlNumbers.cancel(number.id, "Issued in error during SDK example")
console.log(`Cancelled: ${cancelled.status}`)
