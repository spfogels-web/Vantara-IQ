import "server-only";

import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/auth";
import { requireUser } from "@/lib/authz";
import { instancePosition, toleranceFor } from "@/lib/material-custody";

/**
 * Reading the material operation, scoped to who is asking.
 *
 * Staff see the yard. A crew sees what is in their own custody and nothing
 * else — what another subcontractor is holding is not theirs to read, the same
 * rule rates and conversations run on.
 */

export interface InstanceRow {
  id: string;
  code: string;
  description: string;
  category: string;
  unit: string;
  reelNumber: string;
  manufacturer: string;
  status: string;
  originalQty: number;
  issued: number;
  installed: number;
  returned: number;
  damaged: number;
  expectedRemaining: number;
  actualRemaining: number | null;
  variance: number | null;
  usedPct: number;
  projectId: string | null;
  projectName: string;
  custodianSubId: string | null;
  custodianName: string;
  crew: string;
  responsibleName: string;
  locationLabel: string;
  yardId: string;
  vehicle: string;
  trailer: string;
  checkedOutAt: string | null;
  issuedByName: string;
  lastVerifiedAt: string | null;
  lastVerifiedBy: string;
  /** Days since anybody physically looked at it. Null if never. */
  daysSinceVerified: number | null;
  /** Why this row is flagged, in words. Empty when it is fine. */
  risks: string[];
}

function scopeFor(user: { role: string; subcontractorId: string | null }) {
  if (isStaff(user.role as never)) return {};
  // A crew sees their own custody. Not the yard, not another company's.
  return user.subcontractorId
    ? { custodianSubId: user.subcontractorId }
    : { id: "__none__" };
}

/**
 * Why a reel needs somebody to look at it.
 *
 * Each flag is a sentence rather than a colour, because "flagged" tells an
 * inventory manager to open it and a sentence tells them whether they need to.
 */
