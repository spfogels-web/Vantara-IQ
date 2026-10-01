"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/authz";
import { notifyStaff } from "@/lib/notify";
import { producedByCode, requirementsFor } from "@/lib/billing-readiness";

/**
 * Holding production back from a customer invoice, and letting it go again.
 *
 * Every action here changes whether a quantity can be billed. None of them
 * changes what the crew reported: the daily keeps its footage whatever
 * happens below, because the work was done and a missing photograph does not
 * undo it.
 *
 * Customer billing only. Nothing here reads or writes SubInvoice — what the
 * crew is owed is a separate question and a hold is not an answer to it.
 */

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "ADMIN") return null;
  return me;
}

/** The daily, its project, and the quantity actually reported for a code. */
async function dailyContext(dailyId: string, code: string) {
  const daily = await prisma.daily.findUnique({
    where: { id: dailyId },
    select: { id: true, projectId: true, projectName: true, workDate: true, lineItems: true },
  });
  if (!daily) return null;
  // The same roll-up the invoice filer and the readiness view use. A hold is
  // clamped to this figure, so it has to be the figure they bill against.
  const produced = producedByCode(daily.lineItems).get(code.trim()) ?? 0;
  return { daily, produced };
}

/**
 * Put a quantity on hold pending documentation.
 *
 * The quantity is clamped to what was reported: a hold cannot be raised for
 * more footage than the crew claimed, which would otherwise let a typo park a
 * job's entire billing behind a paperwork request nobody could satisfy.
 */
export async function requestDocumentation(input: {
  dailyId: string;
  code: string;
  /** Omit to hold everything reported for the code. */
  quantity?: number;
  missing?: string[];
  note?: string;
}) {
  const me = await requireAdmin();
  if (!me) return { ok: false as const, error: "Only an administrator can hold billing." };

  const ctx = await dailyContext(input.dailyId, input.code);
  if (!ctx) return { ok: false as const, error: "That daily is gone." };
  if (ctx.produced <= 0) {
    return { ok: false as const, error: "Nothing was reported for that code on this daily." };
  }

  const wanted = input.quantity ?? ctx.produced;
  const quantity = Math.max(0, Math.min(wanted, ctx.produced));
  if (quantity <= 0) return { ok: false as const, error: "Hold a quantity above zero." };

  const rules = requirementsFor(input.code);
  const missing = (input.missing ?? []).filter((m) => m.trim());
  const requirement = rules.map((r) => r.label).join(", ");

  await prisma.billingHold.upsert({
    where: { dailyId_code: { dailyId: input.dailyId, code: input.code } },
    create: {
      dailyId: input.dailyId,
      code: input.code,
      quantity,
      status: "NEEDS_DOCUMENTATION",
      requirement: requirement || "Documentation required before billing",
      missing: missing.length ? missing : rules.flatMap((r) => r.missing),
      raisedBy: me.name || me.email,
      resolutionNote: input.note ?? "",
    },
    update: {
      quantity,
      status: "NEEDS_DOCUMENTATION",
      requirement: requirement || "Documentation required before billing",
      missing: missing.length ? missing : rules.flatMap((r) => r.missing),
      raisedBy: me.name || me.email,
      raisedAt: new Date(),
      // A fresh request clears the previous round rather than reading as
      // though the crew had already answered this one.
      respondedBy: "",
      respondedAt: null,
      responseNote: "",
      resolvedBy: "",
      resolvedAt: null,
      overrideReason: "",
    },
  });

  await notifyStaff({
    title: `Billing held — ${input.code}`,
    detail: `${quantity} on ${ctx.daily.projectName} (${ctx.daily.workDate}) is held pending documentation.`,
    category: "billing",
    tone: "warning",
  });

  revalidatePath("/dailies");
  revalidatePath("/billing-readiness");
  return { ok: true as const };
}

/**
 * The crew saying they have supplied what was asked for.
 *
 * Theirs to call, and only for a job they are on. The evidence itself is
 * uploaded through the existing project evidence path and tagged with the
 * hold; this records that they say it is done and moves it into the office's
 * queue. It does not release the quantity — only the office does that.
 */
