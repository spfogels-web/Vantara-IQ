import "server-only";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/authz";

/**
 * The prospect pipeline, as a CRM.
 *
 * Staff only, all of it. Prequalification notes, lost reasons, rate
 * evaluations and scoring are internal judgements about companies we work
 * with; a crew reading why we scored them 62 is not a feature.
 */

export interface ProspectRow {
  id: string;
  kind: string;
  stage: string;
  name: string;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  city: string;
  homeState: string;
  states: string[];
  markets: string[];
  trades: string[];
  crewSize: number;
  availability: string;
  availableCrews: number;
  earliestStart: string;
  owner: string;
  ownerUserId: string | null;
  source: string;
  nextStep: string;
  nextStepDue: string;
  lastContact: string;
  /** Days past the follow-up date. 0 when on time or absent. */
  overdueDays: number;
  dueToday: boolean;
  /** Days since anybody logged a touch. Null when never contacted. */
  daysSinceContact: number | null;
  /** How long it has sat in the stage it is in. */
  stageDays: number;
  equipmentCount: number;
  rateCount: number;
  contactCount: number;
  qualificationPct: number;
  score: number;
  scoreBand: string;
  /** Why the score is what it is, in words. */
  scoreReasons: { label: string; got: number; of: number; note: string }[];
  /** What is wrong with this record, said plainly. */
  flags: string[];
  convertedSubcontractorId: string | null;
  closedReason: string;
}

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const daysBetween = (from: string, to: string) => {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
};

const CLOSED = ["WON", "LOST", "DORMANT", "DO_NOT_USE"];

/**
 * How well a crew prospect fits.
 *
 * Deliberately not a black box. Every component is a number out of a number
 * with a sentence attached, because a recruiter who cannot see why somebody
 * scored 62 will not trust the 86 either.
 *
 * Missing data costs points but is never called a fault: a prospect nobody has
 * asked about equipment yet is unknown, not unsuitable, and the sentence says
 * so rather than implying they are bad.
 */
function scoreCrew(p: {
  availability: string;
  availableCrews: number;
  crewSize: number;
  states: string[];
  markets: string[];
  trades: string[];
  equipmentCount: number;
  rateCount: number;
  qualificationPct: number;
}): { score: number; band: string; reasons: ProspectRow["scoreReasons"] } {
  const reasons: ProspectRow["scoreReasons"] = [];

  const capacity =
    p.availableCrews >= 3 ? 20 : p.availableCrews === 2 ? 16 : p.availableCrews === 1 ? 11 : p.crewSize > 0 ? 6 : 0;
  reasons.push({
    label: "Capacity",
    got: capacity,
    of: 20,
    note:
      p.availableCrews > 0
        ? `${p.availableCrews} crew${p.availableCrews === 1 ? "" : "s"} they say are free`
        : p.crewSize > 0
          ? `${p.crewSize} on the crew, none marked available`
          : "Nobody has recorded how many crews they run",
  });

  const equip = Math.min(20, p.equipmentCount * 5);
  reasons.push({
    label: "Equipment",
    got: equip,
    of: 20,
    note:
      p.equipmentCount > 0
        ? `${p.equipmentCount} piece${p.equipmentCount === 1 ? "" : "s"} on file`
        : "No equipment recorded yet",
  });

  const market = Math.min(20, p.states.length * 7 + p.markets.length * 3);
  reasons.push({
    label: "Market fit",
    got: market,
    of: 20,
    note:
      p.states.length > 0
        ? `Works ${p.states.join(", ")}`
        : "No states recorded, so nobody can tell where they work",
  });

  const avail =
    p.availability === "AVAILABLE_NOW"
      ? 20
      : p.availability === "AVAILABLE_SOON"
        ? 15
        : p.availability === "LIMITED"
          ? 9
          : p.availability === "COMMITTED"
            ? 4
            : 0;
  reasons.push({
    label: "Availability",
    got: avail,
    of: 20,
    note:
      p.availability === "UNKNOWN"
        ? "Nobody has asked when they can start"
        : p.availability.replace(/_/g, " ").toLowerCase(),
  });

  const docs = Math.round((p.qualificationPct / 100) * 10);
  reasons.push({
    label: "Documentation",
    got: docs,
    of: 10,
    note: `${p.qualificationPct}% of the prequalification list is in`,
  });

  const rateFit = p.rateCount > 0 ? Math.min(10, 4 + p.rateCount) : 0;
  reasons.push({
    label: "Rate fit",
    got: rateFit,
    of: 10,
    note: p.rateCount > 0 ? `${p.rateCount} rates quoted` : "They have not quoted a rate",
  });

  const score = capacity + equip + market + avail + docs + rateFit;
  const band = score >= 75 ? "Strong match" : score >= 50 ? "Worth pursuing" : score >= 25 ? "Early" : "Unknown";
  return { score, band, reasons };
}

