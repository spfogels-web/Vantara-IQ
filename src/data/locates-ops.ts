import "server-only";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";
import {
  readiness,
  expiryUrgency,
  type ExternalReadiness,
  type FieldReadiness,
  type LocateRule,
  type ExpiryUrgency,
} from "@/lib/locate-readiness";
import { providerFor } from "@/lib/locate-providers";

/**
 * The locate board.
 *
 * Readiness is computed here on read rather than trusted from the column it is
 * also written to. The stored value is what alerts and the scheduler compare
 * against — it has to be, or nothing could detect a change — but a board that
 * renders a cached "field ready" after a ticket quietly expired overnight is
 * the exact failure this module exists to prevent. The clock moves on its own;
 * nothing writes to the database when a day passes.
 */

/** Today, in a project's own timezone. Never hardcodes Eastern. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Which timezone a job runs on.
 *
 * Georgia, Alabama and South Carolina are all Eastern except that Alabama is
 * Central, so this is a lookup rather than a constant. A ticket that expires
 * "today" expires at midnight where the dirt is.
 */
const STATE_TZ: Record<string, string> = {
  GA: "America/New_York",
  SC: "America/New_York",
  NC: "America/New_York",
  FL: "America/New_York",
  AL: "America/Chicago",
  TN: "America/Chicago",
  MS: "America/Chicago",
};

export function zoneForState(state: string | null | undefined): string {
  return STATE_TZ[String(state ?? "").toUpperCase().trim()] ?? "America/New_York";
}

export interface LocateRow {
  id: string;
  number: string;
  revision: string;
  provider: string;
  state: string;

  street: string;
  crossStreet: string;
  city: string;
  county: string;

  projectId: string | null;
  projectName: string;
  crewId: string | null;
  crewName: string;
  assignedToName: string;

  external: ExternalReadiness;
  field: FieldReadiness;
  lifecycle: string;
  blockingReason: string;
  waitingOn: string[];
  contractorOutstanding: string[];
  externalCleared: number;
  externalRequired: number;

  expiresOn: string;
  expiryEstimated: boolean;
  daysToExpiry: number | null;
  urgency: ExpiryUrgency;

  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  monitoringEnabled: boolean;
  contractorLocates: { utilityName: string; status: string }[];
  /** Set when the most recent check failed, so the row can say so. */
  lastCheckFailed: boolean;
}

const TICKET_INCLUDE = {
  responses: { select: { member: true, code: true, status: true } },
  contractorLocates: { select: { utilityName: true, status: true } },
  project: { select: { id: true, name: true, locateRules: true } },
  crew: { select: { id: true, company: true } },
  assignedTo: { select: { name: true, email: true } },
  checks: {
    select: { success: true, checkedAt: true, providerStatus: true },
    orderBy: { checkedAt: "desc" as const },
    take: 1,
  },
} as const;

/**
 * Which tickets this person may see.
 *
 * A crew sees the jobs they are assigned to and nothing else. This is the choke
 * point for that rule rather than a hidden button: locate data names other
 * companies' work areas, and a subcontractor has no business reading the board
 * for a job they are not on.
 */
async function scope() {
  const me = await getCurrentUser();
  if (!me) return { me: null, where: null };
  if (isStaff(me.role)) return { me, where: {} as Record<string, unknown> };

  if (!me.subcontractorId) return { me, where: null };
  const projects = await prisma.project.findMany({
    where: { crews: { some: { id: me.subcontractorId } } },
    select: { id: true },
  });
  if (projects.length === 0) return { me, where: null };
  return {
    me,
    where: {
      OR: [
        { projectId: { in: projects.map((p) => p.id) } },
        { crewId: me.subcontractorId },
      ],
    } as Record<string, unknown>,
  };
}

function rulesOf(project: { locateRules?: unknown } | null): LocateRule[] {
  const raw = (project?.locateRules ?? []) as {
    utilityName: string;
    utilityCode: string;
    performedBy: string;
    blocks811Readiness: boolean;
    blocksFieldReadiness: boolean;
  }[];
  return raw.map((r) => ({
    utilityName: r.utilityName,
    utilityCode: r.utilityCode,
    performedBy: r.performedBy as LocateRule["performedBy"],
    blocks811Readiness: r.blocks811Readiness,
    blocksFieldReadiness: r.blocksFieldReadiness,
  }));
}

type TicketWithRelations = Awaited<
  ReturnType<typeof prisma.locateTicket.findMany<{ include: typeof TICKET_INCLUDE }>>