function risksFor(
  inst: { status: string; checkedOutAt: Date | null; lastVerifiedAt: Date | null; originalQty: number },
  pos: { issued: number; installed: number; expectedRemaining: number; variance: number | null },
): string[] {
  const out: string[] = [];
  const days = (d: Date | null) => (d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null);

  if (pos.installed > pos.issued + toleranceFor(pos.issued)) {
    out.push(
      `Installed ${fmt(pos.installed)} against ${fmt(pos.issued)} issued. No transfer, return or adjustment explains the difference — verify before the affected dailies are billed.`,
    );
  }
  if (pos.expectedRemaining < 0) {
    out.push(`Expected remaining is ${fmt(pos.expectedRemaining)}, which is not possible. Something is recorded twice or against the wrong reel.`);
  }
  if (inst.originalQty > 0 && pos.installed > inst.originalQty + toleranceFor(inst.originalQty)) {
    out.push(`More has been installed off this than the reel ever held (${fmt(inst.originalQty)}).`);
  }
  if (pos.variance != null && Math.abs(pos.variance) > toleranceFor(pos.expectedRemaining)) {
    out.push(`Last count was ${pos.variance > 0 ? "+" : ""}${fmt(pos.variance)} against the ledger.`);
  }

  const outFor = days(inst.checkedOutAt);
  const seen = days(inst.lastVerifiedAt);
  if (inst.status === "CHECKED_OUT" || inst.status === "ACTIVE") {
    if (seen == null && outFor != null && outFor >= 14) {
      out.push(`Out ${outFor} days and never counted.`);
    } else if (seen != null && seen >= 14) {
      out.push(`Not counted in ${seen} days.`);
    }
  }
  return out;
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export async function getMaterialInstances(): Promise<InstanceRow[]> {
  const user = await requireUser();
  const rows = await prisma.materialInstance.findMany({
    where: scopeFor(user),
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
    include: {
      project: { select: { name: true } },
      custodian: { select: { company: true } },
    },
  });

  // Positions for every instance in one pass rather than a query per row.
  const ids = rows.map((r) => r.id);
  const events = ids.length
    ? await prisma.materialTransaction.findMany({
        where: { instanceId: { in: ids } },
        select: { instanceId: true, kind: true, quantity: true },
      })
    : [];

  const byInstance = new Map<string, { kind: string; quantity: number }[]>();
  for (const e of events) {
    if (!e.instanceId) continue;
    const held = byInstance.get(e.instanceId);
    if (held) held.push(e);
    else byInstance.set(e.instanceId, [e]);
  }

  return rows.map((r) => {
    const evs = byInstance.get(r.id) ?? [];
    const sum = (k: string) =>
      evs.filter((e) => e.kind === k).reduce((n, e) => n + Math.abs(e.quantity), 0);
    const issued = sum("ISSUE");
    const installed = sum("INSTALL");
    const returned = sum("RETURN");
    const damaged = sum("DAMAGE") + sum("DISPOSE");
    const expectedRemaining = Math.round((issued - installed - returned - damaged) * 100) / 100;
    const actualRemaining = r.lastVerifiedQty;
    const pos = {
      issued,
      installed,
      returned,
      damaged,
      expectedRemaining,
      actualRemaining,
      variance:
        actualRemaining == null
          ? null
          : Math.round((actualRemaining - expectedRemaining) * 100) / 100,
      usedPct: r.originalQty > 0 ? Math.min(100, Math.round((installed / r.originalQty) * 100)) : 0,
    };

    return {
      id: r.id,
      code: r.code,
      description: r.description,
      category: r.category,
      unit: r.unit,
      reelNumber: r.reelNumber,
      manufacturer: r.manufacturer,
      status: r.status,
      originalQty: r.originalQty,
      ...pos,
      projectId: r.projectId,
      projectName: r.project?.name ?? "",
      custodianSubId: r.custodianSubId,
      custodianName: r.custodian?.company ?? "",
      crew: r.crew,
      responsibleName: r.responsibleName,
      locationLabel: r.locationLabel,
      yardId: r.yardId ?? "",
      vehicle: r.vehicle,
      trailer: r.trailer,
      checkedOutAt: r.checkedOutAt?.toISOString() ?? null,
      issuedByName: r.issuedByName,
      lastVerifiedAt: r.lastVerifiedAt?.toISOString() ?? null,
      lastVerifiedBy: r.lastVerifiedBy,
      daysSinceVerified: r.lastVerifiedAt
        ? Math.floor((Date.now() - r.lastVerifiedAt.getTime()) / 86_400_000)
        : null,
      risks: risksFor(r, pos),
    };
  });
}

export interface InstanceHistoryEvent {
  id: string;
  kind: string;
  quantity: number;
  unit: string;
  at: string;
  from: string;
  to: string;
  person: string;
  actor: string;
  vehicle: string;
  reference: string;
  reason: string;
  expectedQty: number | null;
  actualQty: number | null;
  varianceReason: string;
  sourceDailyId: string;
  source: string;
  photos: string[];
}

/** One instance, with everything that ever happened to it. Append-only. */
export async function getInstanceDetail(id: string) {
  const user = await requireUser();
  const inst = await prisma.materialInstance.findFirst({
    where: { id, ...scopeFor(user) },
    include: {
      project: { select: { id: true, name: true } },
      custodian: { select: { id: true, company: true } },
    },
  });
  if (!inst) return null;

  const [pos, events] = await Promise.all([
    instancePosition(id),
    prisma.materialTransaction.findMany({
      where: { instanceId: id },
      orderBy: { at: "desc" },
      take: 100,
    }),
  ]);

  const names = new Map<string, string>();
  const subIds = [...new Set(events.flatMap((e) => [e.fromSubId, e.toSubId]).filter(Boolean))];
  if (subIds.length) {
    for (const s of await prisma.subcontractor.findMany({
      where: { id: { in: subIds } },
      select: { id: true, company: true },
    }))
      names.set(s.id, s.company);
  }
  const actors = [...new Set(events.map((e) => e.actorUserId).filter(Boolean))];
  const actorNames = new Map<string, string>();
  if (actors.length) {
    for (const u of await prisma.user.findMany({
      where: { id: { in: actors } },
      select: { id: true, name: true, email: true },
    }))
      actorNames.set(u.id, u.name || u.email);
  }

  const place = (sub: string, crew: string, person: string, loc: string) =>
    [names.get(sub) ?? "", crew, person, loc].filter(Boolean).join(" · ") || "Yard";

  return {
    instance: {
      id: inst.id,
      code: inst.code,
      description: inst.description,
      category: inst.category,
      unit: inst.unit,
      reelNumber: inst.reelNumber,
      lotNumber: inst.lotNumber,
      serialNumber: inst.serialNumber,
      manufacturer: inst.manufacturer,
      partNumber: inst.partNumber,
      status: inst.status,
      originalQty: inst.originalQty,
      projectId: inst.projectId,
      projectName: inst.project?.name ?? "",
      custodianSubId: inst.custodianSubId,
      custodianName: inst.custodian?.company ?? "",
      crew: inst.crew,
      responsibleName: inst.responsibleName,
      locationLabel: inst.locationLabel,
      vehicle: inst.vehicle,
      trailer: inst.trailer,
      checkedOutAt: inst.checkedOutAt?.toISOString() ?? null,
      issuedByName: inst.issuedByName,
      lastVerifiedAt: inst.lastVerifiedAt?.toISOString() ?? null,
      lastVerifiedQty: inst.lastVerifiedQty,
      lastVerifiedBy: inst.lastVerifiedBy,
      supplier: inst.supplier,
      poNumber: inst.poNumber,
    },
    position: pos,
    risks: risksFor(inst, pos),
    history: events.map((e): InstanceHistoryEvent => ({
      id: e.id,
      kind: e.kind,
      quantity: Math.abs(e.quantity),
      unit: e.unit,
      at: e.at.toISOString(),
      from: place(e.fromSubId, e.fromCrew, e.fromPerson, e.fromLocation),
      to: place(e.toSubId, e.toCrew, e.toPerson, e.toLocation),
      person: e.receivedBy,
      actor: actorNames.get(e.actorUserId) ?? "",
      vehicle: [e.vehicle, e.trailer].filter(Boolean).join(" / "),
      reference: e.reference,
      reason: e.reason,
      expectedQty: e.expectedQty,
      actualQty: e.actualQty,
      varianceReason: e.varianceReason,
      sourceDailyId: e.sourceDailyId,
      source: e.source,
      photos: Array.isArray(e.photos) ? (e.photos as string[]) : [],
    })),
  };
}

/** The numbers across the top of the page. Each one is a filter. */
export async function getMaterialOverview() {
  const rows = await getMaterialInstances();
  const onHand = rows.filter((r) => ["AVAILABLE", "RECEIVED", "RESERVED"].includes(r.status));
  const out = rows.filter((r) => ["CHECKED_OUT", "ACTIVE", "IN_TRANSIT"].includes(r.status));
  const low = rows.filter((r) => ["LOW", "NEARLY_EMPTY"].includes(r.status));
  const flagged = rows.filter((r) => r.risks.length > 0);
  const unverified = rows.filter(
    (r) => ["CHECKED_OUT", "ACTIVE"].includes(r.status) && (r.daysSinceVerified ?? 999) >= 14,
  );

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const issuedToday = await prisma.materialTransaction.count({
    where: { kind: "ISSUE", at: { gte: since } },
  });

  return {
    total: rows.length,
    onHand: onHand.length,
    checkedOut: out.length,
    low: low.length,
    flagged: flagged.length,
    unverified: unverified.length,
    issuedToday,
  };
}

/** Recent movement across the whole operation. */
export async function getMaterialActivity(take = 25) {
  const user = await requireUser();
  const staff = isStaff(user.role as never);

  const events = await prisma.materialTransaction.findMany({
    where: staff ? {} : { custodianSubId: user.subcontractorId ?? "__none__" },
    orderBy: { at: "desc" },
    take,
    select: {
      id: true, kind: true, code: true, quantity: true, unit: true, at: true,
      reelNumber: true, toCrew: true, toPerson: true, actorUserId: true,
      instanceId: true, projectId: true, sourceDailyId: true,
    },
  });

  const actorIds = [...new Set(events.map((e) => e.actorUserId).filter(Boolean))];
  const actors = new Map<string, string>();
  if (actorIds.length) {
    for (const u of await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    }))
      actors.set(u.id, u.name || u.email);
  }

  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    code: e.code,
    quantity: Math.abs(e.quantity),
    unit: e.unit,
    at: e.at.toISOString(),
    reelNumber: e.reelNumber,
    crew: e.toCrew,
    person: e.toPerson,
    actor: actors.get(e.actorUserId) ?? "",
    instanceId: e.instanceId,
    fromDaily: Boolean(e.sourceDailyId),
  }));
}

