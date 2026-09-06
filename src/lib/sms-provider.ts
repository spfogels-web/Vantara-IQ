import "server-only";

import { toE164 } from "@/lib/sms";

/**
 * The one place that knows about a texting provider.
 *
 * Nothing above this file mentions Twilio. The messaging service asks for a
 * send and gets back an id or a reason; swapping provider, or running without
 * one, changes this file and nothing else.
 *
 * It exists because SMS is switched off. The A2P campaign is pending, and a
 * messaging system that only works once a carrier approves a form is a
 * messaging system that does not work. Internal messages go through the same
 * path either way — SMS is an extra delivery on the side of a message that has
 * already been stored.
 */

export interface SmsSendResult {
  ok: boolean;
  /** The provider's own id, which is what makes webhook handling idempotent. */
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SmsProvider {
  readonly name: string;
  /** Whether this provider can actually send right now. */
  ready(): boolean;
  send(toE164: string, body: string): Promise<SmsSendResult>;
}

/**
 * Whether texting is turned on at all.
 *
 * Two conditions, and both have to hold. `SMS_ENABLED` is the switch we own —
 * it stays false until the A2P campaign is approved, and flipping it is the
 * whole deployment. Credentials being present is the other: a switch turned on
 * in an environment with no account configured should not start throwing.
 *
 * Absent the variable, off. A messaging feature that starts texting people
 * because somebody forgot to set something is the failure worth designing out.
 */
export function smsEnabled(): boolean {
  if ((process.env.SMS_ENABLED ?? "").toLowerCase() !== "true") return false;
  return twilio.ready();
}

/** Why it is off, in words a person can act on. */
export function smsDisabledReason(): string | null {
  if ((process.env.SMS_ENABLED ?? "").toLowerCase() !== "true") {
    return "SMS is switched off in this environment (SMS_ENABLED). Messages are kept in Vantara.";
  }
  if (!twilio.ready()) {
    return "Twilio credentials are not set here, so nothing can be texted. Messages are kept in Vantara.";
  }
  return null;
}

const twilio: SmsProvider = {
  name: "twilio",

  ready() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from =
      process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER;
    return Boolean(sid && token && from);
  },

  async send(to: string, body: string): Promise<SmsSendResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const service = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
    const from = process.env.TWILIO_FROM_NUMBER?.trim();

    // The Messaging Service when there is one: under A2P 10DLC that is what
    // says which campaign the traffic belongs to, rather than leaving it to be
    // inferred from the number.
    const sender: Record<string, string> = service
      ? { MessagingServiceSid: service }
      : { From: from ?? "" };

    let res: Response;
    try {
      res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          Body: body,
          ...sender,
          ...(process.env.SMS_STATUS_CALLBACK_URL
            ? { StatusCallback: process.env.SMS_STATUS_CALLBACK_URL }
            : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      return {
        ok: false,
        errorCode: "network",
        errorMessage: e instanceof Error ? e.message.slice(0, 200) : "Request failed",
      };
    }

    const text = await res.text().catch(() => "");
    let json: { sid?: string; status?: string; error_code?: number | null; message?: string } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* Twilio returns JSON; a body that will not parse is itself the error. */
    }

    if (!res.ok) {
      return {
        ok: false,
        errorCode: String(json.error_code ?? res.status),
        errorMessage: (json.message ?? text).slice(0, 300),
      };
    }

    // Accepted is not delivered, and an error code can arrive on a 2xx —
    // 30034 is a number sending outside its campaign's Messaging Service.
    if (json.error_code) {
      return {
        ok: false,
        providerMessageId: json.sid,
        errorCode: String(json.error_code),
        errorMessage: `Twilio error ${json.error_code} (status ${json.status ?? "unknown"})`,
      };
    }

    return { ok: true, providerMessageId: json.sid };
  },
};

/** The provider in use. One export, so callers never choose. */
export const smsProvider: SmsProvider = twilio;

/**
 * Map a provider's own status word onto ours.
 *
 * Provider vocabulary stops here. The rest of the app knows five states and
 * none of them are Twilio's.
 */
export function mapProviderStatus(
  raw: string,
): "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | null {
  switch (raw.toLowerCase()) {
    case "queued":
    case "accepted":
    case "scheduled":
      return "QUEUED";
    case "sending":
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "undelivered":
    case "failed":
    case "canceled":
      return "FAILED";
    default:
      return null;
  }
}

export { toE164 };