/** What is wrong with the record, in sentences a person can act on. */
function flagsFor(p: {
  stage: string;
  nextStep: string;
  nextStepDue: string;
  daysSinceContact: number | null;
  stageDays: number;
  phone: string;
  email: string;
  overdueDays: number;
  duplicateOfId: string | null;
}): string[] {
  const out: string[] = [];
  const closed = CLOSED.includes(p.stage);

  if (p.overdueDays > 0) out.push(`Follow-up ${p.overdueDays} day${p.overdueDays === 1 ? "" : "s"} overdue.`);
  if (!closed && !p.nextStep.trim()) out.push("No next step. Nobody has decided what happens with this one.");
  if (!closed && (p.daysSinceContact ?? 0) >= 30) {
    out.push(`No contact in ${p.daysSinceContact} days.`);
  }
  if (!closed && p.stageDays >= 45) {
    out.push(`Sitting in this stage ${p.stageDays} days.`);
  }
  if (!p.phone.trim() && !p.email.trim()) out.push("No phone and no email — there is no way to reach them.");
  if (p.duplicateOfId) out.push("Flagged as a possible duplicate of another record.");
  return out;
}

export async function getProspectRows(): Promise<ProspectRow[]> {
  await requireStaff();
  const now = today();

  const rows = await prisma.prospect.findMany({
    orderBy: { updatedAt: "desc" },
    take: 500,
    include: {
      ownerUser: { select: { name: true, email: true } },
      _count: { select: { equipmentItems: true, rates: true, contacts: true } },
      qualifications: { select: { status: true } },
    },
  });

  return rows.map((p) => {
    const quals = p.qualifications;
    const done = quals.filter((q) => q.status === "complete" || q.status === "na").length;
    const qualificationPct = quals.length ? Math.round((done / quals.length) * 100) : 0;

    const overdueDays =
      p.nextStepDue && !CLOSED.includes(p.stage) && p.nextStepDue < now
        ? daysBetween(p.nextStepDue, now)
        : 0;
    const daysSinceContact = p.lastContact ? daysBetween(p.lastContact, now) : null;
    const stageDays = Math.max(
      0,
      Math.floor((Date.now() - p.stageEnteredAt.getTime()) / 86_400_000),
    );

    const { score, band, reasons } = scoreCrew({
      availability: p.availability,
      availableCrews: p.availableCrews,
      crewSize: p.crewSize,
      states: p.states,
      markets: p.markets,
      trades: p.trades,
      equipmentCount: p._count.equipmentItems,
      rateCount: p._count.rates,
      qualificationPct,
    });

    return {
      id: p.id,
      kind: p.kind,
      stage: p.stage,
      name: p.name,
      contactName: p.contactName,
      contactRole: p.contactRole,
      email: p.email,
      phone: p.phone,
      city: p.city,
      homeState: p.homeState,
      states: p.states,
      markets: p.markets,
      trades: p.trades,
      crewSize: p.crewSize,
      availability: p.availability,
      availableCrews: p.availableCrews,
      earliestStart: p.earliestStart,
      owner: p.ownerUser?.name || p.ownerUser?.email || p.owner,
      ownerUserId: p.ownerUserId,
      source: p.source,
      nextStep: p.nextStep,
      nextStepDue: p.nextStepDue,
      lastContact: p.lastContact,
      overdueDays,
      dueToday: Boolean(p.nextStepDue) && p.nextStepDue === now && !CLOSED.includes(p.stage),
      daysSinceContact,
      stageDays,
      equipmentCount: p._count.equipmentItems,
      rateCount: p._count.rates,
      contactCount: p._count.contacts,
      qualificationPct,
      score,
      scoreBand: band,
      scoreReasons: reasons,
      flags: flagsFor({
        stage: p.stage,
        nextStep: p.nextStep,
        nextStepDue: p.nextStepDue,
        daysSinceContact,
        stageDays,
        phone: p.phone,
        email: p.email,
        overdueDays,
        duplicateOfId: p.duplicateOfId,
      }),
      convertedSubcontractorId: p.convertedSubcontractorId,
      closedReason: p.closedReason,
    };
  });
}

