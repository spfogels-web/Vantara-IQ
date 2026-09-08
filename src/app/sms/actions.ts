"use server";

import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { textNewOptIn, toE164 } from "@/lib/sms";
import { SMS_CONSENT_TEXT, WELCOME_MESSAGE } from "@/lib/sms-consent";

/**
 * Record someone agreeing to be texted.
 *
 * Deliberately unauthenticated. The whole reason the campaign was rejected is
 * that the only opt-in lived behind a login, where a carrier reviewing it sees
 * a sign-in page and no consent flow at all. An opt-in nobody can reach is not
 * an opt-in.
 *
 * It writes one thing — a consent record — and reads nothing back out. There
 * is no lookup, no confirmation of whether the number is already known, and no
 * difference in what comes back for a number we have and one we do not, so it
 * cannot be used to find out who Fortitude works with.
 */
export async function recordSmsOptIn(input: {
  name: string;
  company: string;
  phone: string;
  consent: boolean;
}) {
  // Consent has to be given, not assumed. The box ships unticked and this
  // refuses anything that arrives without it.
  if (!input.consent) {
    return { ok: false as const, error: "Tick the box to agree before submitting." };
  }

  const phone = toE164(input.phone);
  if (!phone) {
    return { ok: false as const, error: "Enter a mobile number, including area code." };
  }
  if (!input.name.trim()) {
    return { ok: false as const, error: "Enter your name." };
  }

  const h = await headers();
  // Behind a proxy the first hop is the real client; the rest is our own
  // infrastructure and is worth nothing in an audit.
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();

  await prisma.smsOptIn.create({
    data: {
      phone,
      name: input.name.trim().slice(0, 120),
      company: input.company.trim().slice(0, 160),
      consentText: SMS_CONSENT_TEXT,
      source: "web opt-in page",
      ip,
      userAgent: (h.get("user-agent") ?? "").slice(0, 300),
    },
  });

  // Grant the consent on every record carrying this number.
  //
  // Two bugs lived here. It looked only at CrewContact, so somebody opting in
  // on this page never became textable as a crew or as a staff login — the
  // sending paths read Subcontractor.smsConsentAt and User.smsConsentAt, and
  // neither was touched. And it matched the column exactly, against an E.164
  // number, while the numbers in this database are typed the way people type
  // them: "678-682-5902", "8706374292". The match never succeeded.
  //
  // So it is normalised and it covers all three, which is what applyOptOut
  // already did for STOP. Starting has to be at least as reliable as stopping,
  // or a crew agrees to alerts on this page and then never hears anything.
  //
  // Still no lookup and still nothing read back: the same result is returned
  // for a number we know and one we do not, so this cannot be used to find out
  // who Fortitude works with.
  const grant = { smsConsentAt: new Date(), smsOptOutAt: null };
  const [subs, users, contacts] = await Promise.all([
    prisma.subcontractor.findMany({ select: { id: true, phone: true } }),
    prisma.user.findMany({ select: { id: true, phone: true } }),
    prisma.crewContact.findMany({ select: { id: true, phone: true } }),
  ]);
  const subHit = subs.filter((x) => toE164(x.phone) === phone).map((x) => x.id);
  const userHit = users.filter((x) => toE164(x.phone) === phone).map((x) => x.id);
  const contactHit = contacts.filter((x) => toE164(x.phone) === phone).map((x) => x.id);

  await Promise.all([
    subHit.length ? prisma.subcontractor.updateMany({ where: { id: { in: subHit } }, data: grant }) : null,
    userHit.length
      ? prisma.user.updateMany({
          where: { id: { in: userHit } },
          // The wording as it read today, kept beside the date. This is what an
          // audit asks for and the settings path already stores it.
          data: { ...grant, smsConsentText: SMS_CONSENT_TEXT },
        })
      : null,
    contactHit.length ? prisma.crewContact.updateMany({ where: { id: { in: contactHit } }, data: grant }) : null,
  ]);

  // Best-effort. The consent is recorded either way — a text that fails to
  // send is not a reason to lose the agreement it was confirming.
  await textNewOptIn(phone, WELCOME_MESSAGE).catch(() => undefined);

  return { ok: true as const };
}
