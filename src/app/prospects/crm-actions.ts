"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/authz";
import { notifyStaff } from "@/lib/notify";
import { findOrCreateConversation } from "@/lib/messaging";

/**
 * Everything the CRM can change about a prospect.
 *
 * Staff only, every one. A prospect record holds lost reasons, rate
 * evaluations and internal judgements about companies we work with, and none
 * of that is a crew's to read.
 *
 * Each change that matters writes an activity. The timeline is the product —
 * a CRM where somebody changed the stage and nobody can see who or when is a
 * spreadsheet with rounded corners.
 */

const QUAL_ITEMS = [
  "company",
  "insurance",
  "w9",
  "safety",
  "references",
  "equipment",
  "rates",
  "geography",
  "availability",
  "agreement",
] as const;

async function log(prospectId: string, kind: string, body: string, author: string) {
  await prisma.prospectActivity
    .create({ data: { prospectId, kind, body: body.slice(0, 500), author } })
    .catch(() => undefined);
}

const actor = (u: { name: string; email: string }) => u.name || u.email;

/* ------------------------------------------------------------------ *
 * The pipeline.
 * ------------------------------------------------------------------ */

/**
 * Move a prospect along.
 *
 * The stage clock restarts, which is what makes "in discussion 31 days"
 * possible. Closing one asks for a reason, and the reason survives a later
 * reactivation — why it went cold is exactly what the next person needs.
 */
export async function setStage(input: {
  id: string;
  stage: string;
  reason?: string;
  note?: string;
}) {
  const me = await requireStaff();
  const before = await prisma.prospect.findUnique({
    where: { id: input.id },
    select: { stage: true, name: true },
  });
  if (!before) return { ok: false as const, error: "Prospect not found." };
  if (before.stage === input.stage) return { ok: true as const };

  const closing = ["LOST", "DORMANT", "DO_NOT_USE"].includes(input.stage);
  if (closing && !input.reason) {
    return { ok: false as const, error: "Pick a reason before closing this one out." };
  }

  await prisma.prospect.update({
    where: { id: input.id },
    data: {
      stage: input.stage as never,
      stageEnteredAt: new Date(),
      ...(closing ? { closedReason: input.reason ?? "", closedNote: input.note ?? "" } : {}),
    },
  });

  const words = (s: string) => s.replace(/_/g, " ").toLowerCase();
  await log(
    input.id,
    "stage",
    closing
      ? `Moved to ${words(input.stage)} — ${input.reason}${input.note ? `. ${input.note}` : ""}`
      : `Moved from ${words(before.stage)} to ${words(input.stage)}`,
    actor(me),
  );

  if (input.stage === "READY_TO_ONBOARD") {
    await notifyStaff({
      title: `${before.name} is ready to onboard`,
      detail: "Prequalification is far enough along to start the vendor packet.",
      category: "crew",
      tone: "success",
      href: "/prospects",
    }).catch(() => undefined);
  }

  revalidatePath("/prospects");
  return { ok: true as const };
}

/** Put it back in play, keeping why it stopped. */
export async function reactivate(id: string) {
  const me = await requireStaff();
  const p = await prisma.prospect.findUnique({
    where: { id },
    select: { closedReason: true },
  });
  await prisma.prospect.update({
    where: { id },
    data: { stage: "CONTACTED", stageEnteredAt: new Date() },
  });
  await log(
    id,
    "stage",
    `Reactivated${p?.closedReason ? ` — was closed as ${p.closedReason}` : ""}`,
    actor(me),
  );
  revalidatePath("/prospects");
  return { ok: true as const };
}