>[number];

function toRow(t: TicketWithRelations): LocateRow {
  const zone = zoneForState(t.state);
  const today = todayIn(zone);
  const lastCheck = t.checks[0] ?? null;
  // A check that failed leaves the answer stale. Only a genuinely failed
  // attempt counts — a provider that is not configured has not failed, it has
  // simply never been asked, and the board should not shout about that on
  // every row.
  const lastCheckFailed = Boolean(
    lastCheck && !lastCheck.success && lastCheck.providerStatus !== "LOOKUP_UNAVAILABLE",
  );

  const r = readiness({
    ticket: t,
    responses: t.responses,
    rules: rulesOf(t.project),
    contractorLocates: t.contractorLocates.map((c) => ({
      utilityName: c.utilityName,
      status: c.status,
    })),
    lookupFailed: lastCheckFailed,
    today,
  });

  return {
    id: t.id,
    number: t.number,
    revision: t.revision,
    provider: t.provider,
    state: t.state,
    street: t.street,
    crossStreet: t.crossStreet,
    city: t.city,
    county: t.county,
    projectId: t.project?.id ?? null,
    projectName: t.project?.name ?? "",
    crewId: t.crew?.id ?? null,
    crewName: t.crew?.company ?? "",
    assignedToName: t.assignedTo?.name || t.assignedTo?.email || "",
    external: r.external,
    field: r.field,
    lifecycle: r.lifecycle,
    blockingReason: r.blockingReason,
    waitingOn: r.waitingOn,
    contractorOutstanding: r.contractorOutstanding,
    externalCleared: r.externalCleared,
    externalRequired: r.externalRequired,
    expiresOn: r.standing.expiresOn,
    expiryEstimated: r.expiryEstimated,
    daysToExpiry: r.standing.daysToExpiry,
    urgency: expiryUrgency(r.standing.daysToExpiry),
    lastCheckedAt: t.lastCheckedAt?.toISOString() ?? null,
    nextCheckAt: t.nextCheckAt?.toISOString() ?? null,
    monitoringEnabled: t.monitoringEnabled,
    contractorLocates: t.contractorLocates.map((c) => ({
      utilityName: c.utilityName,
      status: c.status,
    })),
    lastCheckFailed,
  };
}

/**
 * The board.
 *
 * Paginated because this table is expected to hold years of tickets, and the
 * snapshots and check history are deliberately not joined — a dashboard that
 * drags every raw snapshot into memory to draw seven KPI cards stops working
 * somewhere around the first thousand tickets.
 */
export async function getLocateRows(opts: {
  take?: number;
  skip?: number;
  projectId?: string;
  crewId?: string;
  includeClosed?: boolean;
} = {}): Promise<{ rows: LocateRow[]; total: number }> {
  const { where } = await scope();
  if (!where) return { rows: [], total: 0 };

  const filter: Record<string, unknown> = { ...where };
  if (opts.projectId) filter.projectId = opts.projectId;
  if (opts.crewId) filter.crewId = opts.crewId;
  if (!opts.includeClosed) filter.closedOn = "";

  const [rows, total] = await Promise.all([
    prisma.locateTicket.findMany({
      where: filter,
      include: TICKET_INCLUDE,
      // Soonest to run out first. The board's job is to surface what is about
      // to stop being true.
      orderBy: [{ expiresOn: "asc" }, { number: "asc" }],
      take: opts.take ?? 200,
      skip: opts.skip ?? 0,
    }),
    prisma.locateTicket.count({ where: filter }),
  ]);

  return { rows: rows.map(toRow), total };
}

export interface LocateOverview {
  total: number;
  fieldReady: number;
  ready811: number;
  waiting: number;
  contractorRequired: number;
  needsAttention: number;
  expiring72: number;
  expired: number;
}

export async function getLocateOverview(): Promise<LocateOverview> {
  const { rows } = await getLocateRows({ take: 1000 });
  const zero: LocateOverview = {
    total: rows.length,
    fieldReady: 0,
    ready811: 0,
    waiting: 0,
    contractorRequired: 0,
    needsAttention: 0,
    expiring72: 0,
    expired: 0,
  };

  return rows.reduce((a, r) => {
    if (r.field === "FIELD_READY") a.fieldReady++;
    if (r.external === "READY") a.ready811++;
    if (r.external === "WAITING_ON_811") a.waiting++;
    if (r.field === "CONTRACTOR_LOCATE_REQUIRED" || r.field === "CONTRACTOR_LOCATE_IN_PROGRESS")
      a.contractorRequired++;
    if (
      r.external === "NEEDS_REVIEW" ||
      r.external === "LOOKUP_ERROR" ||
      r.field === "CONTRACTOR_LOCATE_ISSUE"
    )
      a.needsAttention++;
    if (r.urgency === "warning" || r.urgency === "critical") a.expiring72++;
    if (r.urgency === "expired") a.expired++;
    return a;
  }, zero);
}

