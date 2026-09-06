"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { notifyStaff } from "@/lib/notify";
import { providerFor, DEFAULT_PROVIDER } from "@/lib/locate-providers";
import type { ProviderTicket } from "@/lib/locate-providers";
import { readiness, type LocateRule } from "@/lib/locate-readiness";
import { todayIn, zoneForState } from "@/data/locates-ops";

/**
 * Everything that writes to the locate board.
 *
 * The one rule the whole file is built around: a lookup that did not succeed
 * never improves a ticket. A failed check writes a check row saying it failed
 * and leaves the ticket exactly as it was, because the alternative — a ticket
 * that quietly reads "no responses" after a timeout — is a ticket that reads as
 * unworkable when it was clear, or worse, one whose stale green is trusted.
 */

async function requireStaff() {
  const me = await getCurrentUser();
  if (!me || !isStaff(me.role)) throw new Error("Not permitted.");
  return me;
}

/** Manual refresh cooldown. Long enough to stop a button being hammered. */
const COOLDOWN_MS = 3 * 60 * 1000;

function hash(s: string) {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------------ *
 * Readiness, written down
 * ------------------------------------------------------------------ */

/**
 * Recompute a ticket's readiness and record what moved.
 *
 * The stored columns exist so the scheduler and the alerts have something to
 * compare against — a change cannot be detected against a value that is only
 * ever derived on read. The board still recomputes on render, because the clock
 * moves without anybody writing to the database.
 */
async function syncReadiness(
  ticketId: string,
  opts: { checkId?: string; actor?: string; lookupFailed?: boolean } = {},
): Promise<{ changes: number }> {
  const t = await prisma.locateTicket.findUnique({
    where: { id: ticketId },
    include: {
      responses: { select: { member: true, code: true, status: true } },
      contractorLocates: { select: { utilityName: true, status: true } },
      project: { select: { locateRules: true } },
    },
  });
  if (!t) return { changes: 0 };

  const rules: LocateRule[] = ((t.project?.locateRules ?? []) as {
    utilityName: string;
    utilityCode: string;
    performedBy: string;
    blocks811Readiness: boolean;
    blocksFieldReadiness: boolean;
  }[]).map((r) => ({
    utilityName: r.utilityName,
    utilityCode: r.utilityCode,
    performedBy: r.performedBy as LocateRule["performedBy"],
    blocks811Readiness: r.blocks811Readiness,
    blocksFieldReadiness: r.blocksFieldReadiness,
  }));

  const r = readiness({
    ticket: t,
    responses: t.responses,
    rules,
    contractorLocates: t.contractorLocates.map((c) => ({
      utilityName: c.utilityName,
      status: c.status,
    })),
    lookupFailed: opts.lookupFailed,
    today: todayIn(zoneForState(t.state)),
  });

  const moved: {
    kind: "EXTERNAL_READINESS_CHANGED" | "FIELD_READINESS_CHANGED" | "LIFECYCLE_CHANGED";
    subject: string;
    fromValue: string;
    toValue: string;
    summary: string;
  }[] = [];

  if (t.externalReadiness !== r.external) {
    moved.push({
      kind: "EXTERNAL_READINESS_CHANGED",
      subject: "811 status",
      fromValue: t.externalReadiness,
      toValue: r.external,
      summary: `811 status: ${t.externalReadiness} → ${r.external}`,
    });
  }
  if (t.fieldReadiness !== r.field) {
    moved.push({
      kind: "FIELD_READINESS_CHANGED",
      subject: "Field status",
      fromValue: t.fieldReadiness,
      toValue: r.field,
      summary: `Field status: ${t.fieldReadiness} → ${r.field}`,
    });
  }
  if (t.lifecycle !== r.lifecycle) {
    moved.push({
      kind: "LIFECYCLE_CHANGED",
      subject: "Lifecycle",
      fromValue: t.lifecycle,
      toValue: r.lifecycle,
      summary: `Ticket ${r.lifecycle.toLowerCase()}`,
    });
  }

  await prisma.locateTicket.update({
    where: { id: ticketId },
    data: {
      externalReadiness: r.external,
      fieldReadiness: r.field,
      lifecycle: r.lifecycle,
      blockingReason: r.blockingReason,
      ...(moved.length ? { lastChangedAt: new Date() } : {}),
      // A ticket that has run out or been withdrawn stops being polled. Nobody
      // has to remember to switch it off.
      ...(r.lifecycle === "EXPIRED" || r.lifecycle === "CANCELLED" || r.lifecycle === "COMPLETED"
        ? { monitoringEnabled: false }
        : {}),
    },
  });

  for (const m of moved) {
    await prisma.locateTicketChange.create({
      data: { ticketId, checkId: opts.checkId ?? null, actor: opts.actor ?? "", ...m },
    });
  }

  // The two transitions worth interrupting somebody for.
  const label = `${t.number}${t.street ? ` · ${t.street}` : ""}`;
  if (moved.some((m) => m.kind === "FIELD_READINESS_CHANGED" && m.toValue === "FIELD_READY")) {
    await notifyStaff({
      title: "Field ready",
      detail: `${label} — ${r.blockingReason}`,
      href: `/locates/${ticketId}`,
      category: "compliance",
      tone: "success",
    }).catch(() => {});
  }
  if (moved.some((m) => m.kind === "FIELD_READINESS_CHANGED" && m.toValue === "CONTRACTOR_LOCATE_ISSUE")) {
    await notifyStaff({
      title: "Locate issue",
      detail: `${label} — ${r.blockingReason}`,
      href: `/locates/${ticketId}`,
      category: "compliance",
      tone: "critical",
    }).catch(() => {});
  }

  return { changes: moved.length };
}

/* ------------------------------------------------------------------ *
 * Writing a provider result onto a ticket
 * ------------------------------------------------------------------ */

/**
 * Apply a parsed ticket, recording each field that moved.
 *
 * Fields the source did not state are left alone. This is the same rule the
 * paste importer needed: a positive-response screen carries the responses and
 * almost nothing else, and writing its blanks over a ticket took the street and
 * the expiry date out.
 */
async function applyTicket(
  ticketId: string,
  parsed: ProviderTicket,
  opts: { checkId?: string; actor?: string } = {},
): Promise<number> {
  const before = await prisma.locateTicket.findUnique({
    where: { id: ticketId },
    include: { responses: true },
  });
  if (!before) return 0;

  let changes = 0;
  const note = async (
    kind: "EXPIRATION_CHANGED" | "EFFECTIVE_DATE_CHANGED" | "ADDRESS_CHANGED" | "UTILITY_RESPONSE_CHANGED" | "TICKET_UPDATED",
    subject: string,
    from: string,
    to: string,
    summary: string,
  ) => {
    await prisma.locateTicketChange.create({
      data: {
        ticketId,
        checkId: opts.checkId ?? null,
        actor: opts.actor ?? "",
        kind,
        subject,
        fromValue: from,
        toValue: to,
        summary,
      },
    });
    changes++;
  };

  if (parsed.expiresOn && parsed.expiresOn !== before.expiresOn) {
    await note(
      "EXPIRATION_CHANGED",
      "Expires on",
      before.expiresOn,
      parsed.expiresOn,
      `Expiry moved from ${before.expiresOn || "none"} to ${parsed.expiresOn}`,
    );
  }
  if (parsed.workToBeginOn && parsed.workToBeginOn !== before.workToBeginOn) {
    await note(
      "EFFECTIVE_DATE_CHANGED",
      "Effective on",
      before.workToBeginOn,
      parsed.workToBeginOn,
      `Effective date moved to ${parsed.workToBeginOn}`,
    );
  }
  if (parsed.street && parsed.street !== before.street) {
    await note("ADDRESS_CHANGED", "Street", before.street, parsed.street, `Street changed to ${parsed.street}`);
  }

  const present = Object.fromEntries(
    Object.entries({
      street: parsed.street,
      crossStreet: parsed.crossStreet,
      city: parsed.city,
      county: parsed.county,
      workType: parsed.workType,
      ticketType: parsed.ticketType,
      workAreaDescription: parsed.workAreaDescription,
      locateInstructions: parsed.locateInstructions,
      excavatorName: parsed.excavatorName,
      contactName: parsed.contactName,
      contactPhone: parsed.contactPhone,
      calledInOn: parsed.calledInOn,
      workToBeginOn: parsed.workToBeginOn,
      responseBy: parsed.responseBy,
      updateableOn: parsed.updateableOn,
      updateBy: parsed.updateBy,
      expiresOn: parsed.expiresOn,
      notes: parsed.notes,
      lat: parsed.lat,
      lng: parsed.lng,
    }).filter(([, v]) => v !== "" && v !== null && v !== undefined),
  );
  await prisma.locateTicket.update({ where: { id: ticketId }, data: present });

  const priorByMember = new Map(before.responses.map((x) => [x.member, x.status] as const));
  for (const m of parsed.responses) {
    const prior = priorByMember.get(m.member);
    if (prior && prior !== m.status) {
      await note(
        "UTILITY_RESPONSE_CHANGED",
        m.member,
        prior,
        m.status,
        `${m.member}: ${prior} → ${m.status}`,
      );
    } else if (!prior) {
      await note(
        "UTILITY_RESPONSE_CHANGED",
        m.member,
        "",
        m.status,
        `${m.member} responded ${m.status}`,
      );
    }

    await prisma.locateResponse.upsert({
      where: { ticketId_member: { ticketId, member: m.member } },
      create: {
        ticketId,
        member: m.member,
        code: m.code,
        facilityType: m.facilityType,
        status: m.status,
        respondedOn: m.respondedOn,
        note: m.note,
        responseCode: m.responseCode,
        responseDescription: m.responseDescription,
        rawResponse: m.raw,
      },
      update: {
        code: m.code,
        facilityType: m.facilityType,
        status: m.status,
        respondedOn: m.respondedOn,
        note: m.note,
        responseCode: m.responseCode,
        responseDescription: m.responseDescription,
        rawResponse: m.raw,
      },
    });
  }

  // A response arriving on a ticket whose project locates that utility itself
  // is not a contradiction — 811 still lists the member. But a project rule
  // that names a utility we walk has to produce a locate to walk.
  await ensureContractorLocates(ticketId);

  return changes;
}

/**
 * Make sure every contractor-performed utility on this project has a record.
 *
 * Created as REQUIRED rather than silently assumed done. The whole point is
 * that somebody has to walk it and say so.
 */
async function ensureContractorLocates(ticketId: string) {
  const t = await prisma.locateTicket.findUnique({
    where: { id: ticketId },
    include: {
      project: { select: { locateRules: true } },
      contractorLocates: { select: { utilityName: true } },
    },
  });
  if (!t?.project) return;

  const rules = (t.project.locateRules ?? []) as {
    utilityName: string;
    utilityCode: string;
    performedBy: string;
  }[];
  const have = new Set(t.contractorLocates.map((c) => c.utilityName.toUpperCase()));

  for (const r of rules) {
    if (r.performedBy === "MEMBER") continue;
    if (have.has(r.utilityName.toUpperCase())) continue;
    await prisma.contractorLocate.create({
      data: {
        ticketId,
        utilityName: r.utilityName,
        utilityCode: r.utilityCode,
        status: "REQUIRED",
      },
    });
  }
}

/* ------------------------------------------------------------------ *
 * Entry
 * ------------------------------------------------------------------ */

/** Add ticket numbers. Deduplicated on provider + number + revision. */
export async function addLocateTickets(input: {
  text: string;
  projectId?: string | null;
  crewId?: string | null;
  provider?: string;
}) {
  await requireStaff();
  const provider = providerFor(input.provider ?? DEFAULT_PROVIDER);

  const tokens = [
    ...new Set(
      String(input.text ?? "")
        .split(/[\s,;|]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
  if (tokens.length === 0) return { ok: false as const, error: "Enter at least one ticket number." };

  const created: string[] = [];
  const existing: string[] = [];
  const rejected: string[] = [];

  for (const token of tokens) {
    const v = provider.validateNumber(token);
    if (!v.ok) {
      rejected.push(v.error ?? token);
      continue;
    }
    const already = await prisma.locateTicket.findUnique({
      where: { number_revision: { number: v.number, revision: v.revision } },
      select: { id: true },
    });
    if (already) {
      existing.push(v.number);
      // Assigning an existing ticket to a job is still useful work.
      if (input.projectId || input.crewId) {
        await prisma.locateTicket.update({
          where: { id: already.id },
          data: {
            ...(input.projectId ? { projectId: input.projectId } : {}),
            ...(input.crewId ? { crewId: input.crewId } : {}),
          },
        });
        await ensureContractorLocates(already.id);
        await syncReadiness(already.id);
      }
      continue;
    }

    const t = await prisma.locateTicket.create({
      data: {
        number: v.number,
        revision: v.revision,
        provider: provider.id,
        state: provider.state,
        projectId: input.projectId || null,
        crewId: input.crewId || null,
        sourceUrl: provider.ticketUrl(v.number),
        monitoringEnabled: true,
      },
    });
    created.push(v.number);
    await ensureContractorLocates(t.id);
    await syncReadiness(t.id, { actor: "Entered by hand" });
  }

  revalidatePath("/locates");
  return { ok: true as const, created, existing, rejected };
}

/**
 * Refresh one ticket against its provider.
 *
 * Records the attempt whatever happens. The check history is the answer to
 * "when did we last actually ask", and a board that cannot answer that is a
 * board whose green ticks mean nothing.
 */
export async function refreshLocateTicket(ticketId: string, opts: { force?: boolean } = {}) {
  const me = await requireStaff();
  const t = await prisma.locateTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, number: true, revision: true, provider: true, lastCheckedAt: true },
  });
  if (!t) return { ok: false as const, error: "No such ticket." };

  const since = t.lastCheckedAt ? Date.now() - t.lastCheckedAt.getTime() : Infinity;
  if (!opts.force && since < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - since) / 1000);
    return {
      ok: false as const,
      error: `Checked less than three minutes ago. Try again in ${wait}s.`,
    };
  }

  const provider = providerFor(t.provider);
  const result = await provider.lookupTicket(t.number, t.revision);

  const check = await prisma.locateTicketCheck.create({
    data: {
      ticketId,
      checkType: "MANUAL",
      requestedById: me.id,
      success: result.status === "OK",
      providerStatus: result.status,
      httpStatus: result.httpStatus,
      sourceHash: result.raw ? hash(result.raw) : "",
      rawSnapshot: result.raw.slice(0, 20_000),
      errorMessage: result.status === "OK" ? "" : result.message,
      durationMs: result.durationMs,
    },
  });

  await prisma.locateTicket.update({
    where: { id: ticketId },
    data: { lastCheckedAt: new Date() },
  });

  if (result.status !== "OK" || !result.ticket) {
    // Nothing about the ticket changes. A lookup we could not perform is not
    // evidence about the ground.
    await syncReadiness(ticketId, {
      checkId: check.id,
      lookupFailed: result.status !== "LOOKUP_UNAVAILABLE",
    });
    revalidatePath("/locates");
    revalidatePath(`/locates/${ticketId}`);
    return {
      ok: false as const,
      error: result.message,
      status: result.status,
    };
  }

  const changes = await applyTicket(ticketId, result.ticket, {
    checkId: check.id,
    actor: me.name || me.email,
  });
  const sync = await syncReadiness(ticketId, { checkId: check.id, actor: me.name || me.email });
  await prisma.locateTicketCheck.update({
    where: { id: check.id },
    data: { changesDetected: changes + sync.changes },
  });

  revalidatePath("/locates");
  revalidatePath(`/locates/${ticketId}`);
  return { ok: true as const, changes: changes + sync.changes };
}

