import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { handleDeliveryCallback } from "@/lib/sms-inbound";

export const runtime = "nodejs";

/**
 * Delivery receipts from the provider.
 *
 * Twilio posts here as a message moves from queued to sent to delivered, or
 * fails. Separate from the inbound route because they are different events
 * with different bodies — one is somebody talking, this is a machine reporting
 * on a message we already sent.
 *
 * Signed, for the same reason the inbound one is: without the check this is a
 * public URL that lets anyone mark any message delivered.
 */
function signed(request: Request, url: string, params: Record<string, string>): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const given = request.headers.get("x-twilio-signature");
  if (!token || !given) return false;

  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = crypto
    .createHmac("sha1", token)
    .update(Buffer.from(payload, "utf-8"))
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = typeof v === "string" ? v : "";

  const url =
    process.env.SMS_STATUS_CALLBACK_URL ??
    `https://${request.headers.get("host") ?? ""}/api/sms/status`;

  if (!signed(request, url, params)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 403 });
  }

  await handleDeliveryCallback({
    providerMessageId: params.MessageSid ?? params.SmsSid ?? "",
    status: params.MessageStatus ?? params.SmsStatus ?? "",
    errorCode: params.ErrorCode ?? "",
  }).catch(() => undefined);

  // Twilio wants a 2xx and nothing else. Anything we could not match is not
  // its problem to retry — it is ours to look at in the event log.
  return new NextResponse(null, { status: 204 });
}