/**
 * Everything behind one prospect, loaded only when a row is opened.
 *
 * Deliberately not part of the list query: equipment, rates, references and a
 * timeline for five hundred prospects is a page nobody waits for.
 */
export async function getProspectDetail(id: string) {
  await requireStaff();
  const p = await prisma.prospect.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ primary: "desc" }, { name: "asc" }] },
      equipmentItems: { orderBy: { category: "asc" } },
      capabilities: { orderBy: { trade: "asc" } },
      rates: { orderBy: { code: "asc" } },
      references: { orderBy: { createdAt: "desc" } },
      qualifications: { orderBy: { item: "asc" } },
      opportunities: { orderBy: { createdAt: "desc" } },
      availabilityLog: { orderBy: { createdAt: "desc" }, take: 10 },
      activities: { orderBy: { createdAt: "desc" }, take: 40 },
    },
  });
  if (!p) return null;

  // Tasks and conversations already exist elsewhere; the CRM links to them
  // rather than keeping its own copies.
  const [tasks, conversation] = await Promise.all([
    prisma.task.findMany({
      where: { detail: { contains: p.name } , status: { not: "CANCELLED" } },
      select: { id: true, title: true, status: true, dueDate: true, priority: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.conversation.findFirst({
      where: { title: p.name, archivedAt: null },
      select: { id: true },
    }),
  ]);

  return {
    ...p,
    stageEnteredAt: p.stageEnteredAt.toISOString(),
    convertedAt: p.convertedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    availabilityLog: p.availabilityLog.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    activities: p.activities.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    qualifications: p.qualifications.map((q) => ({ ...q, updatedAt: q.updatedAt.toISOString() })),
    opportunities: p.opportunities.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
    contacts: p.contacts.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    equipmentItems: p.equipmentItems.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    rates: p.rates.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    references: p.references.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    tasks,
    conversationId: conversation?.id ?? null,
  };
}

/** The five figures across the top. Each one is a filter. */
export async function getProspectOverview() {
  const rows = await getProspectRows();
  const live = rows.filter((r) => !CLOSED.includes(r.stage));
  return {
    pipeline: live.length,
    followUpsDue: live.filter((r) => r.dueToday || r.overdueDays > 0).length,
    overdue: live.filter((r) => r.overdueDays > 0).length,
    availableCrews: rows.filter(
      (r) => r.kind === "SUBCONTRACTOR" && r.availability === "AVAILABLE_NOW",
    ).length,
    readyToOnboard: rows.filter((r) => r.stage === "READY_TO_ONBOARD").length,
    primeOpportunities: rows.filter((r) => r.kind === "PRIME" && !CLOSED.includes(r.stage)).length,
  };
}

/**
 * Rates a prospect quoted, held against what the customer pays on a job.
 *
 * Only where both numbers exist. A margin calculated with half the rates
 * missing is worse than no margin, because somebody will act on it.
 */
export async function getRateFit(prospectId: string, projectId: string) {
  await requireStaff();

  const [theirs, project] = await Promise.all([
    prisma.prospectRate.findMany({ where: { prospectId } }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, market: true, customerId: true },
    }),
  ]);
  if (!project || theirs.length === 0) return null;

  const ours = await prisma.customerRate.findMany({
    where: { customerId: project.customerId ?? "__none__" },
    select: { code: true, rate: true, unit: true },
  });
  const byCode = new Map(ours.map((r) => [r.code.trim().toUpperCase(), r]));

  const lines = theirs.map((t) => {
    const mine = byCode.get(t.code.trim().toUpperCase());
    const revenue = mine?.rate ?? null;
    const spread = revenue == null ? null : Math.round((revenue - t.rate) * 100) / 100;
    return {
      code: t.code,
      unit: t.unit,
      theirRate: t.rate,
      ourRate: revenue,
      spread,
      marginPct:
        revenue && revenue > 0 && spread != null ? Math.round((spread / revenue) * 1000) / 10 : null,
    };
  });

  const priced = lines.filter((l) => l.ourRate != null);
  return {
    projectName: project.name,
    lines,
    matched: priced.length,
    unmatched: lines.length - priced.length,
  };
}
