"use server";

import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { notifyStaff } from "@/lib/notify";

/**
 * Somebody on the public site asking for a demonstration.
 *
 * Unauthenticated by necessity — the whole point is that a stranger can reach
 * it. So it is written to be dull under abuse: it stores what was typed, tells
 * the office, and returns the same answer whatever happens. It never reads
 * anything back, never says whether a company is already known, and never
 * confirms an address exists, so it cannot be used to find out who is
 * evaluating the product or who is already a customer.
 */
export async function requestDemo(input: {
  name: string;
  company: string;
  email: string;
  phone?: string;
  role?: string;
  crews?: string;
  message?: string;
}) {
  const name = input.name.trim();
  const company = input.company.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) return { ok: false as const, error: "Enter your name." };
  if (!company) return { ok: false as const, error: "Enter your company." };
  // Deliberately shallow. A regex that decides what a real address looks like
  // turns away more genuine buyers than it catches typos, and the reply
  // bouncing tells us far more reliably than a pattern ever will.
  if (!email.includes("@") || email.length < 5) {
    return { ok: false as const, error: "Enter an email we can reply to." };
  }

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();

  // A second submission is a second row, not an error. Somebody who fills the
  // form twice has tried twice to reach you, and refusing the second one as a
  // duplicate is the wrong way to treat that.
  const saved = await prisma.demoRequest.create({
    data: {
      name: name.slice(0, 120),
      company: company.slice(0, 160),
      email: email.slice(0, 200),
      phone: (input.phone ?? "").trim().slice(0, 40),
      role: (input.role ?? "").trim().slice(0, 120),
      crews: (input.crews ?? "").trim().slice(0, 40),
      message: (input.message ?? "").trim().slice(0, 2000),
      ip,
      userAgent: (h.get("user-agent") ?? "").slice(0, 300),
    },
    select: { id: true },
  });

  // In-app only. Texting about a website enquiry is not what anybody agreed to
  // receive, and the consent language names operational job messages.
  await notifyStaff({
    title: `Demo request — ${company}`,
    detail: [name, input.role, email, input.phone, input.crews ? `${input.crews} crews` : ""]
      .filter(Boolean)
      .join(" · "),
    href: "/demo-requests",
    category: "system",
    tone: "success",
    actor: company,
  }).catch(() => undefined);

  return { ok: true as const, id: saved.id };
}