/** Read a ticket, or a positive-response screen, out of pasted text. */
export async function importLocatePaste(input: {
  text: string;
  projectId?: string | null;
  crewId?: string | null;
  provider?: string;
}) {
  const me = await requireStaff();
  if (!input.text?.trim()) return { ok: false as const, error: "Paste a ticket first." };

  const provider = providerFor(input.provider ?? DEFAULT_PROVIDER);
  let parsed: ProviderTicket[];
  try {
    parsed = await provider.parseText(input.text);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not read that." };
  }
  if (parsed.length === 0) return { ok: false as const, error: "No ticket found in that text." };

  let created = 0;
  let updated = 0;
  let changes = 0;
  const noExpiry: string[] = [];

  for (const p of parsed) {
    const v = provider.validateNumber(p.revision ? `${p.number}-${p.revision}` : p.number);
    const number = v.ok ? v.number : p.number;
    const revision = v.ok ? v.revision : p.revision;

    let t = await prisma.locateTicket.findUnique({
      where: { number_revision: { number, revision } },
      select: { id: true },
    });
    if (t) updated++;
    else {
      t = await prisma.locateTicket.create({
        data: {
          number,
          revision,
          provider: provider.id,
          state: provider.state,
          projectId: input.projectId || null,
          crewId: input.crewId || null,
          sourceUrl: provider.ticketUrl(number),
        },
        select: { id: true },
      });
      created++;
    }

    if (input.projectId || input.crewId) {
      await prisma.locateTicket.update({
        where: { id: t.id },
        data: {
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.crewId ? { crewId: input.crewId } : {}),
        },
      });
    }

    const check = await prisma.locateTicketCheck.create({
      data: {
        ticketId: t.id,
        checkType: "IMPORT",
        requestedById: me.id,
        success: true,
        providerStatus: "PASTED",
        sourceHash: hash(input.text),
        rawSnapshot: input.text.slice(0, 20_000),
      },
    });

    const c = await applyTicket(t.id, p, { checkId: check.id, actor: me.name || me.email });
    const s = await syncReadiness(t.id, { checkId: check.id, actor: me.name || me.email });
    changes += c + s.changes;
    await prisma.locateTicketCheck.update({
      where: { id: check.id },
      data: { changesDetected: c + s.changes },
    });

    const after = await prisma.locateTicket.findUnique({
      where: { id: t.id },
      select: { expiresOn: true, number: true },
    });
    if (after && !after.expiresOn) noExpiry.push(after.number);
  }

  revalidatePath("/locates");
  return { ok: true as const, created, updated, changes, noExpiry };
}

