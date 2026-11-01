// NestJS controller for PaySafe webhooks. Enable raw bodies in main.ts:
//   const app = await NestFactory.create(AppModule, { rawBody: true })
import { BadRequestException, Controller, Headers, Post, Req } from "@nestjs/common"
import type { RawBodyRequest } from "@nestjs/common"
import type { Request } from "express"
import { SignatureVerificationError, constructEvent, type Payment } from "paysafe-tz"

@Controller("paysafe")
export class PaySafeWebhookController {
  private readonly secret = process.env.PAYSAFE_WEBHOOK_SECRET ?? ""

  @Post("webhook")
  handle(@Req() req: RawBodyRequest<Request>, @Headers("paysafe-signature") signature?: string): string {
    let event
    try {
      event = constructEvent<Payment>(this.secret, req.rawBody ?? Buffer.alloc(0), signature)
    } catch (error) {
      if (error instanceof SignatureVerificationError) throw new BadRequestException("invalid signature")
      throw error
    }
    if (event.type === "payment.succeeded") {
      // Deduplicate on event.id, then mark the order identified by event.data.object.reference as paid.
    }
    return "ok"
  }
}
