import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { applyOptOut } from "@/lib/sms";
import { notifyStaff } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * Replies from crews. Twilio POSTs here whenever someone texts the number.
 *
 * The only thing this has to get right is opt-out. Carriers stop messages at
 * their end when someone replies STOP, but the obligation to stop sending is
 * ours, and a campaign that keeps trying gets shut down. So STOP is recorded
 * against every record carrying that number before anything else happens.
 *
 * Anything else a crew sends is passed to the office as a notification rather
 * than dropped. A foreman replying "cant make it tomorrow" to a job assignment
 * is doing the reasonable thing, and that should reach a person.
 */

/**
 * Twilio signs every request. Without checking it, this endpoint is a public
 * URL that lets anyone unsubscribe any crew by posting a form.
 */
function signed(request: Request, url: string, params: Record<string, string>): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const given = request.headers.get("x-twilio-signature");
  if (!token || !given) return false;

  // Twilio's scheme: the URL, then every parameter sorted by name and
  // concatenated key-then-value, HMAC-SHA1 with the auth token.
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = crypto.createHmac("sha1", token).update(Buffer.from(payload, "utf-8")).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Twilio expects TwiML back; an empty response means "say nothing". */
const empty = () =>
  new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });

export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = typeof v === "string" ? v : "";

  // The public URL Twilio signed, which is what it hashed — not whatever the
  // proxy rewrote the host to on the way in.
  const url =
    process.env.SMS_WEBHOOK_URL ??
    `https://${request.headers.get("host") ?? ""}/api/sms/inbound`;

  if (!signed(request, url, params)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 403 });
  }

  const from = params.From ?? "";
  const body = (params.Body ?? "").trim();
  const word = body.toUpperCase().replace(/[^A-Z]/g, "");

  // The keywords carriers require us to honour. Twilio also handles these at
  // its end, but our own record has to agree or we will keep queueing sends
  // that are silently dropped.
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(word)) {
    const n = await applyOptOut(from, "STOP");
    await notifyStaff({
      title: "A crew opted out of text alerts",
      detail: `${from} replied ${word}. ${n} crew record${n === 1 ? "" : "s"} updated. They will get no further texts until they reply START.`,
      category: "crew",
      tone: "warning",
    });
    return empty();
  }

  if (["START", "UNSTOP", "YES"].includes(word)) {
    await applyOptOut(from, "START");
    return empty();
  }

  if (word === "HELP" || word === "INFO") {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Vantara IQ job alerts, operated by Fortitude Infrastructure LLC. Call (864) 365-1521 or email sean.fogelson@fortitude-infra.com. Reply STOP to opt out.</Message></Response>',
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  // A real reply from a real person. It goes to the office rather than nowhere.
  if (body) {
    await notifyStaff({
      title: `Text reply from ${from}`,
      detail: body.slice(0, 500),
      category: "crew",
      tone: "info",
    });
  }
  return empty();
}
