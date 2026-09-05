import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Text messages to crews.
 *
 * A foreman is in a truck. He is not going to open a dashboard to find out he
 * has been moved to a different job, and a locate that expires before anyone
 * reads the email is a hole in the ground next to a live gas main. Text is the
 * only channel that reaches these people, which is exactly why it is also the
 * one with rules attached.
 *
 * Three of those rules are enforced here rather than left to whoever writes
 * the next caller:
 *
 *   - Nothing is sent to a crew who has not consented in writing.
 *   - Nothing is sent to a crew who has replied STOP, ever again, unless they
 *     themselves reply START.
 *   - Every message says how to stop receiving them.
 *
 * A send that is refused is not an error. It returns a reason and the caller
 * carries on — a missing phone number must never be able to fail the thing
 * that was being reported.
 */

export function smsReady(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

/**
 * Put a number in the shape Twilio needs.
 *
 * The three on file are written three different ways — "678-682-5902",
 * "8706374292", "843-925-6970" — because people type phone numbers however
 * they like. Anything that is not a plausible US number comes back null and is
 * not sent to; guessing at a malformed number risks texting a stranger.
 */
export function toE164(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Already E.164 with a country code we are not going to second-guess.
  if ((raw ?? "").trim().startsWith("+") && digits.length >= 11) return `+${digits}`;
  return null;
}

export type SmsResult =
  | { sent: true; sid: string }
  | { sent: false; reason: string };

/** The line carriers look for. Appended once, never twice. */
const OPT_OUT = "Reply STOP to opt out.";

function withOptOut(body: string): string {
  return /reply stop/i.test(body) ? body : `${body} ${OPT_OUT}`;
}

/**
 * Send one message. Twilio's REST API over fetch rather than their SDK — one
 * form POST is not worth a dependency, and this keeps the bundle honest.
 */
async function post(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: withOptOut(body) }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Twilio's own message is far more useful than "send failed" — 21610 is a
    // number that opted out, 21408 is a region not enabled, and so on.
    return { sent: false, reason: `Twilio ${res.status}: ${detail.slice(0, 300)}` };
  }

  const json = (await res.json()) as { sid?: string };
  return { sent: true, sid: json.sid ?? "" };
}

/**
 * Text a subcontractor, if they may be texted.
 *
 * Never throws. The caller is usually reporting something that already
 * happened — a daily approved, a crew assigned — and that must stand whether
 * or not a text got out.
 */
export async function textCrew(
  subcontractorId: string,
  body: string,
): Promise<SmsResult> {
  try {
    if (!smsReady()) return { sent: false, reason: "Twilio isn't configured in this environment." };

    const sub = await prisma.subcontractor.findUnique({
      where: { id: subcontractorId },
      select: { company: true, phone: true, smsConsentAt: true, smsOptOutAt: true },
    });
    if (!sub) return { sent: false, reason: "No such crew." };

    if (sub.smsOptOutAt) return { sent: false, reason: `${sub.company.trim()} replied STOP.` };
    if (!sub.smsConsentAt) {
      return { sent: false, reason: `${sub.company.trim()} hasn't agreed to texts yet.` };
    }

    const to = toE164(sub.phone);
    if (!to) return { sent: false, reason: `${sub.company.trim()} has no usable phone number.` };

    return await post(to, body);
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Send failed." };
  }
}

/**
 * Send to a number we have just taken consent from.
 *
 * Every other send in this file looks up a record and checks consent on it.
 * This one cannot: the public opt-in page takes a phone number from somebody
 * who may not be in the system at all, and the whole point is to confirm to
 * that handset that the box worked.
 *
 * That makes it the one send with no record behind it, so it carries its own
 * guard. The page is unauthenticated — without a limit, anyone could post the
 * form repeatedly and use us to text a number they do not own. One message per
 * number per day is enough to confirm an opt-in and useless as a weapon.
 */
