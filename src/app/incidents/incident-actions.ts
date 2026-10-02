"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff, type CurrentUser } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/authz";
import { resolveOrg } from "@/lib/org-context";
import {
  nextIncidentNumber,
  type IncidentSeverityValue,
  type IncidentStatusValue,
  type IncidentTypeValue,
} from "@/lib/incidents";

/**
 * Opening an incident, and everything that happens to it afterwards.
 *
 * Two rules hold this file together.
 *
 * Every change writes a timeline row in the same transaction as the change.
 * Not afterwards, not best-effort — in the transaction, so an incident whose
 * status moved and whose history does not say so is not a state this code can
 * produce.
 *
 * Nothing here reads or writes production, billing readiness, an invoice, a
 * SubInvoice, a rate or a payment. An incident costs money; what it costs is
 * settled by people, in writing, later. A status column moving must never move
 * anybody's money.
 */

type EventType =
  | "REPORTED"
  | "WORK_STOPPED"
  | "WORK_RESUMED"
  | "EVIDENCE_ADDED"
  | "NOTIFICATION_RECORDED"
  | "STATUS_CHANGED"
  | "REPAIR_STARTED"
  | "REPAIR_COMPLETED"
  | "NOTE_ADDED"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "VOIDED"
  | "FIELD_CORRECTED";

/** The actor, frozen as they are now. See IncidentEvent.actorName. */
function actorOf(me: CurrentUser) {
  return {
    actorUserId: me.id,
    actorName: me.name || me.email,
    actorRole: me.role,
  };
}

/**
 * One timeline row.
 *
 * Takes the transaction client rather than the global one, so it cannot
 * accidentally be written outside the transaction it belongs to.
 */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function writeEvent(
  tx: Tx,
  input: {
    incidentId: string;
    type: EventType;
    me: CurrentUser;
    detail?: string;
    field?: string;
    fromValue?: string;
    toValue?: string;
  },
) {
  await tx.incidentEvent.create({
    data: {
      incidentId: input.incidentId,
      type: input.type,
      ...actorOf(input.me),
      detail: (input.detail ?? "").slice(0, 2000),
      field: input.field ?? "",
      fromValue: input.fromValue ?? "",
      toValue: input.toValue ?? "",
    },
  });
}

/**
 * Whether this person may see this incident at all.
 *
 * Staff see everything in the organisation. A crew sees its own company's
 * incidents on jobs it is assigned to. An employee sees the ones they filed,
 * and nothing else — deliberately narrow, because EMPLOYEE is not a staff role
 * and reporting an incident must not become a way to read the project.
 */
async function readableIncident(id: string) {
  const me = await getCurrentUser();
  if (!me) return { me: null, incident: null, allowed: false } as const;

  const incident = await prisma.incident.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      subcontractorId: true,
      employeeId: true,
      reportedByUserId: true,
      status: true,
      number: true,
    },
  });
  if (!incident) return { me, incident: null, allowed: false } as const;

  if (isStaff(me.role)) return { me, incident, allowed: true } as const;

  if (me.role === "SUBCONTRACTOR") {
    if (!me.subcontractorId || incident.subcontractorId !== me.subcontractorId) {
      return { me, incident, allowed: false } as const;
    }
    try {
      await assertProjectAccess(incident.projectId);
    } catch {
      return { me, incident, allowed: false } as const;
    }
    return { me, incident, allowed: true } as const;
  }

  if (me.role === "EMPLOYEE") {
    return { me, incident, allowed: incident.reportedByUserId === me.id } as const;
  }

  return { me, incident, allowed: false } as const;
}

function refresh(projectId: string, incidentId?: string) {
  revalidatePath("/incidents");
  if (incidentId) revalidatePath(`/incidents/${incidentId}`);
  revalidatePath(`/projects/${projectId}`);
}

// ── reporting ───────────────────────────────────────────────────────────────