/* ------------------------------------------------------------------ *
 * Assignment and rules
 * ------------------------------------------------------------------ */

export async function assignLocateTicket(input: {
  ticketId: string;
  projectId?: string | null;
  crewId?: string | null;
  assignedToId?: string | null;
}) {
  await requireStaff();
  await prisma.locateTicket.update({
    where: { id: input.ticketId },
    data: {
      ...(input.projectId !== undefined ? { projectId: input.projectId || null } : {}),
      ...(input.crewId !== undefined ? { crewId: input.crewId || null } : {}),
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId || null } : {}),
    },
  });
  await ensureContractorLocates(input.ticketId);
  await syncReadiness(input.ticketId);
  revalidatePath("/locates");
  revalidatePath(`/locates/${input.ticketId}`);
  return { ok: true as const };
}

export async function setMonitoring(ticketId: string, enabled: boolean) {
  await requireStaff();
  await prisma.locateTicket.update({
    where: { id: ticketId },
    data: { monitoringEnabled: enabled },
  });
  revalidatePath(`/locates/${ticketId}`);
  return { ok: true as const };
}

/** Who locates what on a job. Applies to every ticket on it, at once. */
export async function setProjectLocateRule(input: {
  projectId: string;
  utilityName: string;
  utilityCode?: string;
  performedBy: "MEMBER" | "CONTRACTOR" | "THIRD_PARTY";
  note?: string;
}) {
  await requireStaff();
  const name = input.utilityName.trim().toUpperCase();
  if (!name) return { ok: false as const, error: "Name the utility." };

  await prisma.projectLocateRule.upsert({
    where: { projectId_utilityName: { projectId: input.projectId, utilityName: name } },
    create: {
      projectId: input.projectId,
      utilityName: name,
      utilityCode: (input.utilityCode ?? "").trim().toUpperCase(),
      performedBy: input.performedBy,
      // A utility somebody else walks for us is not one 811 is waiting on, but
      // it absolutely stops a crew digging until it is done.
      blocks811Readiness: false,
      blocksFieldReadiness: input.performedBy !== "MEMBER",
      note: input.note ?? "",
    },
    update: {
      utilityCode: (input.utilityCode ?? "").trim().toUpperCase(),
      performedBy: input.performedBy,
      blocks811Readiness: false,
      blocksFieldReadiness: input.performedBy !== "MEMBER",
      note: input.note ?? "",
    },
  });

  // Every ticket on the job has to be re-judged: a rule change can turn a
  // waiting ticket into an 811-ready one, and a crew is entitled to know that
  // without somebody opening each ticket in turn.
  const tickets = await prisma.locateTicket.findMany({
    where: { projectId: input.projectId },
    select: { id: true },
  });
  for (const t of tickets) {
    await ensureContractorLocates(t.id);
    await syncReadiness(t.id, { actor: "Project locate rule changed" });
  }

  revalidatePath("/locates");
  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true as const, tickets: tickets.length };
}