export async function setOwner(id: string, ownerUserId: string) {
  const me = await requireStaff();
  const who = ownerUserId
    ? await prisma.user.findUnique({ where: { id: ownerUserId }, select: { name: true, email: true } })
    : null;
  await prisma.prospect.update({
    where: { id },
    data: { ownerUserId: ownerUserId || null, owner: who ? actor(who) : "" },
  });
  await log(id, "note", `Owner set to ${who ? actor(who) : "nobody"}`, actor(me));
  revalidatePath("/prospects");
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * Touches.
 * ------------------------------------------------------------------ */

export async function addNote(id: string, body: string) {
  const me = await requireStaff();
  if (!body.trim()) return { ok: false as const, error: "Write something first." };
  await log(id, "note", body, actor(me));
  revalidatePath("/prospects");
  return { ok: true as const };
}

/**
 * Log a call that already happened.
 *
 * No telephony here — this records what a person did on their own phone, which
 * is what actually happens. The shape matches what an integration would write
 * later, so the timeline does not have to change when one arrives.
 */
export async function logCall(input: {
  id: string;
  direction: string;
  minutes?: number;
  outcome: string;
  notes?: string;
}) {
  const me = await requireStaff();
  const bits = [
    input.direction === "outbound" ? "Called them" : "They called",
    input.minutes ? `${input.minutes} min` : "",
    input.outcome,
    input.notes,
  ].filter(Boolean);
  await log(input.id, "call", bits.join(" · "), actor(me));
  await prisma.prospect.update({
    where: { id: input.id },
    data: { lastContact: new Date().toISOString().slice(0, 10) },
  });
  revalidatePath("/prospects");
  return { ok: true as const };
}

/**
 * Set the next thing somebody has to do.
 *
 * Written on the prospect and raised as a real task, rather than kept in a
 * private to-do list the rest of the app cannot see. A follow-up nobody else
 * can find is a follow-up that gets missed.
 */
export async function setFollowUp(input: {
  id: string;
  action: string;
  due: string;
  priority?: string;
  createTask?: boolean;
}) {
  const me = await requireStaff();
  const p = await prisma.prospect.findUnique({
    where: { id: input.id },
    select: { name: true, ownerUserId: true },
  });
  if (!p) return { ok: false as const, error: "Prospect not found." };
  if (input.due && !/^\d{4}-\d{2}-\d{2}$/.test(input.due)) {
    return { ok: false as const, error: "Enter the date as YYYY-MM-DD." };
  }

  await prisma.prospect.update({
    where: { id: input.id },
    data: { nextStep: input.action.slice(0, 200), nextStepDue: input.due },
  });

  if (input.createTask !== false) {
    await prisma.task
      .create({
        data: {
          title: `${input.action} — ${p.name}`,
          detail: `Prospect follow-up for ${p.name}.`,
          category: "ADMIN",
          priority: (input.priority ?? "NORMAL") as never,
          dueDate: input.due,
          assigneeUserId: p.ownerUserId,
          createdByEmail: me.email,
        },
      })
      .catch(() => undefined);
    revalidatePath("/tasks");
  }

  await log(input.id, "note", `Next step: ${input.action}${input.due ? ` by ${input.due}` : ""}`, actor(me));
  revalidatePath("/prospects");
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * The structured record.
 * ------------------------------------------------------------------ */

export async function addContact(input: {
  id: string;
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  primary?: boolean;
}) {
  const me = await requireStaff();
  if (!input.name.trim()) return { ok: false as const, error: "Give the contact a name." };
  if (input.primary) {
    await prisma.prospectContact.updateMany({
      where: { prospectId: input.id },
      data: { primary: false },
    });
  }
  await prisma.prospectContact.create({
    data: {
      prospectId: input.id,
      name: input.name.trim(),
      title: input.title ?? "",
      phone: input.phone ?? "",
      email: input.email ?? "",
      primary: Boolean(input.primary),
    },
  });
  await log(input.id, "note", `Added contact ${input.name}${input.title ? ` (${input.title})` : ""}`, actor(me));
  revalidatePath("/prospects");
  return { ok: true as const };
}

export async function addEquipment(input: {
  id: string;
  category: string;
  manufacturer?: string;
  model?: string;
  quantity?: number;
  ownership?: string;
}) {
  const me = await requireStaff();
  await prisma.prospectEquipment.create({
    data: {
      prospectId: input.id,
      category: input.category,
      manufacturer: input.manufacturer ?? "",
      model: input.model ?? "",
      quantity: Math.max(1, Math.round(input.quantity ?? 1)),
      ownership: input.ownership ?? "owned",
    },
  });
  await log(
    input.id,
    "note",
    `Equipment: ${[input.quantity ? `${input.quantity}x` : "", input.manufacturer, input.model, input.category].filter(Boolean).join(" ")}`,
    actor(me),
  );
  revalidatePath("/prospects");
  return { ok: true as const };
}

export async function removeEquipment(equipmentId: string) {
  await requireStaff();
  await prisma.prospectEquipment.delete({ where: { id: equipmentId } });
  revalidatePath("/prospects");
  return { ok: true as const };
}

export async function addRate(input: {
  id: string;
  code: string;
  rate: number;
  unit?: string;
  description?: string;
}) {
  const me = await requireStaff();
  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false as const, error: "Enter the unit code." };
  await prisma.prospectRate.upsert({
    where: { prospectId_code: { prospectId: input.id, code } },
    create: {
      prospectId: input.id,
      code,
      rate: input.rate,
      unit: input.unit ?? "ft",
      description: input.description ?? "",
    },
    update: { rate: input.rate, unit: input.unit ?? "ft" },
  });
  await log(input.id, "note", `Rate ${code} at ${input.rate} / ${input.unit ?? "ft"}`, actor(me));
  revalidatePath("/prospects");
  return { ok: true as const };
}

/** Availability, appended rather than overwritten. */
export async function setAvailability(input: {
  id: string;
  status: string;
  crews?: number;
  fromDate?: string;
  note?: string;
}) {
  const me = await requireStaff();
  await prisma.$transaction([
    prisma.prospect.update({
      where: { id: input.id },
      data: {
        availability: input.status as never,
        availableCrews: Math.max(0, Math.round(input.crews ?? 0)),
        earliestStart: input.fromDate ?? "",
      },
    }),
    prisma.prospectAvailabilityEntry.create({
      data: {
        prospectId: input.id,
        status: input.status as never,
        crews: Math.max(0, Math.round(input.crews ?? 0)),
        fromDate: input.fromDate ?? "",
        note: input.note ?? "",
        recordedBy: actor(me),
      },
    }),
  ]);
  await log(
    input.id,
    "note",
    `Availability: ${input.status.replace(/_/g, " ").toLowerCase()}${input.crews ? ` · ${input.crews} crews` : ""}${input.fromDate ? ` from ${input.fromDate}` : ""}`,
    actor(me),
  );
  revalidatePath("/prospects");
  return { ok: true as const };
}

export async function setQualification(input: { id: string; item: string; status: string; note?: string }) {
  const me = await requireStaff();
  await prisma.prospectQualification.upsert({
    where: { prospectId_item: { prospectId: input.id, item: input.item } },
    create: {
      prospectId: input.id,
      item: input.item,
      status: input.status,
      note: input.note ?? "",
      updatedBy: actor(me),
    },
    update: { status: input.status, note: input.note ?? "", updatedBy: actor(me) },
  });
  await log(input.id, "note", `${input.item} marked ${input.status}`, actor(me));
  revalidatePath("/prospects");
  return { ok: true as const };
}

/** Lay out the standard checklist so a new crew has something to work down. */
export async function seedQualification(id: string) {
  await requireStaff();
  await prisma.prospectQualification.createMany({
    data: QUAL_ITEMS.map((item) => ({ prospectId: id, item })),
    skipDuplicates: true,
  });
  revalidatePath("/prospects");
  return { ok: true as const };
}

export async function addOpportunity(input: {
  id: string;
  name: string;
  market?: string;
  estimatedValue?: number;
  bidDue?: string;
}) {
  const me = await requireStaff();
  if (!input.name.trim()) return { ok: false as const, error: "Give the opportunity a name." };
  await prisma.prospectOpportunity.create({
    data: {
      prospectId: input.id,
      name: input.name.trim(),
      market: input.market ?? "",
      estimatedValue: input.estimatedValue ?? 0,
      bidDue: input.bidDue ?? "",
      owner: actor(me),
    },
  });
  await log(input.id, "note", `Opportunity opened: ${input.name}`, actor(me));
  revalidatePath("/prospects");
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * Becoming a real crew.
 * ------------------------------------------------------------------ */

/**
 * Promote a crew prospect into the subcontractor roster.
 *
 * Checks for an existing company by name first. Creating a second
 * "Bates Underground LLC" because somebody typed it twice is the failure this
 * guards against — the prospect links to the existing one instead.
 *
 * The prospect is never deleted. It becomes the history of how the
 * relationship started, which is the part nobody can reconstruct later.
 */
export async function convertToSubcontractor(id: string, opts?: { linkExistingId?: string }) {
  const me = await requireStaff();
  const p = await prisma.prospect.findUnique({
    where: { id },
    include: { contacts: true, equipmentItems: true, rates: true },
  });
  if (!p) return { ok: false as const, error: "Prospect not found." };
  if (p.convertedSubcontractorId) {
    return { ok: false as const, error: "This one has already been converted." };
  }

  const existing = opts?.linkExistingId
    ? await prisma.subcontractor.findUnique({ where: { id: opts.linkExistingId }, select: { id: true, company: true } })
    : await prisma.subcontractor.findFirst({
        where: { company: { equals: p.name.trim(), mode: "insensitive" } },
        select: { id: true, company: true },
      });

  // A match nobody asked us to link is a question, not a decision.
  if (existing && !opts?.linkExistingId) {
    return {
      ok: false as const,
      duplicate: true as const,
      existingId: existing.id,
      error: `${existing.company} is already on the subcontractor roster. Link this prospect to it, or cancel.`,
    };
  }

  const sub =
    existing ??
    (await prisma.subcontractor.create({
      data: {
        company: p.name.trim(),
        lead: p.contacts.find((c) => c.primary)?.name || p.contactName,
        email: p.email,
        phone: p.phone,
        location: [p.city, p.homeState].filter(Boolean).join(", "),
        trades: p.trades,
        state: "INVITED",
      },
      select: { id: true, company: true },
    }));

  await prisma.prospect.update({
    where: { id },
    data: {
      convertedSubcontractorId: sub.id,
      convertedAt: new Date(),
      stage: "WON",
      stageEnteredAt: new Date(),
    },
  });

  await log(
    id,
    "stage",
    existing
      ? `Linked to the existing subcontractor record for ${sub.company}`
      : `Converted to a subcontractor — onboarding can start`,
    actor(me),
  );
  await notifyStaff({
    title: `${p.name} moved to subcontractors`,
    detail: existing ? "Linked to an existing record." : "A new vendor packet is waiting.",
    category: "crew",
    tone: "success",
    href: "/subcontractors",
  }).catch(() => undefined);

  revalidatePath("/prospects");
  revalidatePath("/subcontractors");
  return { ok: true as const, subcontractorId: sub.id, linked: Boolean(existing) };
}

/** Open the thread for a prospect, so a conversation has somewhere to live. */
export async function messageProspect(id: string) {
  const me = await requireStaff();
  const p = await prisma.prospect.findUnique({
    where: { id },
    select: { name: true, convertedSubcontractorId: true },
  });
  if (!p) return { ok: false as const, error: "Prospect not found." };

  const convo = await findOrCreateConversation(
    { type: p.convertedSubcontractorId ? "SUBCONTRACTOR" : "DIRECT", subcontractorId: p.convertedSubcontractorId },
    {
      title: p.name,
      subject: "Prospect",
      createdByUserId: me.id,
      actor: actor(me),
      userIds: [me.id],
      subcontractorSeat: p.convertedSubcontractorId,
    },
  );
  await log(id, "note", "Opened a conversation", actor(me));
  revalidatePath("/prospects");
  return { ok: true as const, conversationId: convo.id };
}

/**
 * Likely duplicates of something being typed in.
 *
 * Name, phone, email. Shown to a person to decide — never merged, because a
 * merge that guesses wrong destroys two histories at once.
 */
export async function findDuplicates(input: { name: string; phone?: string; email?: string }) {
  await requireStaff();
  const name = input.name.trim();
  if (name.length < 3) return { ok: true as const, matches: [] };

  const matches = await prisma.prospect.findMany({
    where: {
      OR: [
        { name: { contains: name, mode: "insensitive" } },
        ...(input.phone?.trim() ? [{ phone: input.phone.trim() }] : []),
        ...(input.email?.trim() ? [{ email: { equals: input.email.trim(), mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true, name: true, kind: true, stage: true, city: true, homeState: true, contactName: true },
    take: 5,
  });
  return { ok: true as const, matches };
}
