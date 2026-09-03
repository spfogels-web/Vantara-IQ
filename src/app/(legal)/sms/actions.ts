"use server";

import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { toE164 } from "@/lib/sms";
import { SMS_CONSENT_TEXT } from "@/lib/sms-consent";

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

  // A number that had replied STOP and is now opting in again has changed its
  // mind, and that is the one thing that lifts an opt-out.
  await prisma.crewContact.updateMany({
    where: { phone },
    data: { smsConsentAt: new Date(), smsOptOutAt: null },
  });

  return { ok: true as const };
}
