"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notifyStaff } from "@/lib/notify";

/**
 * Turn the assistant on or off for this organisation.
 *
 * One flag, and it is the gate on every outbound model request this product
 * makes — the material-list scan, rate extraction, map reading, the daily
 * importer, both locate assistants and the operations assistant. Each of
 * those sends this organisation's records to a model provider, which is a
 * decision about somebody else's data and not a preference.
 *
 * It had no interface at all. The flag existed, six features depended on it,
 * and the only way to change it was a hand-written database update — which
 * meant a crew hit "The assistant is not enabled for this organisation" with
 * no way for the office to do anything about it.
 *
 * ADMIN only, not staff. Turning this on is the moment company records start
 * leaving the building, and a project manager should not be able to make that
 * call on the business's behalf.
 *
 * Recorded either way, because "who turned this on in March" is a question
 * somebody eventually asks.
 */
export async function setAssistantEnabled(on: boolean) {
  const me = await getCurrentUser();
  if (!me || me.role !== "ADMIN") {
    return { ok: false as const, error: "Only an administrator can change this." };
  }

  const row = await prisma.orgSettings.findFirst({ select: { id: true, isDemo: true } });
  if (!row) {
    return {
      ok: false as const,
      error: "This organisation has no settings row yet, so there is nothing to switch.",
    };
  }

  /**
   * A demonstration organisation may never make an outbound model request,
   * whatever anybody presses.
   *
   * orgSettings computes aiAllowed as `assistantEnabled && !isDemo`, so a demo
   * tenant would stay refused regardless. Saying so here rather than writing a
   * flag that does nothing: a switch that reads "on" while the feature stays
   * off is worse than one that refuses.
   */
  if (row.isDemo && on) {
    return {
      ok: false as const,
      error:
        "This is a demonstration organisation. It makes no outbound model requests, and the assistant cannot be switched on here.",
    };
  }

  await prisma.orgSettings.update({
    where: { id: row.id },
    data: { assistantEnabled: on },
  });

  const actor = me.name || me.email;
  await prisma.accessLog
    .create({
      data: {
        action: "settings.assistant",
        actorUserId: me.id,
        actorEmail: me.email,
        subjectId: row.id,
        detail: `assistant ${on ? "enabled" : "disabled"} by ${actor}`,
      },
    })
    .catch(() => undefined);

  await notifyStaff({
    title: on ? "Assistant switched on" : "Assistant switched off",
    detail: on
      ? `${actor} enabled the assistant. Scanning a material list, reading a map or importing a daily now sends that document to the model provider.`
      : `${actor} disabled the assistant. Nothing is sent to the model provider until it is switched back on.`,
    category: "system",
    tone: on ? "info" : "warning",
  });

  // Every surface that offers a model-backed control reads this.
  revalidatePath("/settings");
  revalidatePath("/projects", "layout");
  revalidatePath("/dailies", "layout");
  return { ok: true as const };
}