export async function textNewOptIn(phoneE164: string, body: string): Promise<SmsResult> {
  try {
    if (!smsReady()) return { sent: false, reason: "Twilio isn't configured in this environment." };

    const to = toE164(phoneE164);
    if (!to) return { sent: false, reason: "Not a usable number." };

    // A STOP already on file outranks a fresh tick of a box. Somebody who told
    // us to stop and then had their number typed into a public form has not
    // changed their mind.
    const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [optedOut, recent] = await Promise.all([
      prisma.smsOptIn.findFirst({ where: { phone: to, revokedAt: { not: null } }, select: { id: true } }),
      prisma.smsOptIn.count({ where: { phone: to, consentedAt: { gte: day } } }),
    ]);
    if (optedOut) return { sent: false, reason: "That number has opted out." };
    // The consent row for this very submission is already written, so one is
    // expected. More than one means the form is being replayed.
    if (recent > 1) return { sent: false, reason: "Already welcomed today." };

    return await post(to, body);
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Send failed." };
  }
}

/**
 * Text one member of staff.
 *
 * The same three gates as a crew: consent given, no STOP on record, and a
 * number that normalises. Staff are not a special case — the obligation is to
 * the handset, not to the org chart, and a campaign is judged on every number
 * it sends to.
 */
export async function textUser(userId: string, body: string): Promise<SmsResult> {
  try {
    if (!smsReady()) return { sent: false, reason: "Twilio isn't configured in this environment." };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, phone: true, smsConsentAt: true, smsOptOutAt: true },
    });
    if (!user) return { sent: false, reason: "No such user." };

    const who = user.name.trim() || "That user";
    if (user.smsOptOutAt) return { sent: false, reason: `${who} replied STOP.` };
    if (!user.smsConsentAt) return { sent: false, reason: `${who} hasn't agreed to texts yet.` };

    const to = toE164(user.phone);
    if (!to) return { sent: false, reason: `${who} has no usable phone number.` };

    return await post(to, body);
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Send failed." };
  }
}

/**
 * Record a STOP or a START.
 *
 * Matched on the phone number rather than an id, because the person replying
 * is a handset, not a session. Every crew whose number normalises to the same
 * E.164 is updated — the same yard phone can appear on two records, and
 * honouring STOP on only one of them is the kind of thing that gets a campaign
 * shut down.
 */
export async function applyOptOut(from: string, keyword: "STOP" | "START"): Promise<number> {
  const e164 = toE164(from);
  if (!e164) return 0;

  // START clears the opt-out. Consent is not re-granted here: someone who
  // never consented cannot opt back into something they never agreed to.
  const data =
    keyword === "STOP" ? { smsOptOutAt: new Date() } : { smsOptOutAt: null };

  const [subs, users, contacts] = await Promise.all([
    prisma.subcontractor.findMany({ select: { id: true, phone: true } }),
    prisma.user.findMany({ select: { id: true, phone: true } }),
    prisma.crewContact.findMany({ select: { id: true, phone: true } }),
  ]);

  const subHit = subs.filter((s) => toE164(s.phone) === e164).map((s) => s.id);
  const userHit = users.filter((u) => toE164(u.phone) === e164).map((u) => u.id);
  const contactHit = contacts.filter((c) => toE164(c.phone) === e164).map((c) => c.id);

  // Every record carrying this number, not just the first kind we look in. One
  // handset can be a crew owner, a named contact and a staff login at once, and
  // honouring STOP on one of the three is how a campaign gets shut down.
  await Promise.all([
    subHit.length
      ? prisma.subcontractor.updateMany({ where: { id: { in: subHit } }, data })
      : null,
    userHit.length ? prisma.user.updateMany({ where: { id: { in: userHit } }, data }) : null,
    contactHit.length
      ? prisma.crewContact.updateMany({ where: { id: { in: contactHit } }, data })
      : null,
  ]);

  return subHit.length + userHit.length + contactHit.length;
}
