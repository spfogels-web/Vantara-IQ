"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setAlertsLive } from "@/lib/alerts-switch";
import { notifyStaff } from "@/lib/notify";

/**
 * Flip the master alerts switch.
 *
 * Staff only, and recorded either way. A control that stops every text going
 * out of the business is one where "who turned this off on Tuesday" is a
 * question somebody will eventually ask.
 */
export async function toggleAlertsLive(on: boolean) {
  const me = await getCurrentUser();
  if (!me || !isStaff(me.role)) return { ok: false as const, error: "Not permitted." };

  const actor = me.name || me.email;
  await setAlertsLive(on, actor);

  // In-app only. Texting to announce that texting was turned off would be a
  // poor joke, and texting to announce it was turned on would be the first
  // message of a programme nobody had checked yet.
  await notifyStaff({
    title: on ? "Job alerts switched on" : "Job alerts switched off",
    detail: on
      ? "Text messages are going out again to everyone who has agreed to them."
      : "No text messages will leave Vantara IQ until this is switched back on.",
    href: "/settings#alerts",
    category: "system",
    tone: on ? "success" : "warning",
    actor,
  }).catch(() => {});

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/**
 * Turn the pre-construction requirement on or off for the whole organisation.
 *
 * ADMIN only. This removes a safety rule from every project and every crew at
 * once, which is a different kind of decision from approving a daily, and it
 * is gated like the other decisions of that kind.
 *
 * Switching it OFF asks for a reason and refuses without one. The reason is
 * kept on the settings row rather than only in the audit log, so the state
 * carries its own explanation: somebody opening Administration in three months
 * sees why it is off and who decided, without going to look for it.
 *
 * It changes no project's `preConStatus`. A job that was never walked still
 * reads NOT_STARTED afterwards, which is the point — this says the requirement
 * does not apply, never that the documentation exists.
 */
export async function setPreConRequired(input: { required: boolean; reason?: string }) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (me.role !== "ADMIN") {
    return { ok: false as const, error: "An admin changes this." };
  }

  const reason = (input.reason ?? "").trim();
  if (!input.required && !reason) {
    return {
      ok: false as const,
      error:
        "Say why pre-construction documentation is being switched off. It stays on the record and on this screen.",
    };
  }

  const existing = await prisma.orgSettings.findFirst({ select: { id: true } });
  if (!existing) {
    return { ok: false as const, error: "This organisation has no settings row yet." };
  }

  await prisma.orgSettings.update({
    where: { id: existing.id },
    data: {
      preConRequired: input.required,
      // Cleared on the way back on, so a stale reason never sits beside a live
      // requirement.
      preConWaivedBy: input.required ? "" : me.name || me.email,
      preConWaivedAt: input.required ? null : new Date(),
      preConWaiverReason: input.required ? "" : reason.slice(0, 500),
    },
  });

  await prisma.accessLog
    .create({
      data: {
        action: "settings.precon.required",
        actorUserId: me.id,
        actorEmail: me.email,
        subjectId: existing.id,
        detail: input.required
          ? "pre-construction documentation required again"
          : `pre-construction requirement switched off — ${reason.slice(0, 400)}`,
      },
    })
    .catch(() => undefined);

  revalidatePath("/settings");
  revalidatePath("/dailies");
  return { ok: true as const };
}
