"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/auth";
import { requireUser, requireStaff } from "@/lib/authz";
import {
  MaterialError,
  issueMaterial,
  receiveMaterial,
  recordDamage,
  returnMaterial,
  transferMaterial,
  verifyMaterial,
} from "@/lib/material-custody";
import { notifyStaff } from "@/lib/notify";
import { sendOperationalMessage } from "@/lib/messaging";

/**
 * Every material movement a person can start.
 *
 * Permission is checked here and nowhere else that matters: the buttons a page
 * chooses to draw are a convenience, and a movement is a write. Receiving,
 * issuing, transferring and writing material off are the office's; a crew may
 * count and return what is already in their own custody, because those are the
 * two things a foreman standing at a reel actually needs to do.
 */

const actorOf = (u: { id: string; name: string; email: string }) => ({
  userId: u.id,
  name: u.name || u.email,
});

/** Turn a thrown MaterialError into something a form can show. */
async function guarded<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, data: await fn() };
  } catch (e) {
    if (e instanceof MaterialError) return { ok: false as const, error: e.message };
    // Anything else is a fault rather than a refusal, and saying "failed" to
    // somebody holding a reel is useless. The message goes through.
    return {
      ok: false as const,
      error: e instanceof Error ? e.message.slice(0, 200) : "That didn't go through.",
    };
  }
}

export async function receiveAction(input: {
  code: string;
  description?: string;
  category?: string;
  unit?: string;
  quantity: number;
  reelNumber?: string;
  manufacturer?: string;
  supplier?: string;
  poNumber?: string;
  locationLabel?: string;
  projectId?: string;
  notes?: string;
  photos?: string[];
}) {
  const me = await requireStaff();
  const res = await guarded(() =>
    receiveMaterial({ ...input, projectId: input.projectId || null, photos: input.photos, actor: actorOf(me) }),
  );
  if (res.ok) revalidatePath("/materials");
  return res;
}

export async function issueAction(input: {
  instanceId?: string;
  code?: string;
  quantity: number;
  unit?: string;
  projectId?: string;
  custodianSubId?: string;
  crew?: string;
  personName: string;
  personRole?: string;
  vehicle?: string;
  trailer?: string;
  destination?: string;
  notes?: string;
  photos?: string[];
  acknowledgedBy?: string;
}) {
  const me = await requireStaff();
  const res = await guarded(() => issueMaterial({ ...input, photos: input.photos, actor: actorOf(me) }));

  if (res.ok && input.instanceId) {
    // Tell the crew what they now hold, in the thread that belongs to them.
    // Best-effort: a message that will not send must never fail a checkout.
    const inst = await prisma.materialInstance.findUnique({
      where: { id: input.instanceId },
      select: { code: true, reelNumber: true, custodianSubId: true, projectId: true },
    });
    if (inst?.custodianSubId) {
      const sub = await prisma.subcontractor.findUnique({
        where: { id: inst.custodianSubId },
        select: { company: true },
      });
      await sendOperationalMessage({
        context: { type: "SUBCONTRACTOR", subcontractorId: inst.custodianSubId, projectId: inst.projectId },
        title: sub?.company ?? "Crew",
        subcontractorSeat: inst.custodianSubId,
        actor: me.name || me.email,
        body: `${inst.code}${inst.reelNumber ? ` reel ${inst.reelNumber}` : ""} has been issued to ${input.crew || "your crew"} — ${input.quantity.toLocaleString()} ${input.unit ?? ""} picked up by ${input.personName}. Count it before you start and tell us if the footage does not match.`,
      }).catch(() => undefined);
    }
    revalidatePath("/materials");
    revalidatePath("/messages");
  }
  return res;
}

export async function transferAction(input: {
  instanceId: string;
  quantity: number;
  toSubId?: string;
  toCrew?: string;
  toPerson: string;
  toLocation?: string;
  vehicle?: string;
  notes?: string;
  photos?: string[];
}) {
  const me = await requireStaff();
  const res = await guarded(() => transferMaterial({ ...input, photos: input.photos, actor: actorOf(me) }));
  if (res.ok) revalidatePath("/materials");
  return res;
}