export async function reportIncident(input: {
  projectId: string;
  type: IncidentTypeValue;
  severity?: IncidentSeverityValue;
  /** ISO. When it happened, not when this form was submitted. */
  occurredAt: string;
  summary: string;
  description?: string;
  locationText?: string;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  injury?: boolean;
  injuryCount?: number;
  workStopped?: boolean;
  utilityOwner?: string;
  utilityType?: string;
  locateTicketId?: string | null;
}) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };

  // The gate, against the database rather than against a rendered form. Staff,
  // an assigned crew, and an assigned employee all pass here; nobody else does.
  try {
    await assertProjectAccess(input.projectId);
  } catch {
    return { ok: false as const, error: "That isn't your project." };
  }

  const summary = input.summary.trim();
  if (!summary) {
    return { ok: false as const, error: "Say in one line what happened." };
  }

  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    return { ok: false as const, error: "That date and time could not be read." };
  }
  // A few minutes of clock skew between a phone and the server is normal; an
  // hour is somebody typing the wrong day, and an incident dated in the future
  // breaks every figure measured from occurredAt.
  if (occurredAt.getTime() > Date.now() + 15 * 60_000) {
    return { ok: false as const, error: "That is in the future. Check the date and time." };
  }

  const organizationId = await resolveOrg();

  /**
   * The employee behind the account, when there is one.
   *
   * `CurrentUser` carries `subcontractorId` but not an employee id — the two
   * identities were built at different times for different reasons. Looked up
   * here rather than added to the session, because this is the only place that
   * wants it and widening the session is a security surface.
   */
  const employeeId =
    me.role === "EMPLOYEE"
      ? (await prisma.employee.findUnique({ where: { userId: me.id }, select: { id: true } }))?.id ??
        null
      : null;

  // The 811 ticket, read once here so the snapshot is what the ticket said at
  // the moment of filing. Its status is deliberately not copied — see the
  // schema note on locateNumberSnapshot.
  let locate: { id: string; number: string; revision: string } | null = null;
  if (input.locateTicketId) {
    const found = await prisma.locateTicket.findUnique({
      where: { id: input.locateTicketId },
      select: { id: true, number: true, revision: true, projectId: true },
    });
    // Only a ticket on this job. A ticket id from another project would
    // otherwise attach somebody else's locate to this incident.
    if (found && found.projectId === input.projectId) {
      locate = { id: found.id, number: found.number, revision: found.revision };
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const { seq, number } = await nextIncidentNumber(tx, organizationId);

    const incident = await tx.incident.create({
      data: {
        organizationId,
        number,
        seq,
        projectId: input.projectId,
        type: input.type,
        severity: input.severity ?? "MINOR",
        status: "REPORTED",
        occurredAt,
        summary: summary.slice(0, 300),
        description: (input.description ?? "").slice(0, 5000),
        locationText: (input.locationText ?? "").slice(0, 300),
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        accuracyM: input.accuracyM ?? null,
        injury: input.injury === true,
        injuryCount: Math.max(0, Math.trunc(input.injuryCount ?? 0)),
        workStopped: input.workStopped === true,
        utilityOwner: (input.utilityOwner ?? "").slice(0, 200),
        utilityType: (input.utilityType ?? "").slice(0, 100),
        locateTicketId: locate?.id ?? null,
        locateNumberSnapshot: locate?.number ?? "",
        locateRevisionSnapshot: locate?.revision ?? "",
        locateSnapshotAt: locate ? new Date() : null,
        reportedByUserId: me.id,
        reportedByName: me.name || me.email,
        subcontractorId: me.subcontractorId ?? null,
        subcontractorName: me.subcontractorName ?? "",
        employeeId,
      },
      select: { id: true, number: true, projectId: true },
    });

    await writeEvent(tx, {
      incidentId: incident.id,
      type: "REPORTED",
      me,
      detail: summary,
    });

    if (input.workStopped === true) {
      await writeEvent(tx, {
        incidentId: incident.id,
        type: "WORK_STOPPED",
        me,
        detail: "Work stopped when the incident was reported.",
      });
    }

    return incident;
  });

  refresh(created.projectId, created.id);
  return { ok: true as const, id: created.id, number: created.number };
}

// ── evidence ────────────────────────────────────────────────────────────────

/**
 * Tag photographs already in the project's evidence store to this incident.
 *
 * No file is copied and no second media row is created. The photograph keeps
 * its project, its capture time, its fix and its category — which is what makes
 * it possible to lay a pre-construction photograph of a driveway beside the
 * incident photograph of the same driveway later.
 */