/** One ticket, with everything the detail page draws. */
export async function getLocateDetail(id: string) {
  const { where } = await scope();
  if (!where) return null;

  const t = await prisma.locateTicket.findFirst({
    where: { id, ...where },
    include: {
      ...TICKET_INCLUDE,
      responses: {
        orderBy: { member: "asc" },
      },
      contractorLocates: {
        include: {
          assignedCrew: { select: { id: true, company: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          locatedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { utilityName: "asc" },
      },
      changes: { orderBy: { at: "desc" }, take: 60 },
      checks: { orderBy: { checkedAt: "desc" }, take: 20 },
    },
  });
  if (!t) return null;

  const zone = zoneForState(t.state);
  const rules = rulesOf(t.project);
  const lastCheck = t.checks[0] ?? null;
  const lastCheckFailed = Boolean(
    lastCheck && !lastCheck.success && lastCheck.providerStatus !== "LOOKUP_UNAVAILABLE",
  );

  const r = readiness({
    ticket: t,
    responses: t.responses,
    rules,
    contractorLocates: t.contractorLocates.map((c) => ({
      utilityName: c.utilityName,
      status: c.status,
    })),
    lookupFailed: lastCheckFailed,
    today: todayIn(zone),
  });

  const provider = providerFor(t.provider);

  return {
    ticket: {
      id: t.id,
      number: t.number,
      revision: t.revision,
      provider: t.provider,
      providerName: provider.name,
      providerReady: provider.ready(),
      providerDetail: provider.readyDetail(),
      state: t.state,
      street: t.street,
      crossStreet: t.crossStreet,
      city: t.city,
      county: t.county,
      workType: t.workType,
      ticketType: t.ticketType,
      workAreaDescription: t.workAreaDescription,
      locateInstructions: t.locateInstructions,
      excavatorName: t.excavatorName,
      contactName: t.contactName,
      contactPhone: t.contactPhone,
      calledInOn: t.calledInOn,
      workToBeginOn: t.workToBeginOn,
      responseBy: t.responseBy,
      updateBy: t.updateBy,
      expiresOn: r.standing.expiresOn,
      expiryEstimated: r.expiryEstimated,
      daysToExpiry: r.standing.daysToExpiry,
      urgency: expiryUrgency(r.standing.daysToExpiry),
      notes: t.notes,
      sourceUrl: t.sourceUrl || provider.ticketUrl(t.number),
      monitoringEnabled: t.monitoringEnabled,
      lastCheckedAt: t.lastCheckedAt?.toISOString() ?? null,
      nextCheckAt: t.nextCheckAt?.toISOString() ?? null,
      timeZone: zone,
      projectId: t.project?.id ?? null,
      projectName: t.project?.name ?? "",
      crewId: t.crew?.id ?? null,
      crewName: t.crew?.company ?? "",
      assignedToName: t.assignedTo?.name || t.assignedTo?.email || "",
    },
    readiness: r,
    /** Each member, with whose job it is to locate them on this project. */
    responses: t.responses.map((x) => {
      const rule = rules.find((rr) => {
        const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const a = squash(x.member);
        const b = squash(rr.utilityName);
        return b && (a.includes(b) || b.includes(a));
      });
      return {
        id: x.id,
        member: x.member,
        code: x.code,
        facilityType: x.facilityType,
        status: x.status,
        responseCode: x.responseCode,
        responseDescription: x.responseDescription,
        respondedOn: x.respondedOn,
        note: x.note,
        performedBy: rule?.performedBy ?? "MEMBER",
      };
    }),
    contractorLocates: t.contractorLocates.map((c) => ({
      id: c.id,
      utilityName: c.utilityName,
      utilityCode: c.utilityCode,
      status: c.status,
      assignedCrewId: c.assignedCrewId,
      assignedCrewName: c.assignedCrew?.company ?? "",
      assignedToId: c.assignedToId,
      assignedToName: c.assignedTo?.name || c.assignedTo?.email || "",
      locatedByName: c.locatedBy?.name || c.locatedBy?.email || "",
      locatedAt: c.locatedAt?.toISOString() ?? null,
      frequencyUsed: c.frequencyUsed,
      signalQuality: c.signalQuality,
      notes: c.notes,
      photos: (Array.isArray(c.photos) ? c.photos : []) as string[],
    })),
    rules,
    changes: t.changes.map((c) => ({
      id: c.id,
      kind: c.kind,
      subject: c.subject,
      fromValue: c.fromValue,
      toValue: c.toValue,
      summary: c.summary,
      actor: c.actor,
      at: c.at.toISOString(),
    })),
    checks: t.checks.map((c) => ({
      id: c.id,
      checkedAt: c.checkedAt.toISOString(),
      checkType: c.checkType,
      success: c.success,
      providerStatus: c.providerStatus,
      errorMessage: c.errorMessage,
      changesDetected: c.changesDetected,
      durationMs: c.durationMs,
    })),
  };
}

/** What a crew can actually work, grouped the way a dispatcher thinks. */
export async function getCrewReadiness(crewId?: string) {
  const { rows } = await getLocateRows({ crewId, take: 500 });
  return {
    fieldReady: rows.filter((r) => r.field === "FIELD_READY"),
    needsOurLocate: rows.filter(
      (r) =>
        r.field === "CONTRACTOR_LOCATE_REQUIRED" || r.field === "CONTRACTOR_LOCATE_IN_PROGRESS",
    ),
    waiting: rows.filter((r) => r.external === "WAITING_ON_811"),
    attention: rows.filter(
      (r) =>
        r.field === "CONTRACTOR_LOCATE_ISSUE" ||
        r.external === "LOOKUP_ERROR" ||
        r.external === "NEEDS_REVIEW",
    ),
    expiring: rows.filter((r) => r.urgency === "warning" || r.urgency === "critical"),
    expired: rows.filter((r) => r.urgency === "expired"),
  };
}

/** Locate counts for one project, for the project page strip. */
export async function getProjectLocateSummary(projectId: string) {
  const { rows } = await getLocateRows({ projectId, take: 500 });
  return {
    total: rows.length,
    fieldReady: rows.filter((r) => r.field === "FIELD_READY").length,
    ready811: rows.filter((r) => r.external === "READY").length,
    contractorRequired: rows.filter(
      (r) =>
        r.field === "CONTRACTOR_LOCATE_REQUIRED" || r.field === "CONTRACTOR_LOCATE_IN_PROGRESS",
    ).length,
    waiting: rows.filter((r) => r.external === "WAITING_ON_811").length,
    expiring: rows.filter((r) => r.urgency === "warning" || r.urgency === "critical").length,
    expired: rows.filter((r) => r.urgency === "expired").length,
  };
}

/** What moved since a given moment — the "what changed" answer. */
export async function getRecentChanges(sinceHours = 24) {
  const { where } = await scope();
  if (!where) return [];
  const since = new Date(Date.now() - sinceHours * 3600_000);

  const changes = await prisma.locateTicketChange.findMany({
    where: { at: { gte: since }, ticket: where },
    include: {
      ticket: { select: { id: true, number: true, street: true, project: { select: { name: true } } } },
    },
    orderBy: { at: "desc" },
    take: 100,
  });

  return changes.map((c) => ({
    id: c.id,
    kind: c.kind,
    summary: c.summary,
    subject: c.subject,
    fromValue: c.fromValue,
    toValue: c.toValue,
    actor: c.actor,
    at: c.at.toISOString(),
    ticketId: c.ticket.id,
    ticketNumber: c.ticket.number,
    street: c.ticket.street,
    projectName: c.ticket.project?.name ?? "",
  }));
}

/** The projects and crews a picker offers. */
export async function getLocatePickers() {
  const me = await getCurrentUser();
  if (!me || !isStaff(me.role)) return { projects: [], crews: [], users: [] };
  const [projects, crews, users] = await Promise.all([
    prisma.project.findMany({
      where: { completedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.subcontractor.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } }),
    prisma.user.findMany({
      where: { subcontractorId: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    projects,
    crews,
    users: users.map((u) => ({ id: u.id, name: u.name || u.email })),
  };
}

/** The locate responsibility rules on a project. */
export async function getProjectLocateRules(projectId: string) {
  const me = await getCurrentUser();
  if (!me || !isStaff(me.role)) return [];
  return prisma.projectLocateRule.findMany({
    where: { projectId },
    orderBy: { utilityName: "asc" },
  });
}