export async function removeProjectLocateRule(id: string) {
  await requireStaff();
  const rule = await prisma.projectLocateRule.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!rule) return { ok: false as const, error: "No such rule." };
  await prisma.projectLocateRule.delete({ where: { id } });

  const tickets = await prisma.locateTicket.findMany({
    where: { projectId: rule.projectId },
    select: { id: true },
  });
  for (const t of tickets) await syncReadiness(t.id, { actor: "Project locate rule removed" });

  revalidatePath("/locates");
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * Contractor locates — the work we do ourselves
 * ------------------------------------------------------------------ */

export async function assignContractorLocate(input: {
  id: string;
  assignedCrewId?: string | null;
  assignedToId?: string | null;
}) {
  const me = await requireStaff();
  const cl = await prisma.contractorLocate.update({
    where: { id: input.id },
    data: {
      ...(input.assignedCrewId !== undefined ? { assignedCrewId: input.assignedCrewId || null } : {}),
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId || null } : {}),
      status: "ASSIGNED",
    },
    select: { ticketId: true, utilityName: true },
  });
  await prisma.locateTicketChange.create({
    data: {
      ticketId: cl.ticketId,
      kind: "CONTRACTOR_LOCATE_CHANGED",
      subject: cl.utilityName,
      toValue: "ASSIGNED",
      summary: `${cl.utilityName} locate assigned`,
      actor: me.name || me.email,
    },
  });
  await syncReadiness(cl.ticketId, { actor: me.name || me.email });
  revalidatePath(`/locates/${cl.ticketId}`);
  return { ok: true as const };
}