export async function addIncidentEvidence(input: { incidentId: string; photoIds: string[] }) {
  const { me, incident, allowed } = await readableIncident(input.incidentId);
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (!incident) return { ok: false as const, error: "That incident is gone." };
  if (!allowed) return { ok: false as const, error: "That isn't your incident." };
  if (me.role === "EMPLOYEE") {
    return { ok: false as const, error: "Ask the office to add evidence to this report." };
  }

  const ids = input.photoIds.filter(Boolean).slice(0, 50);
  if (ids.length === 0) return { ok: false as const, error: "Nothing was selected." };

  const count = await prisma.$transaction(async (tx) => {
    // Only photographs already on this incident's project. A photo id from
    // another job cannot be dragged in by typing it into the request.
    const updated = await tx.projectPhoto.updateMany({
      where: { id: { in: ids }, projectId: incident.projectId },
      data: { incidentId: incident.id },
    });

    if (updated.count > 0) {
      await writeEvent(tx, {
        incidentId: incident.id,
        type: "EVIDENCE_ADDED",
        me,
        detail: `${updated.count} photograph${updated.count === 1 ? "" : "s"} added as evidence.`,
      });
    }
    return updated.count;
  });

  if (count === 0) {
    return { ok: false as const, error: "None of those photographs are on this project." };
  }

  refresh(incident.projectId, incident.id);
  return { ok: true as const, count };
}

// ── notifications ───────────────────────────────────────────────────────────

export async function recordIncidentNotification(input: {
  incidentId: string;
  party:
    | "UTILITY_OWNER"
    | "ONE_CALL_811"
    | "CUSTOMER"
    | "PROPERTY_OWNER"
    | "EMERGENCY_SERVICES"
    | "INSURER"
    | "INTERNAL"
    | "OTHER";
  method: "PHONE" | "EMAIL" | "IN_PERSON" | "SMS" | "PORTAL" | "OTHER";
  partyName?: string;
  contact?: string;
  /** ISO. When they were actually told. */
  notifiedAt: string;
  reference?: string;
  note?: string;
}) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (!isStaff(me.role)) return { ok: false as const, error: "Only the office records notifications." };

  const incident = await prisma.incident.findUnique({
    where: { id: input.incidentId },
    select: { id: true, projectId: true, status: true },
  });
  if (!incident) return { ok: false as const, error: "That incident is gone." };
  if (incident.status === "VOID") {
    return { ok: false as const, error: "That report was voided." };
  }

  const notifiedAt = new Date(input.notifiedAt);
  if (Number.isNaN(notifiedAt.getTime())) {
    return { ok: false as const, error: "That date and time could not be read." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.incidentNotification.create({
      data: {
        incidentId: incident.id,
        party: input.party,
        method: input.method,
        partyName: (input.partyName ?? "").slice(0, 200),
        contact: (input.contact ?? "").slice(0, 200),
        notifiedAt,
        reference: (input.reference ?? "").slice(0, 100),
        note: (input.note ?? "").slice(0, 2000),
        recordedByUserId: me.id,
        recordedByName: me.name || me.email,
      },
    });

    const who = input.partyName?.trim() || input.party.replace(/_/g, " ").toLowerCase();
    await writeEvent(tx, {
      incidentId: incident.id,
      type: "NOTIFICATION_RECORDED",
      me,
      detail: input.reference
        ? `Notified ${who} — reference ${input.reference}.`
        : `Notified ${who}.`,
    });
  });

  refresh(incident.projectId, incident.id);
  return { ok: true as const };
}

// ── status, repair, resolution ──────────────────────────────────────────────

export async function setIncidentStatus(input: {
  incidentId: string;
  status: IncidentStatusValue;
  note?: string;
}) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (!isStaff(me.role)) return { ok: false as const, error: "Only the office moves an incident." };

  if (input.status === "VOID") {
    return { ok: false as const, error: "Use void, which asks for a reason." };
  }

  const incident = await prisma.incident.findUnique({
    where: { id: input.incidentId },
    select: { id: true, projectId: true, status: true },
  });
  if (!incident) return { ok: false as const, error: "That incident is gone." };
  if (incident.status === "VOID") return { ok: false as const, error: "That report was voided." };
  if (incident.status === input.status) return { ok: true as const };

  // Closing is a decision with consequences and belongs to the people who
  // answer for it.
  if (input.status === "CLOSED" && me.role !== "ADMIN" && me.role !== "PM") {
    return { ok: false as const, error: "An admin or PM closes an incident." };
  }

  const reopening = incident.status === "CLOSED" || incident.status === "RESOLVED";

  await prisma.$transaction(async (tx) => {
    await tx.incident.update({
      where: { id: incident.id },
      data: {
        status: input.status,
        ...(input.status === "RESOLVED"
          ? { resolvedAt: new Date(), resolutionNote: (input.note ?? "").slice(0, 2000) }
          : null),
        ...(input.status === "CLOSED" ? { closedAt: new Date(), closedByUserId: me.id } : null),
        // Reopening clears the endings so the record does not carry a closed
        // date it is no longer in.
        ...(reopening && input.status !== "CLOSED" && input.status !== "RESOLVED"
          ? { closedAt: null, closedByUserId: null, resolvedAt: null }
          : null),
      },
    });

    await writeEvent(tx, {
      incidentId: incident.id,
      type:
        input.status === "RESOLVED"
          ? "RESOLVED"
          : input.status === "CLOSED"
            ? "CLOSED"
            : reopening
              ? "REOPENED"
              : "STATUS_CHANGED",
      me,
      detail: input.note?.trim() || "",
      field: "status",
      fromValue: incident.status,
      toValue: input.status,
    });
  });

  refresh(incident.projectId, incident.id);
  return { ok: true as const };
}

