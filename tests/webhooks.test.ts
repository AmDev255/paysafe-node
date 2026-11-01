import { describe, expect, it } from "vitest"
import { SignatureVerificationError, constructEvent, sign, verifySignature, type Payment } from "../src/index.js"
import { fixture } from "./support.js"

interface Vector {
  secret: string
  timestamp: number
  body: string
  signature: string
  header: string
  legacy: { secret: string; signature: string }
  rotation: { header: string }
  secondSecret: { secret: string; signature: string }
  nowValid: number
  nowExpired: number
  nowFuture: number
  tamperedBody: string
}

const v = fixture<Vector>("webhook-vector")
const at = { now: v.nowValid }

describe("webhooks", () => {
  it("verifies the documented vector", () => {
    expect(verifySignature(v.secret, v.body, v.header, at)).toBe(true)
    expect(verifySignature(v.secret, Buffer.from(v.body, "utf8"), v.header, at)).toBe(true)
  })

  it("verifies the legacy docs vector only with its own secret", () => {
    const header = `t=${v.timestamp},v1=${v.legacy.signature}`
    expect(verifySignature(v.legacy.secret, v.body, header, at)).toBe(true)
    expect(verifySignature(v.secret, v.body, header, at)).toBe(false)
  })

  it("rejects wrong secrets, tampered bodies and bad headers", () => {
    expect(verifySignature("paysafe_webhook_test_wrong", v.body, v.header, at)).toBe(false)
    expect(verifySignature(v.secret, v.tamperedBody, v.header, at)).toBe(false)
    expect(verifySignature(v.secret, v.body, null, at)).toBe(false)
    expect(verifySignature(v.secret, v.body, "", at)).toBe(false)
    expect(verifySignature(v.secret, v.body, `v1=${v.signature}`, at)).toBe(false)
    expect(verifySignature(v.secret, v.body, `t=abc,v1=${v.signature}`, at)).toBe(false)
    expect(verifySignature(v.secret, v.body, `t=${v.timestamp}`, at)).toBe(false)
  })

  it("enforces the tolerance window in both directions", () => {
    expect(verifySignature(v.secret, v.body, v.header, { now: v.nowExpired })).toBe(false)
    expect(verifySignature(v.secret, v.body, v.header, { now: v.nowFuture })).toBe(false)
    expect(verifySignature(v.secret, v.body, v.header, { now: v.nowExpired, tolerance: 1000 })).toBe(true)
  })

  it("accepts any valid v1 during rotation and any secret from a list", () => {
    expect(verifySignature(v.secret, v.body, v.rotation.header, at)).toBe(true)
    const header = `t=${v.timestamp},v1=${v.secondSecret.signature}`
    expect(verifySignature([v.secret, v.secondSecret.secret], v.body, header, at)).toBe(true)
    expect(verifySignature([v.secret], v.body, header, at)).toBe(false)
  })

  it("constructs a typed event", () => {
    const event = constructEvent<Payment>(v.secret, v.body, v.header, at)
    expect(event.id).toBe("evt_01J7A9R5VKM4N5P6R7S8T9V0B6")
    expect(event.type).toBe("payment.succeeded")
    expect(event.livemode).toBe(false)
    expect(event.data.object.id).toBe("pay_01J7A9Q0K3M4N5P6R7S8T9V0W1")
    expect(event.data.object.status).toBe("succeeded")
  })

  it("throws with a reason and without the secret", () => {
    const mismatch = (() => {
      try {
        constructEvent(v.secret, v.tamperedBody, v.header, at)
      } catch (e) {
        return e as SignatureVerificationError
      }
      return null
    })()
    expect(mismatch?.reason).toBe("signature_mismatch")
    expect(mismatch?.message).not.toContain(v.secret)
    expect(mismatch?.message).not.toContain(v.signature)
    expect(() => constructEvent(v.secret, v.body, v.header, { now: v.nowExpired })).toThrow(SignatureVerificationError)
    const body = "[1,2,3]"
    expect(() => constructEvent(v.secret, body, sign(v.secret, body, v.timestamp), at)).toThrow(
      SignatureVerificationError,
    )
  })

  it("sign produces the documented header", () => {
    expect(sign(v.secret, v.body, v.timestamp)).toBe(v.header)
  })
})