/**
 * Return material, and raise the follow-up when it does not balance.
 *
 * A crew may return what they are holding. The variance is calculated against
 * the ledger rather than against anything they type, and a gap outside
 * tolerance becomes a task on somebody's list rather than a number that
 * quietly disappeared into the yard.
 */
export async function returnAction(input: {
  instanceId: string;
  actualQty: number;
  varianceReason?: string;
  comment?: string;
  location?: string;
  photos?: string[];
}) {
  const me = await requireUser();
  const inst = await prisma.materialInstance.findUnique({
    where: { id: input.instanceId },
    select: { custodianSubId: true, code: true, reelNumber: true, projectId: true },
  });
  if (!inst) return { ok: false as const, error: "That material record no longer exists." };

  // Staff, or the company actually holding it. Nobody else returns a reel.
  if (!isStaff(me.role) && inst.custodianSubId !== me.subcontractorId) {
    return { ok: false as const, error: "That material is not in your custody." };
  }

  const res = await guarded(() =>
    returnMaterial({ ...input, photos: input.photos, actor: actorOf(me) }),
  );
  if (!res.ok) return res;

  if (res.data.flagged) {
    const label = `${inst.code}${inst.reelNumber ? ` reel ${inst.reelNumber}` : ""}`;
    await prisma.task
      .create({
        data: {
          title: `Reconcile ${label} — ${res.data.variance > 0 ? "+" : ""}${res.data.variance} on return`,
          detail: `Returned quantity did not match the ledger. Reason given: ${input.varianceReason || "none"}. ${input.comment ?? ""}`.trim(),
          category: "MATERIALS",
          priority: "HIGH",
          projectId: inst.projectId,
          assigneeSubId: inst.custodianSubId,
          createdByEmail: me.email,
        },
      })
      .catch(() => undefined);
    await notifyStaff({
      title: `Material variance on ${label}`,
      detail: `${res.data.variance > 0 ? "+" : ""}${res.data.variance} against the ledger on return.`,
      category: "system",
      tone: "warning",
      href: "/materials",
    }).catch(() => undefined);
    revalidatePath("/tasks");
  }

  revalidatePath("/materials");
  return res;
}

/** A physical count. A crew may count what they hold. */
export async function verifyAction(input: {
  instanceId: string;
  actualQty: number;
  varianceReason?: string;
  comment?: string;
  photos?: string[];
}) {
  const me = await requireUser();
  const inst = await prisma.materialInstance.findUnique({
    where: { id: input.instanceId },
    select: { custodianSubId: true, code: true, reelNumber: true, projectId: true },
  });
  if (!inst) return { ok: false as const, error: "That material record no longer exists." };
  if (!isStaff(me.role) && inst.custodianSubId !== me.subcontractorId) {
    return { ok: false as const, error: "That material is not in your custody." };
  }

  const res = await guarded(() => verifyMaterial({ ...input, photos: input.photos, actor: actorOf(me) }));
  if (res.ok && res.data.flagged) {
    await notifyStaff({
      title: `Count variance on ${inst.code}${inst.reelNumber ? ` reel ${inst.reelNumber}` : ""}`,
      detail: `${res.data.variance > 0 ? "+" : ""}${res.data.variance} against the ledger.`,
      category: "system",
      tone: "warning",
      href: "/materials",
    }).catch(() => undefined);
  }
  if (res.ok) revalidatePath("/materials");
  return res;
}

export async function damageAction(input: {
  instanceId: string;
  quantity: number;
  damageType?: string;
  description: string;
  disposition?: string;
  photos?: string[];
}) {
  // Writing material off is the office's call. A crew reports damage; they do
  // not remove it from the books.
  const me = await requireStaff();
  const res = await guarded(() => recordDamage({ ...input, photos: input.photos, actor: actorOf(me) }));
  if (res.ok) revalidatePath("/materials");
  return res;
}

/**
 * Point a crew's production at a reel.
 *
 * Once set, an approved daily consumes off this reel without anybody typing
 * the footage a second time.
 */
export async function assignActiveReel(input: {
  instanceId: string;
  crew: string;
  projectId?: string;
}) {
  await requireStaff();
  await prisma.materialInstance.update({
    where: { id: input.instanceId },
    data: { crew: input.crew, projectId: input.projectId || undefined },
  });
  revalidatePath("/materials");
  return { ok: true as const };
}