export async function setIncidentRepair(input: {
  incidentId: string;
  phase: "STARTED" | "COMPLETED";
  note?: string;
}) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (!isStaff(me.role)) return { ok: false as const, error: "Only the office records a repair." };

  const incident = await prisma.incident.findUnique({
    where: { id: input.incidentId },
    select: { id: true, projectId: true, status: true, repairStartedAt: true },
  });
  if (!incident) return { ok: false as const, error: "That incident is gone." };
  if (incident.status === "VOID") return { ok: false as const, error: "That report was voided." };

  if (input.phase === "COMPLETED" && !incident.repairStartedAt) {
    return { ok: false as const, error: "Record the repair starting first." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.incident.update({
      where: { id: incident.id },
      data:
        input.phase === "STARTED"
          ? { repairStartedAt: now, status: "REPAIR_IN_PROGRESS" }
          : {
              repairCompletedAt: now,
              status: "REPAIRED",
              repairNote: (input.note ?? "").slice(0, 2000),
            },
    });

    await writeEvent(tx, {
      incidentId: incident.id,
      type: input.phase === "STARTED" ? "REPAIR_STARTED" : "REPAIR_COMPLETED",
      me,
      detail: input.note?.trim() || "",
      field: "status",
      fromValue: incident.status,
      toValue: input.phase === "STARTED" ? "REPAIR_IN_PROGRESS" : "REPAIRED",
    });
  });

  refresh(incident.projectId, incident.id);
  return { ok: true as const };
}

// ── work stoppage ───────────────────────────────────────────────────────────

/** A crew may stop and resume work on its own incident. It is their safety. */
export async function setIncidentWorkStopped(input: { incidentId: string; stopped: boolean; note?: string }) {
  const { me, incident, allowed } = await readableIncident(input.incidentId);
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (!incident) return { ok: false as const, error: "That incident is gone." };
  if (!allowed || me.role === "EMPLOYEE") {
    return { ok: false as const, error: "That isn't your incident." };
  }
  if (incident.status === "VOID") return { ok: false as const, error: "That report was voided." };

  await prisma.$transaction(async (tx) => {
    await tx.incident.update({
      where: { id: incident.id },
      data: { workStopped: input.stopped },
    });
    await writeEvent(tx, {
      incidentId: incident.id,
      type: input.stopped ? "WORK_STOPPED" : "WORK_RESUMED",
      me,
      detail: input.note?.trim() || "",
      field: "workStopped",
      fromValue: String(!input.stopped),
      toValue: String(input.stopped),
    });
  });

  refresh(incident.projectId, incident.id);
  return { ok: true as const };
}

// ── notes ───────────────────────────────────────────────────────────────────

export async function addIncidentNote(input: { incidentId: string; note: string }) {
  const { me, incident, allowed } = await readableIncident(input.incidentId);
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (!incident) return { ok: false as const, error: "That incident is gone." };
  if (!allowed) return { ok: false as const, error: "That isn't your incident." };

  const note = input.note.trim();
  if (!note) return { ok: false as const, error: "Nothing to add." };

  await prisma.$transaction(async (tx) => {
    await writeEvent(tx, {
      incidentId: incident.id,
      type: "NOTE_ADDED",
      me,
      detail: note.slice(0, 2000),
    });
  });

  refresh(incident.projectId, incident.id);
  return { ok: true as const };
}

// ── corrections and voiding ─────────────────────────────────────────────────