/** Who is holding what, by company. Prime-contractor accountability. */
export async function getCustodyBySubcontractor() {
  await requireUser();
  const rows = await getMaterialInstances();
  const held = rows.filter((r) => r.custodianSubId);

  const map = new Map<
    string,
    { id: string; name: string; items: number; issued: number; installed: number; returned: number; unexplained: number; flagged: number; lastVerified: string | null }
  >();

  for (const r of held) {
    const k = r.custodianSubId!;
    const cur =
      map.get(k) ??
      { id: k, name: r.custodianName, items: 0, issued: 0, installed: 0, returned: 0, unexplained: 0, flagged: 0, lastVerified: null };
    cur.items += 1;
    cur.issued += r.issued;
    cur.installed += r.installed;
    cur.returned += r.returned;
    // Not called loss. Until somebody counts it, it is material the records
    // do not explain — which is a different statement from material missing.
    cur.unexplained += Math.max(0, r.issued - r.installed - r.returned - r.damaged - Math.max(0, r.expectedRemaining));
    if (r.risks.length) cur.flagged += 1;
    if (r.lastVerifiedAt && (!cur.lastVerified || r.lastVerifiedAt > cur.lastVerified)) {
      cur.lastVerified = r.lastVerifiedAt;
    }
    map.set(k, cur);
  }

  return [...map.values()].sort((a, b) => b.issued - a.issued);
}