export async function startContractorLocate(id: string) {
  const me = await requireStaff();
  const cl = await prisma.contractorLocate.update({
    where: { id },
    data: { status: "IN_PROGRESS" },
    select: { ticketId: true, utilityName: true },
  });
  await prisma.locateTicketChange.create({
    data: {
      ticketId: cl.ticketId,
      kind: "CONTRACTOR_LOCATE_CHANGED",
      subject: cl.utilityName,
      toValue: "IN_PROGRESS",
      summary: `${cl.utilityName} locate started`,
      actor: me.name || me.email,
    },
  });
  await syncReadiness(cl.ticketId, { actor: me.name || me.email });
  revalidatePath(`/locates/${cl.ticketId}`);
  return { ok: true as const };
}

/**
 * Sign off a locate we walked.
 *
 * Requires the person to say what they used and how it came back. This is the
 * record somebody reads after a strike, and "verified" with nothing behind it
 * answers none of the questions that get asked then.
 */
export async function verifyContractorLocate(input: {
  id: string;
  frequencyUsed: string;
  signalQuality: string;
  notes?: string;
  photos?: string[];
}) {
  const me = await requireStaff();
  if (!input.frequencyUsed.trim()) {
    return { ok: false as const, error: "Say what frequency you used." };
  }
  if (!input.signalQuality.trim()) {
    return { ok: false as const, error: "Say how the signal came back." };
  }

  const cl = await prisma.contractorLocate.update({
    where: { id: input.id },
    data: {
      status: "VERIFIED",
      locatedById: me.id,
      locatedAt: new Date(),
      frequencyUsed: input.frequencyUsed.trim(),
      signalQuality: input.signalQuality.trim(),
      notes: input.notes ?? "",
      ...(input.photos?.length ? { photos: input.photos } : {}),
    },
    select: { ticketId: true, utilityName: true },
  });

  await prisma.locateTicketChange.create({
    data: {
      ticketId: cl.ticketId,
      kind: "CONTRACTOR_LOCATE_CHANGED",
      subject: cl.utilityName,
      toValue: "VERIFIED",
      summary: `${cl.utilityName} contractor locate verified by ${me.name || me.email}`,
      actor: me.name || me.email,
    },
  });
  await syncReadiness(cl.ticketId, { actor: me.name || me.email });
  revalidatePath("/locates");
  revalidatePath(`/locates/${cl.ticketId}`);
  return { ok: true as const };
}