export async function submitDocumentation(input: { holdId: string; note?: string }) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };

  const hold = await prisma.billingHold.findUnique({
    where: { id: input.holdId },
    select: { id: true, code: true, status: true, daily: { select: { projectId: true, projectName: true } } },
  });
  if (!hold) return { ok: false as const, error: "That request is gone." };
  if (!hold.daily.projectId) return { ok: false as const, error: "That daily has no project." };

  // The gate. A crew can only answer a request on a job they are assigned to,
  // checked against the database rather than against a rendered button — a
  // hold id typed into the request is refused here.
  try {
    await assertProjectAccess(hold.daily.projectId);
  } catch {
    return { ok: false as const, error: "That isn't your project." };
  }

  if (hold.status === "ACCEPTED" || hold.status === "OVERRIDDEN") {
    return { ok: false as const, error: "That has already been cleared." };
  }

  await prisma.billingHold.update({
    where: { id: hold.id },
    data: {
      status: "CREW_RESPONDED",
      respondedBy: me.name || me.email,
      respondedAt: new Date(),
      responseNote: (input.note ?? "").slice(0, 500),
    },
  });

  await notifyStaff({
    title: `Crew responded — ${hold.code}`,
    detail: `${me.name || me.email} has supplied documentation on ${hold.daily.projectName}.`,
    category: "billing",
    tone: "info",
  });

  revalidatePath("/dailies");
  revalidatePath("/billing-readiness");
  return { ok: true as const };
}

/**
 * The office accepting the documentation, which releases the quantity.
 *
 * Acceptance by a person on purpose. Nothing here inspects a photograph and
 * decides it shows a tick mark — that judgement is not something this
 * application can make, and pretending otherwise would put a number on an
 * invoice that nobody had actually checked.
 */
export async function acceptDocumentation(input: { holdId: string; note?: string }) {
  const me = await requireAdmin();
  if (!me) return { ok: false as const, error: "Only an administrator can accept documentation." };

  const hold = await prisma.billingHold.findUnique({ where: { id: input.holdId } });
  if (!hold) return { ok: false as const, error: "That request is gone." };

  await prisma.billingHold.update({
    where: { id: hold.id },
    data: {
      status: "ACCEPTED",
      resolvedBy: me.name || me.email,
      resolvedAt: new Date(),
      resolutionNote: (input.note ?? "").slice(0, 500),
    },
  });

  revalidatePath("/dailies");
  revalidatePath("/billing-readiness");
  revalidatePath("/invoicing");
  return { ok: true as const };
}

/** Sending it back, with the reason the crew will read. */
export async function rejectDocumentation(input: { holdId: string; reason: string }) {
  const me = await requireAdmin();
  if (!me) return { ok: false as const, error: "Only an administrator can do that." };
  const reason = input.reason.trim();
  if (!reason) return { ok: false as const, error: "Say what is still needed." };

  const hold = await prisma.billingHold.findUnique({ where: { id: input.holdId } });
  if (!hold) return { ok: false as const, error: "That request is gone." };

  await prisma.billingHold.update({
    where: { id: hold.id },
    data: {
      status: "NEEDS_DOCUMENTATION",
      resolutionNote: reason.slice(0, 500),
      resolvedBy: me.name || me.email,
      resolvedAt: new Date(),
      respondedBy: "",
      respondedAt: null,
    },
  });

  revalidatePath("/dailies");
  revalidatePath("/billing-readiness");
  return { ok: true as const };
}

/**
 * Billing it anyway, on somebody's authority, with that recorded.
 *
 * The status it produces says "admin override" rather than "ready to bill",
 * and the original requirement stays on the record. This must never read as
 * though the documentation arrived — the whole value of the audit trail is
 * that a month later somebody can tell the difference between paperwork that
 * was received and paperwork that was waived.
 */
export async function overrideHold(input: { holdId: string; reason: string }) {
  const me = await requireAdmin();
  if (!me) return { ok: false as const, error: "Only an administrator can override." };
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false as const, error: "An override needs a reason. It goes on the record." };
  }

  const hold = await prisma.billingHold.findUnique({ where: { id: input.holdId } });
  if (!hold) return { ok: false as const, error: "That request is gone." };

  await prisma.billingHold.update({
    where: { id: hold.id },
    data: {
      status: "OVERRIDDEN",
      overrideReason: reason.slice(0, 500),
      resolvedBy: me.name || me.email,
      resolvedAt: new Date(),
    },
  });

  await prisma.accessLog
    .create({
      data: {
        action: "billing.override",
        actorUserId: me.id,
        actorEmail: me.email,
        subjectId: hold.id,
        detail: `${hold.code} ${hold.quantity} released without ${hold.requirement || "documentation"} — ${reason}`,
      },
    })
    .catch(() => undefined);

  await notifyStaff({
    title: `Billing override — ${hold.code}`,
    detail: `${me.name || me.email} released ${hold.quantity} without the documentation. Reason: ${reason}`,
    category: "billing",
    tone: "warning",
  });

  revalidatePath("/dailies");
  revalidatePath("/billing-readiness");
  revalidatePath("/invoicing");
  return { ok: true as const };
}