/** The reasons offered when a count comes out different. */
export async function getVarianceReasons() {
  const rows = await prisma.varianceReason.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map((r) => ({ label: r.label, needsComment: r.needsComment }));
}

export interface YardRow {
  id: string;
  name: string;
  primeContractor: string;
  market: string;
  city: string;
  status: string;
  /** What is standing in this yard right now. */
  onHand: number;
  /** Issued from here and still out with somebody. */
  checkedOut: number;
  flagged: number;
  total: number;
}

/**
 * The yards, each with its own counts.
 *
 * A prime like Globe runs five to ten of these and the material in one has
 * nothing to do with the material in another — a single company-wide total is
 * a number nobody can act on, because nobody can drive to it.
 *
 * Counted from the instances rather than stored on the yard: a stored count is
 * a number that drifts the first time somebody moves a reel.
 */
export async function getYards(): Promise<YardRow[]> {
  const user = await requireUser();
  const [yards, rows] = await Promise.all([
    prisma.yard.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: [{ primeContractor: "asc" }, { name: "asc" }],
    }),
    getMaterialInstances(),
  ]);
  void user;

  const tally = (id: string) => {
    const mine = rows.filter((r) => (r.yardId ?? "") === id);
    return {
      total: mine.length,
      onHand: mine.filter((r) => ["AVAILABLE", "RECEIVED", "RESERVED"].includes(r.status)).length,
      checkedOut: mine.filter((r) => ["CHECKED_OUT", "ACTIVE", "IN_TRANSIT"].includes(r.status)).length,
      flagged: mine.filter((r) => r.risks.length > 0).length,
    };
  };

  const out: YardRow[] = yards.map((y) => ({
    id: y.id,
    name: y.name,
    primeContractor: y.primeContractor,
    market: y.market,
    city: y.city,
    status: y.status,
    ...tally(y.id),
  }));

  // Material received before anybody set a yard up still has to be findable.
  const loose = tally("");
  if (loose.total > 0) {
    out.push({
      id: "",
      name: "No yard set",
      primeContractor: "",
      market: "",
      city: "",
      status: "ACTIVE",
      ...loose,
    });
  }
  return out;
}
