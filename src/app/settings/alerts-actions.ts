"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, isStaff } from "@/lib/auth";
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