/**
 * Change a fact on the incident after the fact.
 *
 * The field moves and a FIELD_CORRECTED row records what it moved from. The
 * original reading survives on the timeline, which is the whole reason the
 * timeline is append-only: an incident that quietly acquires a different
 * severity between the day it happened and the day it reaches an insurer is
 * worth nothing to anybody.
 */
export async function correctIncidentField(input: {
  incidentId: string;
  field: "severity" | "type" | "occurredAt" | "summary" | "description" | "locationText" | "utilityOwner" | "utilityType";
  value: string;
  reason: string;
}) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (!isStaff(me.role)) return { ok: false as const, error: "Only the office corrects a record." };

  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false as const, error: "Say why this is being corrected. It goes on the record." };
  }

  const incident = await prisma.incident.findUnique({ where: { id: input.incidentId } });
  if (!incident) return { ok: false as const, error: "That incident is gone." };
  if (incident.status === "VOID") return { ok: false as const, error: "That report was voided." };

  const before = incident[input.field];
  const fromValue = before instanceof Date ? before.toISOString() : String(before ?? "");

  let data: Record<string, unknown>;
  if (input.field === "occurredAt") {
    const when = new Date(input.value);
    if (Number.isNaN(when.getTime())) {
      return { ok: false as const, error: "That date and time could not be read." };
    }
    data = { occurredAt: when };
  } else {
    data = { [input.field]: input.value.slice(0, 5000) };
  }

  if (fromValue === input.value) return { ok: true as const };

  await prisma.$transaction(async (tx) => {
    await tx.incident.update({ where: { id: incident.id }, data });
    await writeEvent(tx, {
      incidentId: incident.id,
      type: "FIELD_CORRECTED",
      me,
      detail: reason.slice(0, 2000),
      field: input.field,
      fromValue,
      toValue: input.value.slice(0, 500),
    });
  });

  refresh(incident.projectId, incident.id);
  return { ok: true as const };
}

/**
 * Mark a report as filed in error.
 *
 * Never a delete. The timeline of a mistaken report — who filed it, when, and
 * who decided it was a mistake — is itself something that gets asked about.
 */
export async function voidIncident(input: { incidentId: string; reason: string }) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (me.role !== "ADMIN") return { ok: false as const, error: "An admin voids a report." };

  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false as const, error: "Say why this report is being voided. It goes on the record." };
  }

  const incident = await prisma.incident.findUnique({
    where: { id: input.incidentId },
    select: { id: true, projectId: true, status: true },
  });
  if (!incident) return { ok: false as const, error: "That incident is gone." };
  if (incident.status === "VOID") return { ok: true as const };

  await prisma.$transaction(async (tx) => {
    await tx.incident.update({ where: { id: incident.id }, data: { status: "VOID" } });
    await writeEvent(tx, {
      incidentId: incident.id,
      type: "VOIDED",
      me,
      detail: reason.slice(0, 2000),
      field: "status",
      fromValue: incident.status,
      toValue: "VOID",
    });
  });

  refresh(incident.projectId, incident.id);
  return { ok: true as const };
}

export async function linkIncidentLocate(input: { incidentId: string; locateTicketId: string }) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in." };
  if (!isStaff(me.role)) return { ok: false as const, error: "Only the office links a ticket." };

  const incident = await prisma.incident.findUnique({
    where: { id: input.incidentId },
    select: { id: true, projectId: true, status: true, locateNumberSnapshot: true },
  });
  if (!incident) return { ok: false as const, error: "That incident is gone." };
  if (incident.status === "VOID") return { ok: false as const, error: "That report was voided." };

  const ticket = await prisma.locateTicket.findUnique({
    where: { id: input.locateTicketId },
    select: { id: true, number: true, revision: true, projectId: true },
  });
  if (!ticket) return { ok: false as const, error: "That ticket is gone." };
  if (ticket.projectId !== incident.projectId) {
    return { ok: false as const, error: "That ticket is on a different project." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.incident.update({
      where: { id: incident.id },
      data: {
        locateTicketId: ticket.id,
        locateNumberSnapshot: ticket.number,
        locateRevisionSnapshot: ticket.revision,
        locateSnapshotAt: new Date(),
      },
    });
    await writeEvent(tx, {
      incidentId: incident.id,
      type: "FIELD_CORRECTED",
      me,
      detail: `811 ticket ${ticket.number} linked to this incident.`,
      field: "locateTicketId",
      fromValue: incident.locateNumberSnapshot,
      toValue: ticket.number,
    });
  });

  refresh(incident.projectId, incident.id);
  return { ok: true as const };
}