/** Marking a quantity as never billable to the customer at all. */
export async function markNotBillable(input: { dailyId: string; code: string; reason: string }) {
  const me = await requireAdmin();
  if (!me) return { ok: false as const, error: "Only an administrator can do that." };
  const reason = input.reason.trim();
  if (!reason) return { ok: false as const, error: "Say why it is not billable." };

  const ctx = await dailyContext(input.dailyId, input.code);
  if (!ctx) return { ok: false as const, error: "That daily is gone." };

  await prisma.billingHold.upsert({
    where: { dailyId_code: { dailyId: input.dailyId, code: input.code } },
    create: {
      dailyId: input.dailyId,
      code: input.code,
      quantity: ctx.produced,
      status: "NOT_BILLABLE",
      requirement: "Not billable to the customer",
      resolutionNote: reason.slice(0, 500),
      raisedBy: me.name || me.email,
      resolvedBy: me.name || me.email,
      resolvedAt: new Date(),
    },
    update: {
      status: "NOT_BILLABLE",
      quantity: ctx.produced,
      resolutionNote: reason.slice(0, 500),
      resolvedBy: me.name || me.email,
      resolvedAt: new Date(),
    },
  });

  revalidatePath("/dailies");
  revalidatePath("/billing-readiness");
  return { ok: true as const };
}

/**
 * A photograph uploaded to answer a documentation request.
 *
 * The crew names the hold, never the project. The project is looked up from the
 * hold and checked against their assignments here, so there is no field in this
 * payload that could put a file onto somebody else's job — which there would be
 * if this took a projectId the way the general evidence path does.
 *
 * One evidence store: this is an ordinary ProjectPhoto, tagged with the hold.
 * The job's gallery shows it like any other, because it is a photograph of the
 * work, and a parallel table of billing-only photographs would drift from the
 * one people actually look at.
 */
export async function attachHoldEvidence(input: {
  holdId: string;
  url: string;
  mediaType: string;
  sizeBytes: number;
  kind: "PHOTO" | "VIDEO";
  source: "CAMERA" | "LIBRARY";
  capturedAt?: string | null;
  capturedAtSource?: string;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  locationSource?: string;
  caption?: string;
}) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (!input.url.trim()) return { ok: false as const, error: "No file was uploaded." };

  const hold = await prisma.billingHold.findUnique({
    where: { id: input.holdId },
    select: {
      id: true,
      code: true,
      status: true,
      daily: { select: { id: true, projectId: true } },
    },
  });
  if (!hold) return { ok: false as const, error: "That request is gone." };
  if (!hold.daily.projectId) return { ok: false as const, error: "That daily has no project." };

  try {
    await assertProjectAccess(hold.daily.projectId);
  } catch {
    return { ok: false as const, error: "That isn't your project." };
  }

  if (hold.status === "ACCEPTED" || hold.status === "OVERRIDDEN") {
    return { ok: false as const, error: "That has already been cleared." };
  }

  const photo = await prisma.projectPhoto.create({
    data: {
      projectId: hold.daily.projectId,
      billingHoldId: hold.id,
      dailyId: hold.daily.id,
      url: input.url,
      mediaType: input.mediaType || "",
      sizeBytes: Math.max(0, Math.round(input.sizeBytes || 0)),
      kind: input.kind === "VIDEO" ? "VIDEO" : "PHOTO",
      source: input.source === "CAMERA" ? "CAMERA" : "LIBRARY",
      stage: "WORK_RECORD",
      category: "OTHER",
      capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
      capturedAtSource: input.capturedAtSource ?? "",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      accuracyM: input.accuracyM ?? null,
      locationSource: input.locationSource ?? "",
      caption: [hold.code, input.caption?.trim()].filter(Boolean).join(" — "),
      subcontractorId: me.subcontractorId ?? null,
      uploadedBy: me.name || me.email,
      uploadedByUserId: me.id,
    },
    select: { id: true, url: true },
  });

  revalidatePath("/billing-readiness");
  revalidatePath(`/projects/${hold.daily.projectId}`);
  return { ok: true as const, id: photo.id, url: photo.url };
}