/**
 * Report that we could not locate it.
 *
 * Deliberately as easy to reach as verifying. A workflow where the only
 * one-click outcome is "done" is a workflow that produces "done".
 */
export async function reportContractorLocateIssue(input: {
  id: string;
  status: "ISSUE_FOUND" | "UNABLE_TO_LOCATE" | "REQUIRES_ESCALATION";
  notes: string;
  photos?: string[];
}) {
  const me = await requireStaff();
  if (!input.notes.trim()) {
    return { ok: false as const, error: "Say what happened — this is what somebody acts on." };
  }

  const cl = await prisma.contractorLocate.update({
    where: { id: input.id },
    data: {
      status: input.status,
      notes: input.notes.trim(),
      locatedById: me.id,
      locatedAt: new Date(),
      ...(input.photos?.length ? { photos: input.photos } : {}),
    },
    select: { ticketId: true, utilityName: true },
  });

  await prisma.locateTicketChange.create({
    data: {
      ticketId: cl.ticketId,
      kind: "CONTRACTOR_LOCATE_CHANGED",
      subject: cl.utilityName,
      toValue: input.status,
      summary: `${cl.utilityName}: ${input.status.replace(/_/g, " ").toLowerCase()} — ${input.notes.trim()}`,
      actor: me.name || me.email,
    },
  });
  await syncReadiness(cl.ticketId, { actor: me.name || me.email });
  revalidatePath("/locates");
  revalidatePath(`/locates/${cl.ticketId}`);
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * The scheduler
 * ------------------------------------------------------------------ */

/**
 * The twice-daily sweep.
 *
 * Called by a cron route. Only tickets worth asking about: monitoring on, not
 * finished, not cancelled, due a check. A completed job is not polled, and a
 * ticket that expired three weeks ago is not polled — the spec asks for that
 * and so does the provider whose service we would otherwise be hammering.
 */
export async function runScheduledLocateChecks(limit = 50) {
  const now = new Date();
  const due = await prisma.locateTicket.findMany({
    where: {
      monitoringEnabled: true,
      closedOn: "",
      lifecycle: { notIn: ["CANCELLED", "COMPLETED", "EXPIRED"] },
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }],
    },
    select: { id: true, number: true, revision: true, provider: true },
    take: limit,
  });

  let checked = 0;
  let changed = 0;
  let failed = 0;

  for (const t of due) {
    const provider = providerFor(t.provider);
    const result = await provider.lookupTicket(t.number, t.revision);

    const check = await prisma.locateTicketCheck.create({
      data: {
        ticketId: t.id,
        checkType: "AUTOMATIC",
        success: result.status === "OK",
        providerStatus: result.status,
        httpStatus: result.httpStatus,
        sourceHash: result.raw ? hash(result.raw) : "",
        rawSnapshot: result.raw.slice(0, 20_000),
        errorMessage: result.status === "OK" ? "" : result.message,
        durationMs: result.durationMs,
      },
    });
    checked++;

    if (result.status === "OK" && result.ticket) {
      const c = await applyTicket(t.id, result.ticket, { checkId: check.id, actor: "Scheduled check" });
      const s = await syncReadiness(t.id, { checkId: check.id, actor: "Scheduled check" });
      changed += c + s.changes;
      await prisma.locateTicketCheck.update({
        where: { id: check.id },
        data: { changesDetected: c + s.changes },
      });
    } else {
      if (result.status !== "LOOKUP_UNAVAILABLE") failed++;
      await syncReadiness(t.id, {
        checkId: check.id,
        lookupFailed: result.status !== "LOOKUP_UNAVAILABLE",
      });
    }

    await prisma.locateTicket.update({
      where: { id: t.id },
      data: { lastCheckedAt: now, nextCheckAt: nextSlot(now) },
    });
  }

  // Expiry moves without anybody checking anything. Re-judging the whole live
  // board is what turns "expires tomorrow" into "expired" overnight.
  const live = await prisma.locateTicket.findMany({
    where: { closedOn: "", lifecycle: { notIn: ["CANCELLED", "COMPLETED"] } },
    select: { id: true },
    take: 2000,
  });
  for (const t of live) {
    const s = await syncReadiness(t.id, { actor: "Daily re-check" });
    changed += s.changes;
  }

  revalidatePath("/locates");
  return { ok: true as const, checked, changed, failed, rejudged: live.length };
}

/** Next 7am or 4pm, whichever comes first. */
function nextSlot(from: Date): Date {
  const next = new Date(from);
  const h = from.getHours();
  if (h < 7) next.setHours(7, 0, 0, 0);
  else if (h < 16) next.setHours(16, 0, 0, 0);
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(7, 0, 0, 0);
  }
  return next;
}

/** Re-judge everything without asking any provider. Cheap, and safe to repeat. */
export async function rejudgeAllLocates() {
  await requireStaff();
  const all = await prisma.locateTicket.findMany({ select: { id: true }, take: 5000 });
  let changed = 0;
  for (const t of all) {
    await ensureContractorLocates(t.id);
    const s = await syncReadiness(t.id, { actor: "Recalculated" });
    changed += s.changes;
  }
  revalidatePath("/locates");
  return { ok: true as const, tickets: all.length, changed };
}
