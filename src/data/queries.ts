import "server-only";

import { cache } from "react";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ratesForMarket } from "@/lib/markets";
import {
  assertOwnSubcontractor,
  assertProjectAccess,
  requireStaff,
  requireUser,
  viewer,
  visibleProjectIds,
} from "@/lib/authz";
import { packetStatus } from "@/lib/vendor-packet";
import { badgeReadiness } from "@/lib/badge";
import { isStaff } from "@/lib/auth";
import { addDays, balanceOf, billingWeekFor, isPastDue, weekOf } from "@/lib/billing";
import { amountPayable, canElectFastPay, dueDateFromCutoff } from "@/lib/fast-pay";
import { schedulePosition, type SchedulePosition } from "@/lib/schedule";
import {
  STANDING_LABEL,
  canDig,
  ticketStanding,
  type LocateStanding,
} from "@/lib/locates";
import {
  findRate,
  priceQuantities,
  valueProject,
  type PricingResult,
  type QuantityRow,
  type Valuation,
} from "@/lib/pricing";
import {
  codeGroupLabel,
  compareByPriority,
  isLinearFootageCode,
  normalizeCode,
  isAerialCode,
  isMainBillableCode,
  isPriorityCode,
  productionMethod,
  type ProductionMethod,
} from "@/lib/unit-codes";
// The operations centre no longer reads fixtures. What is left here is
// awaiting the same treatment: invoices and materials have real tables behind
// them, pay applications and reports do not exist yet.
import {
  invoices,
  materials,
  organization,
  reportDefinitions,
} from "@/data/mock";
import type {
  AppNotification,
  BriefItem,
  Customer,
  CustomerContact,
  DailyFlag,
  DailyLineItem,
  DailyReport,
  Deadline,
  HealthSummary,
  Invoice,
  Kpi,
  Material,
  MissingDocument,
  Organization,
  PayApplication,
  ProductionSummary,
  Project,
  RateSheetItem,
  ReportDefinition,
  RevenueSummary,
  Subcontractor,
  Prospect,
  SubScorecard,
  Tone,
} from "@/lib/types";

/**
 * The single seam between the UI and its data.
 *
 * Entity data (customers, projects, subcontractors, dailies) now comes from
 * Postgres via Prisma. Aggregate/derived dashboard panels (KPIs, AI brief,
 * production, revenue, crews, deadlines, docs, notifications, invoices, pay apps,
 * reports) still read fixtures — they'll move to computed queries as those
 * features are built out. Either way, components never touch a fixture directly.
 */
/* -- Mappers: DB row -> the plain TS types the components already expect ---- */

type CustomerRow = Awaited<ReturnType<typeof prisma.customer.findMany>>[number] & {
  _count?: { projects: number };
};

function toCustomer(r: CustomerRow, activeProjects: number): Customer {
  return {
    id: r.id,
    name: r.name,
    shortCode: r.shortCode,
    industry: r.industry as Customer["industry"],
    tone: r.tone as Tone,
    status: r.status as Customer["status"],
    logoTint: r.logoTint as Tone,
    location: r.location,
    contacts: (r.contacts as unknown as CustomerContact[]) ?? [],
    billingEmail: r.billingEmail,
    paymentTerms: r.paymentTerms,
    retainagePct: r.retainagePct,
    invoiceMinimum: r.invoiceMinimum,
    activeProjects,
    contractValue: r.contractValue,
    billedToDate: r.billedToDate,
    openAr: r.openAr,
    avgDaysToPay: r.avgDaysToPay,
    rateSheet: (r.rateSheet as unknown as RateSheetItem[]) ?? [],
    notes: r.notes,
    since: r.since,
  };
}

/**
 * The columns a list of projects actually draws.
 *
 * `mapUrl`, `mapOriginalUrl` and `markups` are deliberately absent. A map
 * uploaded through the server fallback is stored inline as base64, and the two
 * URL columns hold the same file — so selecting the whole row made rendering
 * five project rows pull 13 MB out of Postgres, on every page that lists jobs.
 * Crews open these screens on a phone with one bar of service. A list query
 * fetches what a list shows and nothing else.
 */
const PROJECT_LIST_SELECT = {
  id: true,
  number: true,
  name: true,
  client: true,
  location: true,
  status: true,
  tone: true,
  market: true,
  completedAt: true,
  remainingFt: true,
  requiredFtPerDay: true,
  actualFtPerDay: true,
  forecast: true,
  forecastTone: true,
  health: true,
  deadline: true,
  pctComplete: true,
  crew: true,
  updatedAt: true,
  photoUrl: true,
  // Who is actually on it. The  string above is typed once when the
  // project is created and says "Unassigned" on jobs a crew has been working
  // for a fortnight; this relation is the assignment that means something.
  crews: { select: { company: true } },
} as const;

/** A row from either query: the list select, or a full single-project row. */
type ProjectListRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_LIST_SELECT }> & {
  mapUrl?: string | null;
  markups?: unknown;
  hasMap?: boolean;
};

/**
 * Map presence, without the map.
 *
 * A list wants two facts: whether a plan exists, and a cover image when the map
 * is a raster we can draw. Both are answerable cheaply. A map small enough to
 * be a real URL is passed through; anything larger is reported as present and
 * left on the server rather than pushed down a job-site connection.
 */
async function mapSummaries(ids: string[]): Promise<Map<string, { mapUrl: string | null; hasMap: boolean }>> {
  const out = new Map<string, { mapUrl: string | null; hasMap: boolean }>();
  if (ids.length === 0) return out;
  const rows = await prisma.$queryRaw<{ id: string; mapUrl: string | null; hasMap: boolean }[]>`
    select id,
           case when length("mapUrl") <= 4096 then "mapUrl" end as "mapUrl",
           ("mapUrl" is not null) as "hasMap"
      from "Project"
     where id in (${Prisma.join(ids)})`;
  for (const r of rows) out.set(r.id, { mapUrl: r.mapUrl, hasMap: r.hasMap });
  return out;
}

function toProject(r: ProjectListRow): Project {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    client: r.client,
    location: r.location,
    status: r.status as Project["status"],
    tone: r.tone as Tone,
    market: r.market ?? "",
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    remainingFt: r.remainingFt,
    requiredFtPerDay: r.requiredFtPerDay,
    actualFtPerDay: r.actualFtPerDay,
    forecast: r.forecast,
    forecastTone: r.forecastTone as Tone,
    health: r.health,
    pctComplete: r.pctComplete,
    crew: r.crew,
    updatedAt: r.updatedAt,
    // A finished job is finished. Percent complete is otherwise a footage
    // ratio, and it reads whatever the dailies happen to add up to — 34% on a
    // job the crew walked off weeks ago.
    ...(r.completedAt ? { pctComplete: 100, remainingFt: 0 } : null),
    mapUrl: r.mapUrl ?? null,
    hasMap: r.hasMap ?? r.mapUrl != null,
    photoUrl: r.photoUrl,
    markups: r.markups,
  };
}

const SUBSTATE_LABEL: Record<string, Subcontractor["state"]> = {
  ACTIVE: "Active",
  ONBOARDING: "Onboarding",
  PENDING_REVIEW: "Pending review",
  INVITED: "Invited",
  INACTIVE: "Inactive",
};

/** A subcontractor row read with its assigned projects included. */
type SubRow = Awaited<ReturnType<typeof prisma.subcontractor.findMany>>[number] & {
  projects?: { id: string; name: string; number: string }[];
  /** Which document slots this crew has actually filled. */
  filedSections?: string[];
};

/**
 * Which uploaded document answers which compliance line.
 *
 * One certificate normally evidences both liability and workers comp, which
 * is what the upload form asks for in a single slot, so both lines are
 * satisfied by it. Splitting them would demand a document the form never
 * offers anywhere to put, and the item could then never be cleared.
 */
const COMPLIANCE_SOURCE: Record<string, string> = {
  "general liability coi": "insurance",
  "certificate of insurance": "insurance",
  "coi": "insurance",
  "w-9": "w9",
  "w9": "w9",
  // The master subcontract is the subcontractor agreement — one document under
  // two names, depending on which screen you are reading.
  "master subcontract": "agreement",
  "subcontractor agreement": "agreement",
  "signed subcontractor agreement": "agreement",
  "mutual nda": "nda",
  "nda": "nda",
};

/** Labels are typed by hand and carry either apostrophe, or none. */
const labelKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Compliance as it actually stands.
 *
 * An item is satisfied when the document answering it has been uploaded. The
 * stored status is kept as a floor rather than discarded, so a certificate the
 * office received by email and marked valid by hand is not undone by there
 * being no upload behind it — this can raise a line to valid, never lower one.
 */
function complianceFrom(
  stored: Subcontractor["compliance"],
  filedSections: string[],
): Subcontractor["compliance"] {
  const filed = new Set(filedSections);
  const today = new Date().toISOString().slice(0, 10);

  return stored.map((item) => {
    if (item.status === "valid" || item.status === "expiring") return item;

    const source = COMPLIANCE_SOURCE[labelKey(item.label)];
    if (source && filed.has(source)) {
      // The document arrived. A waiver that has been honoured is spent, so it
      // is dropped rather than left on the record looking still-granted.
      const { waiver: _spent, ...rest } = item;
      return { ...rest, status: "valid" as const, expires: item.expires || "On file" };
    }

    // Nothing on file, but the office has vouched for it and said until when.
    // Checked against today every read, so it lapses without anyone revoking
    // it — the whole point of putting a date on it.
    if (item.waiver && item.waiver.until >= today) {
      return {
        ...item,
        status: "waived" as const,
        expires: `Waived to ${item.waiver.until}`,
      };
    }

    return item;
  });
}

function toSubcontractor(r: SubRow): Subcontractor {
  const packet = packetStatus(r);
  // "Started" separates a crew who has not opened the form from one who is
  // part-way through — chasing those two is a different conversation.
  const started = [
    r.legalName, r.ein, r.addressLine1, r.signatoryName,
    r.paymentMethod, r.billingContactName,
  ].some((v) => typeof v === "string" && v.trim().length > 0);

  return {
    packet: { complete: packet.complete, started, blocking: packet.blocking },
    id: r.id,
    company: r.company,
    lead: r.lead,
    email: r.email,
    phone: r.phone,
    location: r.location,
    trades: r.trades,
    state: SUBSTATE_LABEL[r.state] ?? "Pending review",
    tone: r.tone as Tone,
    assignedProjects: (r.projects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
    })),
    // Read from the documents actually on file rather than a list written
    // when the crew was created. That list was never updated by an upload, so
    // a crew could send every certificate asked of them and still read as
    // missing all of it — which is exactly what happened to J&P.
    compliance: complianceFrom(
      (r.compliance as unknown as Subcontractor["compliance"]) ?? [],
      r.filedSections ?? [],
    ),
    complianceTone: r.complianceTone as Tone,
    scorecard: (r.scorecard as unknown as SubScorecard) ?? emptyScorecard,
    showPayToCrew: r.showPayToCrew,
    showOwnerDetailsToCrew: r.showOwnerDetailsToCrew,
    crewSize: r.crewSize,
    notes: r.notes,
    equipment: r.equipment,
    since: r.since,
  };
}

const emptyScorecard: SubScorecard = {
  rating: 0,
  projectsCompleted: 0,
  avgApprovalDays: 0,
  avgDailyFt: 0,
  docAccuracy: 0,
  safetyIncidents: 0,
  disputes: 0,
  avgProductionPct: 0,
};

type DailyRow = Awaited<ReturnType<typeof prisma.daily.findMany>>[number];

function toDaily(
  r: DailyRow,
  priced?: { billableAmount: number; subCost: number | null; grossMargin: number | null; unpricedCodes: number },
): DailyReport {
  return {
    id: r.id,
    sheetNumber: r.sheetNumber,
    project: r.projectName,
    projectId: r.projectId ?? "",
    customer: r.customer,
    subcontractor: r.subcontractor,
    crew: r.crew,
    workDate: r.workDate,
    billingWeekEnd: billingWeekFor(r)?.end ?? "",
    billingWeekOverridden: billingWeekFor(r)?.overridden ?? false,
    submittedAt: r.submittedAt,
    status: r.status as DailyReport["status"],
    tone: r.tone as Tone,
    totalFt: r.totalFt,
    billableAmount: priced?.billableAmount ?? r.billableAmount,
    subCost: priced?.subCost ?? null,
    grossMargin: priced?.grossMargin ?? null,
    unpricedCodes: priced?.unpricedCodes ?? 0,
    lineItems: (r.lineItems as unknown as DailyLineItem[]) ?? [],
    photos: r.photos,
    hasAsBuilt: r.hasAsBuilt,
    hasBoreLog: r.hasBoreLog,
    flags: (r.flags as unknown as DailyFlag[]) ?? [],
    reviewNote: r.reviewNote,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt,
  };
}

/* -- Organization (fixture) ------------------------------------------------- */

export async function getOrganization(): Promise<Organization> {
  return organization;
}

/* -- Dashboard aggregates (fixtures for now) -------------------------------- */

/**
 * The headline strip, computed from what is actually in the database.
 *
 * Where a number has no real source yet it reports zero rather than an
 * invented figure. A zero that is true tells you what to go and set up; a
 * plausible number that is fiction tells you nothing and hides the gap.
 */
export async function getKpis(): Promise<Kpi[]> {
  // One priced read for the whole request; the other panels share it.
  const [projects, dailies] = await Promise.all([
    prisma.project.findMany({ select: { tone: true, status: true } }),
    pricedDailies(),
  ]);

  /** Local calendar day for a daily — work date if usable, else submission. */
  const dayOf = (d: { workDate: string; submittedAt: string }) => {
    const t = Date.parse(d.workDate) || Date.parse(d.submittedAt);
    if (Number.isNaN(t) || !t) return null;
    const dt = new Date(t);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  };

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const DAY = 86_400_000;

  /** Footage per day for the last 12 days, oldest first — the sparkline. */
  const ftByDay = new Array(12).fill(0);
  let ftToday = 0;
  let ftYesterday = 0;

  for (const d of dailies) {
    const day = dayOf(d);
    if (day === null) continue;
    const back = Math.round((startOfToday - day) / DAY);
    if (back === 0) ftToday += d.totalFt;
    if (back === 1) ftYesterday += d.totalFt;
    if (back >= 0 && back < 12) ftByDay[11 - back] += d.totalFt;
  }

  // Production by billing week — Saturday through Friday, the same weeks the
  // invoices are cut on, not a rolling seven days. A crew asking "what did we
  // do this week" means the week they get paid for.
  const thisWeek = weekOf(new Date().toISOString().slice(0, 10));
  const lastWeekEnd = thisWeek ? addDays(thisWeek.end, -7) : null;
  const inWeek = (d: (typeof dailies)[number], end: string) =>
    billingWeekFor({ workDate: d.workDate, billingWeekEnd: d.billingWeekEnd })?.end === end;

  const ftThisWeek = thisWeek
    ? dailies.filter((d) => inWeek(d, thisWeek.end)).reduce((s, d) => s + d.totalFt, 0)
    : 0;
  const ftLastWeek = lastWeekEnd
    ? dailies.filter((d) => inWeek(d, lastWeekEnd)).reduce((s, d) => s + d.totalFt, 0)
    : 0;

  const awaiting = dailies.filter(
    (d) => d.status === "Submitted" || d.status === "In review",
  ).length;
  const approved = dailies.filter((d) => d.status === "Approved");
  const readyToBill = approved.reduce((s, d) => s + d.billableAmount, 0);
  const atRisk = projects.filter((p) => p.tone === "critical" || p.tone === "warning").length;

  /** Short date for a week label — "Aug 9–15". */
  const weekLabel = (end: string) => {
    const s = new Date(`${addDays(end, -6)}T00:00:00Z`);
    const e = new Date(`${end}T00:00:00Z`);
    const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    const day = (d: Date) => d.getUTCDate();
    return m(s) === m(e)
      ? `${m(s)} ${day(s)}–${day(e)}`
      : `${m(s)} ${day(s)} – ${m(e)} ${day(e)}`;
  };

  const pctChange = (now: number, before: number) =>
    before === 0 ? (now === 0 ? 0 : 100) : Number((((now - before) / before) * 100).toFixed(1));

  const flat = (v: number) => new Array(12).fill(v);

  return [
    {
      id: "active-projects",
      label: "Active projects",
      value: projects.length,
      format: "number",
      delta: null,
      deltaLabel: `${atRisk} needing attention`,
      trend: "flat",
      tone: "info",
      icon: "projects",
      href: "/projects",
      series: flat(projects.length),
    },
    {
      id: "production-today",
      label: "Production today",
      value: ftToday,
      format: "feet",
      delta: pctChange(ftToday, ftYesterday),
      deltaLabel: "vs. yesterday",
      trend: ftToday > ftYesterday ? "up" : ftToday < ftYesterday ? "down" : "flat",
      tone: "success",
      icon: "trending",
      href: "/dailies",
      series: ftByDay,
    },
    {
      id: "production-week",
      label: "Production this week",
      value: ftThisWeek,
      format: "feet",
      delta: pctChange(ftThisWeek, ftLastWeek),
      deltaLabel: thisWeek ? `${weekLabel(thisWeek.end)} · billing week` : "this billing week",
      trend: ftThisWeek > ftLastWeek ? "up" : ftThisWeek < ftLastWeek ? "down" : "flat",
      tone: "success",
      icon: "trending",
      href: "/dailies",
      series: flat(ftThisWeek),
    },
    {
      id: "production-last-week",
      label: "Production last week",
      value: ftLastWeek,
      format: "feet",
      delta: null,
      deltaLabel: lastWeekEnd ? `${weekLabel(lastWeekEnd)} · closed` : "previous billing week",
      trend: "flat",
      tone: "info",
      icon: "trending",
      href: "/dailies",
      series: flat(ftLastWeek),
    },
    {
      id: "revenue-ready",
      label: "Revenue ready to bill",
      value: readyToBill,
      format: "currency",
      delta: null,
      // Say which of the two zeros this is. "Needs customer rates loaded" was
      // printed whenever the figure was 0, including when the real reason was
      // that no daily had been approved yet — sending you to fix a rate card
      // that was never the problem.
      deltaLabel:
        readyToBill > 0
          ? `${approved.length} approved ${approved.length === 1 ? "daily" : "dailies"}`
          : approved.length === 0
            ? "no approved dailies yet"
            : `${approved.length} approved, none priced — check the codes`,
      trend: "flat",
      tone: readyToBill > 0 ? "success" : "neutral",
      icon: "dollar",
      href: "/invoicing",
      series: flat(readyToBill),
    },
    {
      id: "dailies-waiting",
      label: "Dailies awaiting review",
      value: awaiting,
      format: "number",
      delta: null,
      deltaLabel: awaiting === 0 ? "all caught up" : "submitted or in review",
      trend: "flat",
      tone: awaiting > 0 ? "warning" : "success",
      icon: "clipboard",
      href: "/dailies",
      series: flat(awaiting),
    },
    {
      id: "projects-at-risk",
      label: "Projects at risk",
      value: atRisk,
      format: "number",
      delta: null,
      deltaLabel: atRisk === 0 ? "none flagged" : "behind or at risk",
      trend: "flat",
      tone: atRisk > 0 ? "critical" : "success",
      icon: "alert",
      href: "/projects",
      series: flat(atRisk),
    },
  ];
}

/**
 * The operations centre reads live data from here down.
 *
 * These six used to return fixtures out of data/mock.ts, and the dashboard
 * showed them as fact: a crew reassignment on a job called Piedmont Water, a
 * $482,350 cash figure, a milestone in May. None of it existed. A number you
 * cannot act on is bad; a number you *can* act on that was invented is worse,
 * and it sat on the first screen of the morning.
 *
 * Everything below is computed from projects, dailies and invoices. Where
 * there is nothing to report they return empty or zero, which is a true answer
 * and reads as one.
 */

/**
 * Compliance rows not in good standing, judged against the documents actually
 * on file.
 *
 * It has to go through complianceFrom with the filed sections, not read the
 * stored JSON directly. That column is written when a crew is created and is
 * not updated by an upload, so reading it alone reports a crew who has sent
 * in every certificate as missing all of them - which is what it did to J&P.
 */
function lapsedDocs(
  stored: unknown,
  documents: { section: string }[],
): string[] {
  return complianceFrom(
    (stored as Subcontractor["compliance"]) ?? [],
    documents.map((d) => d.section),
  )
    .filter(
      (c) => c.status !== "valid" && c.status !== "expiring" && c.status !== "waived",
    )
    .map((c) => c.label);
}

export async function getHealthSummary(): Promise<HealthSummary> {
  const projects = await prisma.project.findMany({
    select: { tone: true, health: true, pctComplete: true, actualFtPerDay: true, requiredFtPerDay: true },
  });

  const total = projects.length;
  const score = total
    ? Math.round(projects.reduce((s, p) => s + p.health, 0) / total)
    : 0;

  const bucket = (label: string, tone: Tone, match: (p: (typeof projects)[number]) => boolean) => {
    const count = projects.filter(match).length;
    return { label, tone, count, share: total ? count / total : 0 };
  };

  // On time means keeping up with the footage the schedule needs. A project
  // with no required rate is not counted either way rather than counted good.
  const paced = projects.filter((p) => p.requiredFtPerDay > 0);
  const onPace = paced.filter((p) => p.actualFtPerDay >= p.requiredFtPerDay).length;

  return {
    score,
    delta: 0,
    totalProjects: total,
    buckets: [
      bucket("Healthy", "success", (p) => p.tone === "success" || p.tone === "info"),
      bucket("Watch", "warning", (p) => p.tone === "warning"),
      bucket("At risk", "critical", (p) => p.tone === "critical"),
    ],
    onTimeRate: paced.length ? onPace / paced.length : 0,
    // Not tracked yet. Zero rather than an invented percentage — the card
    // renders it as "not tracked" instead of implying we measured it.
    budgetVariance: 0,
    safetyDays: 0,
  };
}

/**
 * What actually needs someone's attention, found in the data.
 *
 * Not a forecast and not a model's opinion — each item is a query result with
 * the number that produced it, so every line can be checked. Ordered by how
 * much money or risk is sitting behind it.
 */
export async function getBrief(): Promise<BriefItem[]> {
  const [rows, projects, subs] = await Promise.all([
    prisma.daily.findMany({
      select: {
        status: true, workDate: true, submittedAt: true, crew: true, projectName: true,
        customer: true, subcontractor: true, projectId: true, lineItems: true,
        billingWeekEnd: true, totalFt: true,
      },
    }),
    prisma.project.findMany({ select: { name: true, tone: true, deadline: true, remainingFt: true, actualFtPerDay: true, requiredFtPerDay: true } }),
    prisma.subcontractor.findMany({
      select: {
        company: true,
        state: true,
        compliance: true,
        documents: { select: { section: true } },
      },
    }),
  ]);

  const priced = await priceDailies(rows);
  const dailies = rows.map((r, i) => ({ ...r, ...priced[i] }));
  const items: BriefItem[] = [];

  // Unpriced codes are the expensive one: the day is filed, it looks complete,
  // and it bills nothing. This is the $395-instead-of-$4,192 failure.
  const unpriced = dailies.filter((d) => d.unpricedCodes > 0);
  if (unpriced.length) {
    const codes = unpriced.reduce((s, d) => s + d.unpricedCodes, 0);
    items.push({
      id: "unpriced-codes",
      severity: "critical",
      title: `${codes} line${codes === 1 ? "" : "s"} on ${unpriced.length} dail${unpriced.length === 1 ? "y" : "ies"} bill nothing`,
      detail:
        "These carry a code the customer's rate card doesn't have, so they price at $0 and the sheet still reads as filed. Open the daily and re-pick the code from the dropdown.",
      confidence: 1,
      impact: `${unpriced.length} dail${unpriced.length === 1 ? "y" : "ies"}`,
      action: "Fix the codes",
      icon: "alert",
    });
  }

  const waiting = dailies.filter((d) => d.status === "Submitted" || d.status === "In review");
  if (waiting.length) {
    const ft = waiting.reduce((s, d) => s + d.totalFt, 0);
    items.push({
      id: "dailies-waiting",
      severity: waiting.length > 5 ? "critical" : "info",
      title: `${waiting.length} dail${waiting.length === 1 ? "y is" : "ies are"} waiting on review`,
      detail: `${ft.toLocaleString()} ft of production can't be invoiced until these are approved.`,
      confidence: 1,
      impact: `${ft.toLocaleString()} ft`,
      action: "Review dailies",
      icon: "clipboard",
    });
  }

  const ready = dailies.filter((d) => d.status === "Approved" && d.billableAmount > 0);
  if (ready.length) {
    const amount = ready.reduce((s, d) => s + d.billableAmount, 0);
    items.push({
      id: "ready-to-bill",
      severity: "opportunity",
      title: `$${Math.round(amount).toLocaleString()} approved and not yet invoiced`,
      detail: `${ready.length} approved dail${ready.length === 1 ? "y" : "ies"} priced against the customer card and ready to go on an invoice.`,
      confidence: 1,
      impact: `$${Math.round(amount).toLocaleString()}`,
      action: "Create invoice",
      icon: "dollar",
    });
  }

  const denied = dailies.filter((d) => d.status === "Denied");
  if (denied.length) {
    items.push({
      id: "denied-dailies",
      severity: "info",
      title: `${denied.length} dail${denied.length === 1 ? "y was" : "ies were"} denied`,
      detail:
        "Denied work is not billed and not paid. If the crew is meant to correct and refile these, someone has to tell them.",
      confidence: 1,
      impact: `${denied.length} denied`,
      action: "Open dailies",
      icon: "alert",
    });
  }

  const blocked = subs.filter(
    (s) => s.state === "ACTIVE" && lapsedDocs(s.compliance, s.documents).length > 0,
  );
  if (blocked.length) {
    items.push({
      id: "sub-documents",
      severity: "critical",
      title: `${blocked.length} active crew${blocked.length === 1 ? " is" : "s are"} short on paperwork`,
      // Name the crew and the document. "Missing documents" sends someone to
      // go and look; naming the gap means they can go and ask for it.
      detail: blocked
        .map((s) => `${s.company}: ${lapsedDocs(s.compliance, s.documents).join(", ")}`)
        .join(" · "),
      confidence: 1,
      impact: "Compliance",
      action: "Open subcontractors",
      icon: "shield",
    });
  }

  const behind = projects.filter(
    (p) => p.requiredFtPerDay > 0 && p.actualFtPerDay < p.requiredFtPerDay,
  );
  if (behind.length) {
    const worst = behind.sort(
      (a, b) => a.actualFtPerDay - a.requiredFtPerDay - (b.actualFtPerDay - b.requiredFtPerDay),
    )[0];
    items.push({
      id: "behind-pace",
      severity: "critical",
      title: `${behind.length} project${behind.length === 1 ? "" : "s"} running under the pace the schedule needs`,
      detail: `${worst.name} needs ${worst.requiredFtPerDay.toLocaleString()} ft/day and is running ${worst.actualFtPerDay.toLocaleString()} ft/day, with ${worst.remainingFt.toLocaleString()} ft left.`,
      confidence: 1,
      impact: `${behind.length} project${behind.length === 1 ? "" : "s"}`,
      action: "Open projects",
      icon: "trending",
    });
  }

  return items;
}

export async function getProductionSummary(): Promise<ProductionSummary> {
  const dailies = await prisma.daily.findMany({
    select: { workDate: true, submittedAt: true, totalFt: true, crew: true, subcontractor: true, billingWeekEnd: true },
  });
  const projects = await prisma.project.findMany({ select: { requiredFtPerDay: true } });

  const DAY = 86_400_000;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const dayOf = (d: { workDate: string; submittedAt: string }) => {
    const t = Date.parse(d.workDate) || Date.parse(d.submittedAt);
    if (!t || Number.isNaN(t)) return null;
    const dt = new Date(t);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  };

  // Seven days ending today, oldest first.
  const series = Array.from({ length: 7 }, (_, i) => {
    const ts = startOfToday - (6 - i) * DAY;
    const date = new Date(ts);
    const actual = dailies
      .filter((d) => dayOf(d) === ts)
      .reduce((s, d) => s + d.totalFt, 0);
    return {
      day: date.toLocaleDateString("en-US", { weekday: "short" }),
      date: date.toISOString().slice(0, 10),
      actual,
      // The target is what the open jobs collectively need per day, not a
      // number picked to make the chart look reachable.
      target: projects.reduce((s, p) => s + p.requiredFtPerDay, 0),
    };
  });

  const thisWeek = weekOf(new Date().toISOString().slice(0, 10));
  const lastWeekEnd = thisWeek ? addDays(thisWeek.end, -7) : null;
  const weekFt = (end: string | null) =>
    end
      ? dailies
          .filter(
            (d) =>
              billingWeekFor({ workDate: d.workDate, billingWeekEnd: d.billingWeekEnd })?.end === end,
          )
          .reduce((s, d) => s + d.totalFt, 0)
      : 0;

  const weekTotal = weekFt(thisWeek?.end ?? null);
  const lastTotal = weekFt(lastWeekEnd);

  // Footage by the crew that actually did it.
  const byCrewMap = new Map<string, number>();
  for (const d of dailies) {
    const who = (d.subcontractor || d.crew || "Unassigned").trim();
    byCrewMap.set(who, (byCrewMap.get(who) ?? 0) + d.totalFt);
  }
  const byCrew = [...byCrewMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([crew, ft]) => ({
      crew,
      ft,
      tone: (ft > 0 ? "success" : "neutral") as Tone,
    }));

  return {
    today: series[6]?.actual ?? 0,
    target: projects.reduce((s, p) => s + p.requiredFtPerDay, 0),
    weekTotal,
    weekDelta:
      lastTotal === 0
        ? weekTotal === 0
          ? 0
          : 100
        : Number((((weekTotal - lastTotal) / lastTotal) * 100).toFixed(1)),
    series,
    byCrew,
  };
}

export async function getRevenueSummary(): Promise<RevenueSummary> {
  const [rows, invoices] = await Promise.all([
    prisma.daily.findMany({
      select: {
        status: true, workDate: true, customer: true, subcontractor: true,
        projectId: true, lineItems: true,
      },
    }),
    prisma.invoice.findMany({
      select: {
        status: true,
        amountDue: true,
        dueAt: true,
        payments: { select: { amount: true } },
      },
    }),
  ]);

  const priced = await priceDailies(rows);
  const dailies = rows.map((r, i) => ({ ...r, ...priced[i] }));

  const readyRows = dailies.filter((d) => d.status === "Approved");
  const ready = readyRows.reduce((s, d) => s + d.billableAmount, 0);

  // Balance is amountDue less payments received, which is what balanceOf
  // exists to work out - the Invoice row has no paid or total column.
  const withBalance = invoices.map((i) => ({
    ...i,
    ...balanceOf(i.amountDue, i.payments),
  }));
  const open = withBalance.filter((i) => i.status !== "VOID" && !i.settled);
  const outstanding = open.reduce((s, i) => s + i.balance, 0);
  const overdueRows = open.filter((i) => isPastDue(i.dueAt, i.balance));
  const overdue = overdueRows.reduce((s, i) => s + i.balance, 0);
  const collected = withBalance.reduce((s, i) => s + i.paid, 0);

  const total = ready + outstanding;
  const share = (n: number) => (total > 0 ? n / total : 0);

  return {
    total,
    buckets: [
      {
        id: "ready",
        label: "Ready to bill",
        amount: ready,
        count: readyRows.length,
        caption: readyRows.length ? "approved dailies, not yet invoiced" : "no approved dailies yet",
        tone: ready > 0 ? "success" : "neutral",
        icon: "dollar",
        share: share(ready),
      },
      {
        id: "outstanding",
        label: "Invoiced, unpaid",
        amount: outstanding,
        count: open.length,
        caption: open.length ? "issued and awaiting payment" : "nothing outstanding",
        tone: outstanding > 0 ? "info" : "neutral",
        icon: "billing",
        share: share(outstanding),
      },
      {
        id: "overdue",
        label: "Past due",
        amount: overdue,
        count: overdueRows.length,
        caption: overdueRows.length ? "past the due date" : "nothing past due",
        tone: overdue > 0 ? "critical" : "success",
        icon: "alert",
        share: share(overdue),
      },
    ],
    // Not measured until invoices have been paid; 0 rather than a plausible 38.
    avgDaysToPay: 0,
    collectedThisMonth: collected,
  };
}

export async function getDeadlines(): Promise<Deadline[]> {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, deadline: true, crew: true, tone: true, remainingFt: true },
  });

  const today = Date.now();
  return projects
    .filter((p) => p.deadline?.trim())
    .map((p) => {
      const t = Date.parse(p.deadline);
      const daysOut = Number.isNaN(t) ? 0 : Math.round((t - today) / 86_400_000);
      return {
        id: p.id,
        project: p.name,
        milestone: p.remainingFt > 0 ? `${p.remainingFt.toLocaleString()} ft remaining` : "Completion",
        date: p.deadline,
        daysOut,
        tone: (daysOut < 0 ? "critical" : daysOut <= 7 ? "warning" : "info") as Tone,
        owner: p.crew || "Unassigned",
      };
    })
    .sort((a, b) => a.daysOut - b.daysOut);
}

export async function getMissingDocuments(): Promise<MissingDocument[]> {
  const subs = await prisma.subcontractor.findMany({
    select: {
      id: true,
      company: true,
      state: true,
      compliance: true,
      documents: { select: { section: true } },
    },
  });

  return subs
    .map((s) => {
      const missing = lapsedDocs(s.compliance, s.documents);
      return {
        id: s.id,
        project: s.company,
        documents: missing,
        // An active crew missing paperwork is on a job right now, which is the
        // difference between a to-do and a problem.
        blocking: s.state === "ACTIVE" && missing.length > 0,
        daysOverdue: 0,
      };
    })
    .filter((m) => m.documents.length > 0)
    .sort((a, b) => Number(b.blocking) - Number(a.blocking));
}

/**
 * What this viewer should be told about.
 *
 * Scoped by who is asking, not by a filter the caller passes: staff get the
 * office's feed, a crew gets only rows written for their own record, and
 * anybody signed out gets nothing. There is no argument that widens it.
 */
export async function getNotifications(): Promise<AppNotification[]> {
  const user = await viewer();
  if (!user) return [];

  const rows = await prisma.notification.findMany({
    where: isStaff(user.role)
      ? { audience: "STAFF" }
      : user.subcontractorId
        ? { audience: "SUBCONTRACTOR", subcontractorId: user.subcontractorId }
        : // A subcontractor login with no crew attached has no work to hear
          // about. Returning the office's feed here would be the whole leak.
          { id: "" },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  const iconFor: Record<string, AppNotification["icon"]> = {
    daily: "clipboard",
    billing: "billing",
    compliance: "document",
    crew: "users",
    system: "bell",
  };

  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    detail: n.detail,
    time: relativeTime(n.createdAt),
    tone: n.tone as AppNotification["tone"],
    unread: n.readAt === null,
    icon: iconFor[n.category] ?? "bell",
    category: n.category as AppNotification["category"],
    href: n.href,
  }));
}

/** "3 min ago" — the only form anybody reads a notification list in. */
function relativeTime(at: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return at.toISOString().slice(0, 10);
}

/* -- Entities (Postgres) ---------------------------------------------------- */

/**
 * Customers are staff-only — this is the GC side of the business, and the
 * record carries what Fortitude bills, which is not a subcontractor's to see.
 */
export async function getCustomers(): Promise<Customer[]> {
  await requireStaff();
  const rows = await prisma.customer.findMany({
    include: { _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => toCustomer(r, r._count.projects));
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  await requireStaff();
  const r = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { projects: true } } },
  });
  return r ? toCustomer(r, r._count.projects) : undefined;
}

/**
 * Every project the viewer is allowed to see, worst-health first — for staff
 * the directory doubles as a triage queue.
 *
 * A subcontractor gets only the jobs assigned to their company. This is the
 * choke point for that rule: the maps, redlines and material lists all hang off
 * a project, so a crew that can't see the project can't see the map either.
 */
export async function getProjects(): Promise<Project[]> {
  const user = await viewer();
  if (!user) return [];
  const allowed = await visibleProjectIds(user);
  if (allowed !== null && allowed.length === 0) return [];

  const rows = await prisma.project.findMany({
    where: allowed === null ? undefined : { id: { in: allowed } },
    orderBy: { health: "asc" },
    select: PROJECT_LIST_SELECT,
  });
  // Three lookups that do not depend on each other, so they go together.
  // Awaited one after another they were three round trips to Neon before a
  // single project could render, and the page sat blank for all of them.
  const ids = rows.map((r) => r.id);
  const [maps, built, routes] = await Promise.all([
    mapSummaries(ids),
    placedFootage(ids),
    plannedRoute(ids),
  ]);

  return rows.map((r) => {
    const p = toProject({ ...r, ...maps.get(r.id) });
    const b = built.get(r.id);
    if (!b || b.total === 0) return p;

    // Everything below comes off filed dailies. The stored columns it replaces
    // are written once when a project is created and never again, which is why
    // every job read 0 ft at 0/0 pace on health 80 while Charles Hart had
    // 7,326 ft in the ground.
    const perDay = b.days > 0 ? Math.round(b.total / b.days) : 0;
    const assigned = (r.crews ?? []).map((c) => c.company.trim()).filter(Boolean);

    // `remainingFt` holds the whole route, entered once on the project form.
    // What is left is that less what the dailies have put in the ground, so
    // nobody has to remember to count it down.
    // The route length comes off the material list, which already carries the
    // plan for the job. The form field is only the fallback for a job whose
    // list has not been loaded yet.
    const planned = routes.get(r.id) || r.remainingFt;
    // A job somebody has called finished stops being measured against its
    // plan. The footage ratio is a progress estimate, and a finished job that
    // reads 94% because the material list overestimated is telling the office
    // there is work left when there is not.
    const done = Boolean(r.completedAt);
    const left = done ? 0 : planned > 0 ? Math.max(0, planned - b.total) : 0;
    const pct = done ? 100 : planned > 0 ? Math.min(100, Math.round((b.total / planned) * 100)) : p.pctComplete;

    // Required pace only means something with footage left and a date to hit.
    const daysLeft = daysUntil(r.deadline);
    const required =
      left > 0 && daysLeft !== null && daysLeft > 0 ? Math.ceil(left / daysLeft) : 0;

    return {
      ...p,
      remainingFt: done ? 0 : planned > 0 ? left : p.remainingFt,
      pctComplete: pct,
      actualFtPerDay: perDay,
      requiredFtPerDay: required,
      health: healthFrom({ perDay, required, daysLeft, remainingFt: left }) ?? p.health,
      crew: assigned.length
        ? assigned.length === 1
          ? assigned[0]
          : `${assigned[0]} +${assigned.length - 1} more`
        : "No crew assigned",
      // Forecast has to agree with pace. It read "On track" beside "Behind
      // schedule" on the same row, because it is a stored string nothing
      // recomputes. A job with nobody on it is not on track either.
      ...forecastFrom({ perDay, required, left, assigned: assigned.length }),
    };
  });
}

/**
 * Plow and bore footage placed on each project, from filed dailies.
 *
 * Linear-footage codes only. A handhole, a pedestal and a splice are all real
 * work and all billed, but none of them advance the route — a day of nothing
 * but handholes moves a job zero feet down the road, and progress has to mean
 * distance or it stops meaning anything.
 */
async function placedFootage(
  projectIds: string[],
): Promise<Map<string, { total: number; days: number }>> {
  const out = new Map<string, { total: number; days: number }>();
  if (projectIds.length === 0) return out;

  const dailies = await prisma.daily.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, workDate: true, lineItems: true },
  });

  const days = new Map<string, Set<string>>();
  for (const d of dailies) {
    if (!d.projectId) continue;
    const items = (Array.isArray(d.lineItems) ? d.lineItems : []) as {
      code?: unknown;
      quantity?: unknown;
    }[];
    const ft = items
      .filter((l) => typeof l?.code === "string" && isLinearFootageCode(l.code as string))
      .reduce((s, l) => s + (typeof l.quantity === "number" ? l.quantity : 0), 0);

    const cur = out.get(d.projectId) ?? { total: 0, days: 0 };
    cur.total += ft;
    out.set(d.projectId, cur);

    if (!days.has(d.projectId)) days.set(d.projectId, new Set());
    days.get(d.projectId)!.add(String(d.workDate).slice(0, 10));
  }

  for (const [id, set] of days) {
    const cur = out.get(id);
    if (cur) cur.days = set.size;
  }
  return out;
}

/**
 * The route codes on a material list — the ones that measure distance.
 *
 * Cable placement and bore. A handhole or a splice is on the same list and is
 * real billable work, but neither advances the route, so neither belongs in a
 * total that answers "how long is this job".
 *
 * Matched on the exact families, not on a BFO prefix: BFO12RI and BFO24RI are
 * ribbon-in-duct and arrive on these lists flagged out of scope, and a prefix
 * match would have quietly added twelve thousand feet of work Fortitude is not
 * doing to two of the five jobs.
 */
function isRouteMaterial(code: string): boolean {
  // productionMethod already knows plow from bore, and it knows the real
  // shapes — the codes on a list are "BFOV(12.7)(2W)12IN DEPTH", not
  // "BFOV12.7". A regex written against the short form matched none of them,
  // which is how every route total came out missing its entire plowed length.
  const m = productionMethod(code);
  return m === "plow" || m === "bore";
}

/**
 * Total route footage per project, off the material list.
 *
 * The list is the plan for the job, so the length of the route is already in
 * it and nobody should be typing it a second time. Out-of-scope lines are
 * skipped — they are on the list for reference, not to be built.
 */
async function plannedRoute(projectIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (projectIds.length === 0) return out;

  const rows = await prisma.projectMaterial.findMany({
    where: { projectId: { in: projectIds }, inScope: true },
    select: { projectId: true, code: true, planned: true },
  });

  for (const m of rows) {
    if (!isRouteMaterial(m.code)) continue;
    out.set(m.projectId, (out.get(m.projectId) ?? 0) + m.planned);
  }
  return out;
}

/**
 * What the forecast column should say, given what is actually happening.
 *
 * It used to be a stored string, so a project could read "On track" in green
 * beside "Behind schedule" in red on the same row — Charles Hart did exactly
 * that. Worse, a job with nobody assigned to it also read "On track", which is
 * the one case where the honest answer is that nothing is going to happen at
 * all.
 */
function forecastFrom(x: {
  perDay: number;
  required: number;
  left: number;
  assigned: number;
}): { forecast: string; forecastTone: Tone } {
  if (x.left <= 0) return { forecast: "Route complete", forecastTone: "success" };
  if (x.assigned === 0) return { forecast: "Needs a crew", forecastTone: "critical" };
  if (x.required <= 0) return { forecast: "No deadline set", forecastTone: "neutral" };

  if (x.perDay <= 0) return { forecast: "Assigned, not started", forecastTone: "warning" };

  // Days at the pace they are actually working, against the pace required.
  const days = Math.ceil(x.left / x.perDay);
  if (x.perDay >= x.required) {
    return { forecast: `On track · ~${days} days`, forecastTone: "success" };
  }
  return { forecast: `Short by ${(x.required - x.perDay).toLocaleString()} ft/day`, forecastTone: "critical" };
}

/** Whole days from today to a YYYY-MM-DD deadline; null when there isn't one. */
function daysUntil(deadline: string): number | null {
  const t = Date.parse((deadline ?? "").trim());
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

/**
 * A health score that means something: is the crew keeping up with the pace
 * the remaining footage and the deadline demand?
 *
 * Returns null when there is nothing to judge — no deadline, or no footage
 * left to place. The caller keeps the stored value in that case rather than
 * this inventing an 80, which is what every project was showing.
 */
function healthFrom(x: {
  perDay: number;
  required: number;
  daysLeft: number | null;
  remainingFt: number;
}): number | null {
  if (x.remainingFt <= 0 || x.required <= 0) return null;
  if (x.daysLeft !== null && x.daysLeft < 0) return 25; // deadline already gone

  const ratio = x.perDay / x.required;
  // 100 at double the required pace, 50 at exactly on pace, worse below.
  const score = Math.round(Math.max(5, Math.min(100, 50 * ratio + 25)));
  return score;
}

/** Sorted worst-first — the dashboard table is an attention queue. */
export async function getProjectsRequiringAttention(): Promise<Project[]> {
  return getProjects();
}

/** Undefined rather than a throw — the page turns that into a 404. */
export async function getProject(id: string): Promise<Project | undefined> {
  const user = await viewer();
  if (!user) return undefined;
  const allowed = await visibleProjectIds(user);
  if (allowed !== null && !allowed.includes(id)) return undefined;

  const r = await prisma.project.findUnique({
    where: { id },
    include: { crews: { select: { company: true } } },
  });
  return r ? toProject(r) : undefined;
}

/**
 * The whole crew roster — staff only.
 *
 * This carries every sub's contact details, compliance state and scorecard.
 * One sub has no business reading another's file, so there is no scoped
 * variant: a subcontractor login gets nothing here at all.
 */
export async function getSubcontractors(): Promise<Subcontractor[]> {
  await requireStaff();
  const rows = await prisma.subcontractor.findMany({
    include: {
      projects: { select: { id: true, name: true, number: true } },
      // Section only — the files themselves are megabytes and nothing here
      // draws them; the question is only which slots have been filled.
      documents: { select: { section: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) =>
    toSubcontractor({ ...r, filedSections: r.documents.map((d) => d.section) }),
  );
}

/**
 * Price every daily on both cards.
 *
 * Each daily is its own invoice — gross at Fortitude's card (Exhibit A, what
 * Globe pays us), cost at the filing sub's own signed card, and the margin
 * between them. Rates are read once and matched in memory rather than queried
 * per daily.
 *
 * Rates are picked as of the work date, so a daily is always valued at the
 * rate that applied when the work was done.
 */
/** Exported so the operations assistant prices dailies the same way the rest
 *  of the app does, rather than growing a second opinion about money. */
/**
 * Every daily, priced once per request.
 *
 * Four panels on the Operations Center each need the same thing — what a
 * day billed, what it cost and the spread — and each used to fetch the
 * dailies and price them itself. Four fetches, and priceDailies fires
 * several queries of its own for the rate cards, so a dashboard load was
 * pricing the same twenty-six days four times over. That is most of why the
 * page went slow when the tiles became real.
 *
 * React's cache() dedupes within a single request: the first caller does the
 * work, the rest get the same promise. Across requests nothing is retained,
 * so a figure is never stale — it is one read per page, not one per panel.
 */
export const pricedDailies = cache(async () => {
  const rows = await prisma.daily.findMany({
    select: {
      id: true,
      status: true,
      workDate: true,
      submittedAt: true,
      crew: true,
      projectName: true,
      customer: true,
      subcontractor: true,
      projectId: true,
      lineItems: true,
      billingWeekEnd: true,
      totalFt: true,
    },
    orderBy: { workDate: "desc" },
  });

  const priced = await priceDailies(rows);
  return rows.map((r, i) => ({ ...r, ...priced[i] }));
});

export async function priceDailies(
  rows: {
    customer: string;
    subcontractor: string;
    workDate: string;
    lineItems: unknown;
    projectId: string | null;
  }[],
) {
  const customerNames = [...new Set(rows.map((r) => r.customer?.trim()).filter(Boolean))];
  const subNames = [...new Set(rows.map((r) => r.subcontractor?.trim()).filter(Boolean))];
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))] as string[];

  const rateSelect = {
    code: true, description: true, unit: true,
    rate: true, effectiveDate: true, expirationDate: true,
    // Which market's price this is. Two of Fortitude's markets run through
    // the same prime at different rates, so the customer alone no longer
    // identifies a price.
    market: true,
  } as const;

  // The job's customer is a foreign key; the name written on the daily is free
  // text. Matching on the text priced every daily at zero the moment a job was
  // labelled "Windstream" while the card lived on "GLOBE COMMUNICATIONS" — the
  // invoice was right and the daily said $0 with everything unpriced. The link
  // decides; the name is only a fallback for a daily attached to no job.
  const [projects, customers, subs] = await Promise.all([
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, customerId: true, market: true },
        })
      : Promise.resolve([]),
    customerNames.length
      ? prisma.customer.findMany({
          where: { name: { in: customerNames } },
          select: { id: true, name: true, rates: { select: rateSelect } },
        })
      : Promise.resolve([]),
    subNames.length
      ? prisma.subcontractor.findMany({
          where: { company: { in: subNames } },
          select: { company: true, rates: { select: rateSelect } },
        })
      : Promise.resolve([]),
  ]);

  const customerIdByProject = new Map(projects.map((p) => [p.id, p.customerId]));
  const marketByProject = new Map(projects.map((p) => [p.id, p.market]));
  const linkedIds = [...new Set([...customerIdByProject.values()].filter(Boolean))] as string[];
  const linked = linkedIds.length
    ? await prisma.customer.findMany({
        where: { id: { in: linkedIds } },
        select: { id: true, rates: { select: rateSelect } },
      })
    : [];

  const ratesByCustomerId = new Map(linked.map((c) => [c.id, c.rates]));
  const customerRates = new Map(customers.map((c) => [c.name, c.rates]));
  const subRates = new Map(subs.map((s) => [s.company, s.rates]));

  return rows.map((r) => {
    const items = Array.isArray(r.lineItems) ? (r.lineItems as unknown[]) : [];
    const quantities: QuantityRow[] = items
      .map((raw) => raw as { code?: unknown; quantity?: unknown })
      .filter((li) => typeof li?.code === "string")
      .map((li) => ({
        code: (li.code as string).trim().toUpperCase(),
        quantity: typeof li.quantity === "number" ? li.quantity : 0,
      }));

    const linkedId = r.projectId ? customerIdByProject.get(r.projectId) : null;
    // The job's market decides which of a customer's cards applies. A daily
    // with no job behind it has no market, which resolves to the cards that
    // name none — the same rates it was priced at before markets existed.
    const market = r.projectId ? marketByProject.get(r.projectId) ?? "" : "";

    const ours = ratesForMarket(
      (linkedId ? ratesByCustomerId.get(linkedId) : undefined) ??
        customerRates.get(r.customer?.trim() ?? "") ??
        [],
      market,
    );
    const theirs = ratesForMarket(subRates.get(r.subcontractor?.trim() ?? "") ?? [], market);

    const revenue = priceQuantities(quantities, ours, r.workDate);
    const cost = theirs.length > 0 ? priceQuantities(quantities, theirs, r.workDate) : null;

    return {
      billableAmount: revenue.total,
      subCost: cost ? cost.total : null,
      grossMargin: cost ? revenue.total - cost.total : null,
      unpricedCodes: revenue.unpriced.length,
    };
  });
}

/** Dailies for the projects the viewer can see; a sub sees only their own. */
export async function getDailies(): Promise<DailyReport[]> {
  const user = await viewer();
  if (!user) return [];
  const allowed = await visibleProjectIds(user);

  const rows = await prisma.daily.findMany({
    where:
      allowed === null
        ? undefined
        : {
            // Assignment governs, but a daily filed by another company on a
            // shared project still isn't this crew's to read.
            AND: [
              { projectId: { in: allowed } },
              user.subcontractorName ? { subcontractor: user.subcontractorName } : { id: "" },
            ],
          },
    orderBy: { createdAt: "desc" },
  });

  // Every daily is its own invoice: gross at our card, cost at the filing
  // sub's own card, margin between them.
  const priced = await priceDailies(rows);

  // A crew sees what they earned, never what we billed for it. Handing a sub
  // the customer figure hands them our margin on their own work, which is the
  // one number they must not have — and it would arrive on the very page they
  // use every day. So the customer-rate total is replaced by their own, and the
  // spread is dropped rather than nulled at the component.
  if (allowed !== null) {
    // And most crews see no figure at all. One login serves a whole company,
    // and it is the foreman filing dailies who uses it — owners asked for
    // their pay off a screen their field staff carry. Where the office has
    // opened pay for a crew, they see what they earned; otherwise the money
    // is not sent, and the row that renders it does not appear.
    const showPay = user.subcontractorId
      ? Boolean(
          (
            await prisma.subcontractor.findUnique({
              where: { id: user.subcontractorId },
              select: { showPayToCrew: true },
            })
          )?.showPayToCrew,
        )
      : false;

    return rows.map((r, i) =>
      toDaily(r, {
        billableAmount: showPay ? (priced[i].subCost ?? 0) : 0,
        subCost: showPay ? priced[i].subCost : null,
        grossMargin: null,
        unpricedCodes: 0,
      }),
    );
  }

  return rows.map((r, i) => toDaily(r, priced[i]));
}

/* -- Materials / billing / pay / reports (fixtures for now) ----------------- */

export async function getMaterials(): Promise<Material[]> {
  return materials;
}

export async function getInvoices(): Promise<Invoice[]> {
  return invoices;
}

/**
 * What Fortitude owes its crews, from the real pay statements.
 *
 * This returned five fixtures — ABC Utilities, Carolina Bore, Summit
 * Underground, jobs called Duke Energy Upgrade and Piedmont Water Main —
 * none of which exist. It read as a working register showing $84.2K pending
 * against companies nobody has ever worked with, which is worse than an
 * empty page: an empty page tells you to go and make a pay statement.
 */
export async function getPayApplications(): Promise<PayApplication[]> {
  await requireStaff();

  const rows = await prisma.subInvoice.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      projectName: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      fastPay: true,
      createdAt: true,
      subcontractor: { select: { company: true } },
      lines: { select: { amount: true } },
      project: { select: { customer: { select: { retainagePct: true } } } },
    },
  });

  return rows.map((r) => {
    const amount = Number(r.lines.reduce((sum, l) => sum + l.amount, 0).toFixed(2));
    // Retainage follows the customer's card on that job. Crews are held back
    // at the rate Fortitude is held back, not at a number typed per row.
    const pct = r.project?.customer?.retainagePct ?? 0;
    const retainage = Number((amount * pct).toFixed(2));

    const { label, tone } = payAppStatus(r.status);
    return {
      id: r.id,
      number: r.number,
      subcontractor: r.subcontractor.company.trim(),
      project: r.projectName || "—",
      period:
        r.periodStart && r.periodEnd
          ? `${shortDay(r.periodStart)}–${shortDay(r.periodEnd)}`
          : "—",
      amount,
      retainage,
      status: label,
      tone,
      submitted: r.createdAt.toISOString(),
      fastPayEligible: r.fastPay,
    };
  });
}

/**
 * A pay statement's state, in the register's vocabulary.
 *
 * The two do not line up one to one, so the mapping is written down rather
 * than guessed at each call site: a statement the crew has disputed is money
 * we are holding, and one they have accepted is approved to pay.
 */
function payAppStatus(status: string): { label: PayApplication["status"]; tone: Tone } {
  switch (status) {
    case "DRAFT":
    case "ISSUED":
      return { label: "Pending review", tone: "warning" };
    case "ACCEPTED":
      return { label: "Approved", tone: "success" };
    case "DISPUTED":
      return { label: "Held", tone: "critical" };
    case "PAID":
      return { label: "Paid", tone: "neutral" };
    default:
      return { label: "Held", tone: "neutral" };
  }
}

/** "2026-08-14" -> "Aug 14". Empty stays empty. */
function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export async function getReportDefinitions(): Promise<ReportDefinition[]> {
  return reportDefinitions;
}

/* ------------------------------------------------------------------ *
 * Project material lists — the rows Claude pulled off an uploaded or
 * scanned material list, scoped to one project and kept in review
 * state until a human approves them.
 * ------------------------------------------------------------------ */

export interface ProjectMaterialRow {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number | null;
  reelNumber: string;
  manufacturer: string;
  size: string;
  furnished: string;
  confidence: number;
  warning: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface ProjectMaterialImport {
  id: string;
  fileName: string;
  summary: string;
  status: string;
  error: string;
  createdAt: string;
  rows: ProjectMaterialRow[];
}

export async function getProjectMaterialImports(
  projectId: string,
  projectName: string,
): Promise<ProjectMaterialImport[]> {
  if (!projectId && !projectName) return [];
  // The uploaded material list is the customer's plan for the job — it goes
  // with the project, so it inherits the project's access rule.
  await assertProjectAccess(projectId);
  const imports = await prisma.rateImport.findMany({
    // `projectId` is the real link; the name match keeps imports created before
    // the foreign key existed (or started from the rate-import screen) visible.
    where: {
      docType: "MATERIAL_LIST",
      OR: [{ projectId }, { projectId: null, project: projectName }],
    },
    orderBy: { createdAt: "desc" },
    include: { rows: { orderBy: { createdAt: "asc" } } },
  });

  return imports.map((imp) => ({
    id: imp.id,
    fileName: imp.fileName,
    summary: imp.summary,
    status: imp.status,
    error: imp.error,
    createdAt: imp.createdAt.toISOString(),
    rows: imp.rows.map((r) => {
      // The full per-doc-type field set lives in `data`; quantity, reel number,
      // manufacturer and furnished-by only exist there for material lists.
      const d = (r.data ?? {}) as Record<string, unknown>;
      const qty = d.plannedQty;
      return {
        id: r.id,
        code: r.code,
        description: r.description,
        unit: r.unit,
        quantity: typeof qty === "number" ? qty : null,
        reelNumber: typeof d.reelNumber === "string" ? d.reelNumber : "",
        manufacturer: typeof d.manufacturer === "string" ? d.manufacturer : "",
        size: typeof d.size === "string" ? d.size : "",
        furnished: typeof d.furnished === "string" ? d.furnished : "",
        confidence: r.confidence,
        warning: r.warning,
        status: r.status as ProjectMaterialRow["status"],
      };
    }),
  }));
}

/**
 * Material tracked on a project. The material list is the *plan* — what the
 * job was issued before work started. The dailies are the *draw-down*: every
 * unit code a crew bills (BHF, BMFAF, BM2F, BD4MPF, plow, missile, peds,
 * flower pots) subtracts from its planned quantity. Remaining is arithmetic,
 * not data entry.
 */
export interface TrackedMaterial {
  id: string;
  code: string;
  item: string;
  category: string;
  unit: string;
  /** From the material list. */
  planned: number;
  /** Summed from daily billing line items with this code. */
  completed: number;
  /** planned − completed, floored at 0. */
  remaining: number;
  /** How many dailies have billed against this code. */
  dailyCount: number;
  manufacturer: string;
  size: string;
  reelNumber: string;
  furnished: string;
  /** Work we are actually performing. Excluded lines stay on the list but
      contribute nothing to the project value. */
  inScope: boolean;
  scopeNote: string;
  tone: Tone;
  /** "Microduct" / "Microfiber" — units a crew treats as one, for roll-up. */
  group: string | null;
  /** Billed past this code's own planned quantity. */
  overPlan: boolean;
  /**
   * Over its own line, but the group it belongs to still has plan left — a
   * substitution, not an overrun. Happens whenever one size runs out and the
   * crew bills the interchangeable one instead.
   */
  coveredByGroup: boolean;
}

export type { MaterialGroupTotal } from "@/lib/unit-codes";

function materialTone(planned: number, completed: number): Tone {
  if (planned <= 0) return "neutral";
  const pct = completed / planned;
  if (pct > 1) return "critical"; // billed past plan — worth a look
  if (pct >= 0.9) return "warning";
  if (pct > 0) return "success";
  return "neutral";
}

/** Normalises codes so "bd4mpf", "BD4MPF " and "BD4MPF" all match. */
const normCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

export async function getProjectMaterials(projectId: string): Promise<TrackedMaterial[]> {
  await assertProjectAccess(projectId);
  const [rows, dailies] = await Promise.all([
    prisma.projectMaterial.findMany({
      where: { projectId },
      orderBy: [{ category: "asc" }, { code: "asc" }],
    }),
    prisma.daily.findMany({ where: { projectId }, select: { lineItems: true } }),
  ]);

  // Roll every daily's line items up by unit code.
  const billed = new Map<string, { qty: number; dailies: number }>();
  for (const d of dailies) {
    const items = Array.isArray(d.lineItems) ? (d.lineItems as unknown[]) : [];
    const seen = new Set<string>();
    for (const raw of items) {
      const li = raw as { code?: unknown; quantity?: unknown };
      if (typeof li?.code !== "string") continue;
      const code = normCode(li.code);
      if (!code) continue;
      const qty = typeof li.quantity === "number" ? li.quantity : 0;
      const prev = billed.get(code) ?? { qty: 0, dailies: 0 };
      prev.qty += qty;
      if (!seen.has(code)) {
        prev.dailies += 1;
        seen.add(code);
      }
      billed.set(code, prev);
    }
  }

  const mapped = rows
    // High-traffic underground codes lead; the rest follow as listed.
    .sort((a, b) => compareByPriority(a.code, b.code))
    .map((r) => {
    const hit = billed.get(normCode(r.code));
    const completed = hit?.qty ?? 0;
    return {
      id: r.id,
      code: r.code,
      item: r.item,
      category: r.category,
      unit: r.unit,
      planned: r.planned,
      completed,
      remaining: Math.max(0, r.planned - completed),
      dailyCount: hit?.dailies ?? 0,
      manufacturer: r.manufacturer,
      size: r.size,
      reelNumber: r.reelNumber,
      furnished: r.furnished,
      inScope: r.inScope,
      scopeNote: r.scopeNote,
      tone: materialTone(r.planned, completed),
      group: codeGroupLabel(r.code),
      overPlan: r.planned > 0 && completed > r.planned,
      coveredByGroup: false,
    };
  });

  /*
   * Group-aware overrun. When one size runs out mid-job — 8.5 microduct did —
   * the crew keeps working and bills the interchangeable code instead. The
   * substitute then reads "over plan" on its own line while the size it
   * replaced sits untouched. That is a substitution, not an overrun, so judge
   * it against the group's total before calling it a problem.
   */
  const groupPlan = new Map<string, { planned: number; completed: number }>();
  for (const m of mapped) {
    if (!m.group) continue;
    const g = groupPlan.get(m.group) ?? { planned: 0, completed: 0 };
    g.planned += m.planned;
    g.completed += m.completed;
    groupPlan.set(m.group, g);
  }

  for (const m of mapped) {
    if (!m.overPlan || !m.group) continue;
    const g = groupPlan.get(m.group);
    if (g && g.completed <= g.planned) {
      m.coveredByGroup = true;
      m.tone = "info"; // drawing from the group, not an overrun
    }
  }

  return mapped;
}

/** A code a crew can bill on this project, with what the plan has left. */
export interface MaterialCodeOption {
  code: string;
  description: string;
  unit: string;
  planned: number;
  billed: number;
  remaining: number;
  /** One of the high-traffic underground families — surfaced first in pickers. */
  priority: boolean;
  /** Aerial (CO*) — real, billable, but hidden by default on underground jobs. */
  aerial: boolean;
}

/**
 * The project's approved material codes, for pickers on daily entry. Typing a
 * code from memory is how quantities drift from the plan; picking one that
 * already knows its unit and remaining quantity is how they stay honest.
 */
export async function getProjectMaterialCodes(projectId: string): Promise<MaterialCodeOption[]> {
  const materials = await getProjectMaterials(projectId);
  return materials
    .filter((m) => m.code)
    .map((m) => ({
      code: m.code,
      description: m.item,
      unit: m.unit,
      planned: m.planned,
      billed: m.completed,
      remaining: m.remaining,
      priority: isPriorityCode(m.code),
      aerial: isAerialCode(m.code),
    }))
    // The underground codes crews reach for most come first.
    .sort((a, b) => compareByPriority(a.code, b.code));
}

/* ------------------------------------------------------------------ *
 * Daily billing sheets — the Globe form as saved, so a reviewer sees
 * what the crew actually filled in rather than a summary of it.
 * ------------------------------------------------------------------ */

export interface SavedDailySheet {
  id: string;
  projectId: string | null;
  projectName: string;
  workDate: string;
  crewNumber: string;
  status: string;
  dailyId: string | null;
  /** The crew the office typed this up for, if it was not filed by them. */
  filedForId: string | null;
  header: unknown;
  laborCodes: unknown;
  laborRows: unknown;
  matCodes: unknown;
  matRows: unknown;
  redlines: unknown;
  redlineFiles: unknown;
  updatedAt: string;
}

function toSavedSheet(r: {
  id: string;
  projectId: string | null;
  projectName: string;
  workDate: string;
  crewNumber: string;
  status: string;
  dailyId: string | null;
  filedForId: string | null;
  header: unknown;
  laborCodes: unknown;
  laborRows: unknown;
  matCodes: unknown;
  matRows: unknown;
  redlines: unknown;
  redlineFiles: unknown;
  updatedAt: Date;
}): SavedDailySheet {
  return { ...r, updatedAt: r.updatedAt.toISOString() };
}

export async function getDailySheet(id: string): Promise<SavedDailySheet | null> {
  const r = await prisma.dailySheet.findUnique({ where: { id } });
  return r ? toSavedSheet(r) : null;
}

/** The sheet a submitted daily came from, if it came from one. */
export async function getSheetForDaily(dailyId: string): Promise<SavedDailySheet | null> {
  const r = await prisma.dailySheet.findFirst({ where: { dailyId } });
  return r ? toSavedSheet(r) : null;
}

/** Drafts and submitted sheets for a project, newest first. */
export async function getProjectSheets(projectId: string): Promise<SavedDailySheet[]> {
  await assertProjectAccess(projectId);
  const rows = await prisma.dailySheet.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toSavedSheet);
}

/** dailyId -> the sheet it came from, for linking a review to the real form. */
export async function getSheetIndexByDaily(): Promise<
  Record<string, { sheetId: string; projectId: string }>
> {
  const rows = await prisma.dailySheet.findMany({
    where: { dailyId: { not: null }, projectId: { not: null } },
    select: { id: true, dailyId: true, projectId: true },
  });
  const out: Record<string, { sheetId: string; projectId: string }> = {};
  for (const r of rows) {
    if (r.dailyId && r.projectId) out[r.dailyId] = { sheetId: r.id, projectId: r.projectId };
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Production split — plow vs bore.
 * ------------------------------------------------------------------ */

export interface MethodTotal {
  method: ProductionMethod;
  label: string;
  feet: number;
  /** Which codes made it up, biggest first — so a total can be checked. */
  codes: { code: string; feet: number }[];
}

export interface ProductionSplit {
  from: string;
  to: string;
  plow: MethodTotal;
  bore: MethodTotal;
  other: MethodTotal;
  total: number;
  /** Per-day totals across the window, oldest first. */
  byDay: { day: string; plow: number; bore: number }[];
}

const METHOD_LABEL: Record<ProductionMethod, string> = {
  plow: "Plow",
  bore: "Bore & missile",
  other: "Other units",
};

/**
 * Footage by method over the last N days, from approved and submitted dailies.
 *
 * Counts the quantity on each line item rather than the daily's total, because
 * the total says nothing about how the work was done.
 */
export async function getProductionSplit(days = 7): Promise<ProductionSplit> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

  const dailies = await prisma.daily.findMany({
    where: { status: { not: "Denied" } },
    select: { workDate: true, submittedAt: true, lineItems: true },
  });

  const totals: Record<ProductionMethod, Map<string, number>> = {
    plow: new Map(),
    bore: new Map(),
    other: new Map(),
  };
  const perDay = new Map<string, { plow: number; bore: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    perDay.set(d.toISOString().slice(0, 10), { plow: 0, bore: 0 });
  }

  for (const d of dailies) {
    const t = Date.parse(d.workDate) || Date.parse(d.submittedAt);
    if (!t || Number.isNaN(t)) continue;
    const when = new Date(t);
    if (when < start) continue;
    const key = new Date(when.getFullYear(), when.getMonth(), when.getDate())
      .toISOString()
      .slice(0, 10);

    const items = Array.isArray(d.lineItems) ? (d.lineItems as unknown[]) : [];
    for (const raw of items) {
      const li = raw as { code?: unknown; quantity?: unknown };
      if (typeof li?.code !== "string") continue;
      const qty = typeof li.quantity === "number" ? li.quantity : 0;
      if (!qty) continue;
      const method = productionMethod(li.code);
      const bucket = totals[method];
      bucket.set(li.code, (bucket.get(li.code) ?? 0) + qty);
      const day = perDay.get(key);
      if (day && method !== "other") day[method] += qty;
    }
  }

  const build = (method: ProductionMethod): MethodTotal => {
    const codes = [...totals[method].entries()]
      .map(([code, feet]) => ({ code, feet }))
      .sort((a, b) => b.feet - a.feet);
    return {
      method,
      label: METHOD_LABEL[method],
      feet: codes.reduce((s, c) => s + c.feet, 0),
      codes,
    };
  };

  const plow = build("plow");
  const bore = build("bore");
  const other = build("other");

  return {
    from: start.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    plow,
    bore,
    other,
    total: plow.feet + bore.feet + other.feet,
    byDay: [...perDay.entries()].map(([day, v]) => ({ day, ...v })),
  };
}

/** The organization's stored logo URL, if one has been uploaded. */
export async function getOrganizationLogo(): Promise<string | null> {
  const org = await prisma.organization.findFirst({ select: { logoUrl: true } });
  return org?.logoUrl ?? null;
}

/** One line under the greeting: how many projects, across how many states. */
export async function getPortfolioSummary(): Promise<string> {
  const rows = await prisma.project.findMany({ select: { location: true } });
  if (rows.length === 0) return "No active projects yet";

  // "Colbert, GA" -> "GA". Anything without a state part is simply not counted.
  const states = new Set(
    rows
      .map((r) => r.location.split(",").pop()?.trim().toUpperCase())
      .filter((s): s is string => Boolean(s && s.length <= 3)),
  );

  const projects = `${rows.length} active project${rows.length === 1 ? "" : "s"}`;
  if (states.size === 0) return projects;
  return `${projects} across ${states.size} state${states.size === 1 ? "" : "s"}`;
}

/**
 * Live counts for the sidebar badges, keyed by href.
 *
 * These were hardcoded in the nav config, so they stayed at 2 / 12 / 4 no
 * matter what the account actually held. A badge that never changes is worse
 * than no badge — it trains people to ignore it.
 */
export async function getNavBadges(): Promise<Record<string, number>> {
  const user = await viewer();
  if (!user) return {};

  /**
   * A crew's counts are their own.
   *
   * These were global: the number beside "My projects" was every project at
   * risk across the business, and the one beside "Dailies" was every crew's
   * unreviewed work. Small numbers, but they are somebody else's, and they sat
   * in a rail a subcontractor looks at all day.
   */
  if (!isStaff(user.role)) {
    if (!user.subcontractorId) return {};

    const [mine, badgesOutstanding] = await Promise.all([
      prisma.daily.count({
        where: {
          status: { in: ["Submitted", "In review"] },
          // No company name means nothing of theirs to count, not everything.
          subcontractor: user.subcontractorName ?? "__no_company__",
        },
      }),
      // Anything not yet cleared for the yard — a badge in draft, waiting on
      // Fortitude, or refused. The rail stays lit until every one is sorted.
      prisma.crewBadge.count({
        where: { subcontractorId: user.subcontractorId, status: { not: "APPROVED" } },
      }),
    ]);

    // No badges at all is itself outstanding: nobody can collect material.
    const anyBadges = await prisma.crewBadge.count({
      where: { subcontractorId: user.subcontractorId },
    });

    const badges: Record<string, number> = {};
    if (mine > 0) badges["/dailies"] = mine;
    if (anyBadges === 0) badges["/badges"] = 1;
    else if (badgesOutstanding > 0) badges["/badges"] = badgesOutstanding;
    return badges;
  }

  const [atRisk, awaiting, subsPending, badgesToReview] = await Promise.all([
    prisma.project.count({ where: { tone: { in: ["critical", "warning"] } } }),
    prisma.daily.count({ where: { status: { in: ["Submitted", "In review"] } } }),
    prisma.subcontractor.count({ where: { state: "PENDING_REVIEW" } }),
    prisma.crewBadge.count({ where: { status: "SUBMITTED" } }),
  ]);

  const badges: Record<string, number> = {};
  if (atRisk > 0) badges["/projects"] = atRisk;
  if (awaiting > 0) badges["/dailies"] = awaiting;
  if (subsPending + badgesToReview > 0) badges["/subcontractors"] = subsPending + badgesToReview;
  return badges;
}

/* ------------------------------------------------------------------ *
 * Project valuation — what a job is worth before it starts.
 * ------------------------------------------------------------------ */

export interface ProjectValuation extends Valuation {
  /** Codes on the material list with a planned quantity. */
  plannedCodes: number;
  hasCustomerRates: boolean;
  hasSubRates: boolean;
  /**
   * Where the cost side came from: a crew's signed card, or the job's own
   * budgeted rates. A plan and a contract are not the same claim.
   */
  subCostSource: "crew" | "planned" | null;
  /**
   * Crews on the job with no signed rate card. Their work costs something;
   * we just cannot say what, so the margin shown excludes them and says so.
   */
  unratedCrews: string[];
  /**
   * The same two rate cards applied to what has actually been billed on
   * dailies, rather than what the material list plans for. Both sides come
   * from real rates — there is no percentage-of-revenue estimate anywhere.
   */
  billed: {
    revenue: PricingResult;
    subCost: PricingResult | null;
    grossMargin: number | null;
    grossMarginPct: number | null;
    dailies: number;
  };
}

/**
 * Price a project's material list twice: once at what the customer pays us,
 * once at what we pay the sub. The difference is the gross the job is worth
 * before overhead, fuel, restoration and damages.
 *
 * This reads the *plan*, not production — it answers "is this job worth taking"
 * on the day the material list lands, long before the first daily. Coverage is
 * reported alongside the totals because a total priced from a third of the
 * codes is not a smaller number, it is a wrong one.
 */
export async function getProjectValuation(projectId: string): Promise<ProjectValuation> {
  // Staff only, and not merely hidden in the page. This reads what Globe pays
  // us, what the sub is paid, and the spread between them — the three things a
  // subcontractor must never see about their own work. Hiding the panel would
  // leave the query running for them; refusing here means there is no path to
  // the numbers at all.
  await requireStaff();
  await assertProjectAccess(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      client: true,
      customerId: true,
      // Decides which of the customer's cards this job is priced against.
      market: true,
      materials: {
        where: { inScope: true },
        select: { code: true, item: true, unit: true, planned: true },
      },
      crews: { select: { id: true, company: true } },
    },
  });

  const empty: PricingResult = {
    lines: [],
    unpriced: [],
    total: 0,
    pricedCodes: 0,
    totalCodes: 0,
    complete: false,
  };

  if (!project) {
    return {
      revenue: empty,
      subCost: null,
      subName: null,
      grossMargin: null,
      grossMarginPct: null,
      plannedCodes: 0,
      hasCustomerRates: false,
      hasSubRates: false,
      subCostSource: null,
      unratedCrews: [],
      billed: {
        revenue: empty,
        subCost: null,
        grossMargin: null,
        grossMarginPct: null,
        dailies: 0,
      },
    };
  }

  const quantities: QuantityRow[] = project.materials
    .filter((m) => m.code && m.planned > 0)
    .map((m) => ({
      code: m.code,
      quantity: m.planned,
      description: m.item,
      unit: m.unit,
    }));

  // The customer link is by id where it exists; older projects only carry the
  // client name, so fall back to that rather than silently pricing nothing.
  const customer = project.customerId
    ? await prisma.customer.findUnique({
        where: { id: project.customerId },
        select: { id: true },
      })
    : await prisma.customer.findFirst({
        where: { name: project.client },
        select: { id: true },
      });

  const customerRates = ratesForMarket(
    customer
      ? await prisma.customerRate.findMany({
          where: { customerId: customer.id },
        select: { code: true, description: true, unit: true, rate: true, effectiveDate: true, expirationDate: true, market: true },
        })
      : [],
    project.market,
  );

  /**
   * Cost the plan at the one crew that has a signed card.
   *
   * Counting assigned crews was too blunt. Adding a second crew who hasn't been
   * rated yet blanked the margin on a job that was perfectly costable, because
   * a crew with no rate card carries no cost information either way. What
   * creates real ambiguity is two crews who both have cards and no way to know
   * which does which footage — that still reports nothing rather than guessing
   * a split.
   */
  const crewCards = ratesForMarket(
    await prisma.subcontractorRate.findMany({
      where: { subcontractorId: { in: project.crews.map((c) => c.id) } },
      select: {
        subcontractorId: true, code: true, description: true,
        unit: true, rate: true, effectiveDate: true, expirationDate: true, market: true,
      },
    }),
    project.market,
  );

  const ratesByCrew = new Map<string, typeof crewCards>();
  for (const r of crewCards) {
    ratesByCrew.set(r.subcontractorId, [...(ratesByCrew.get(r.subcontractorId) ?? []), r]);
  }

  const rated = project.crews.filter((c) => (ratesByCrew.get(c.id)?.length ?? 0) > 0);
  const sub = rated.length === 1 ? rated[0] : null;
  const subRates = sub ? (ratesByCrew.get(sub.id) ?? []) : [];
  const unratedCrews = project.crews
    .filter((c) => (ratesByCrew.get(c.id)?.length ?? 0) === 0)
    .map((c) => c.company);

  /**
   * Fall back to the job's own budgeted rates when no assigned crew has a
   * signed card.
   *
   * A job has to be priceable the day the material list lands, which is long
   * before anyone is assigned to it. Without this the cost side sits blank on
   * every unassigned job and there is no margin to decide on. The two stay
   * distinguishable — a budget must never be mistaken for what a company
   * actually signed.
   */
  const plannedRates = await prisma.projectRate.findMany({
    where: { projectId },
    select: { code: true, description: true, unit: true, rate: true },
  });

  const crewCard = sub && subRates.length > 0 ? subRates : null;
  const usableSubRates = crewCard ?? (plannedRates.length > 0 ? plannedRates : null);
  const subCostSource: "crew" | "planned" | null = crewCard
    ? "crew"
    : plannedRates.length > 0
      ? "planned"
      : null;
  const valuation = valueProject(
    quantities,
    customerRates,
    usableSubRates,
    sub?.company ?? (subCostSource === "planned" ? "Planned rates" : null),
  );

  // What has actually been billed, from the dailies' own line items. Priced
  // with the same two rate cards — never a percentage of revenue, because a
  // percentage is a guess dressed up as a figure you could invoice against.
  const dailies = await prisma.daily.findMany({
    where: { projectId },
    select: { lineItems: true, subcontractor: true, workDate: true },
  });

  /** Roll a daily's line items up by unit code. */
  const codesOf = (lineItems: unknown) => {
    const out = new Map<string, number>();
    const items = Array.isArray(lineItems) ? (lineItems as unknown[]) : [];
    for (const raw of items) {
      const li = raw as { code?: unknown; quantity?: unknown };
      if (typeof li?.code !== "string") continue;
      const code = li.code.trim().toUpperCase();
      if (!code) continue;
      out.set(code, (out.get(code) ?? 0) + (typeof li.quantity === "number" ? li.quantity : 0));
    }
    return out;
  };

  const billedByCode = new Map<string, number>();
  /** Same quantities, kept apart by the company that filed them. */
  const byCompany = new Map<string, Map<string, number>>();

  for (const d of dailies) {
    const codes = codesOf(d.lineItems);
    const company = d.subcontractor?.trim() || "";
    const bucket = byCompany.get(company) ?? new Map<string, number>();
    for (const [code, qty] of codes) {
      billedByCode.set(code, (billedByCode.get(code) ?? 0) + qty);
      bucket.set(code, (bucket.get(code) ?? 0) + qty);
    }
    byCompany.set(company, bucket);
  }

  const asRows = (m: Map<string, number>): QuantityRow[] =>
    [...m.entries()].map(([code, quantity]) => ({ code, quantity }));

  const billedRevenue = priceQuantities(asRows(billedByCode), customerRates);

  // Cost each company's own production against its own signed card. Two subs on
  // one job are not on the same numbers, so a single blended card — or worse, a
  // percentage — would misstate what each is actually owed.
  let billedSubCost: PricingResult | null = null;
  if (byCompany.size > 0) {
    const cards = await prisma.subcontractor.findMany({
      where: { company: { in: [...byCompany.keys()].filter(Boolean) } },
      select: {
        company: true,
        rates: {
          select: {
            code: true, description: true, unit: true,
            rate: true, effectiveDate: true, expirationDate: true,
          },
        },
      },
    });

    const lines: PricingResult["lines"] = [];
    const unpriced: PricingResult["unpriced"] = [];
    let any = false;

    for (const [company, codes] of byCompany) {
      const card = cards.find((c) => c.company === company);
      if (!card || card.rates.length === 0) {
        // No signed card on file — report every code rather than costing at zero.
        for (const [code, quantity] of codes) unpriced.push({ code, description: company, quantity });
        continue;
      }
      any = true;
      const priced = priceQuantities(asRows(codes), card.rates);
      lines.push(...priced.lines);
      unpriced.push(...priced.unpriced.map((u) => ({ ...u, description: u.description || company })));
    }

    const total = lines.reduce((s, l) => s + l.amount, 0);
    billedSubCost = any
      ? {
          lines,
          unpriced,
          total,
          pricedCodes: lines.length,
          totalCodes: lines.length + unpriced.length,
          complete: unpriced.length === 0 && lines.length > 0,
        }
      : null;
  }

  const billedMargin = billedSubCost ? billedRevenue.total - billedSubCost.total : null;

  return {
    ...valuation,
    plannedCodes: quantities.length,
    hasCustomerRates: customerRates.length > 0,
    hasSubRates: subRates.length > 0,
    subCostSource,
    unratedCrews,
    billed: {
      revenue: billedRevenue,
      subCost: billedSubCost,
      grossMargin: billedMargin,
      grossMarginPct:
        billedMargin !== null && billedRevenue.total > 0
          ? billedMargin / billedRevenue.total
          : null,
      dailies: dailies.length,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Customer rollup — the book of business, added up from the jobs.
 * ------------------------------------------------------------------ */

export interface CustomerRollup {
  /** Every project's material list priced at this customer's rate card. */
  contractValue: number;
  /**
   * Revenue from only the jobs that also have a crew cost, so margin is a
   * like-for-like figure. A job with no crew assigned has no cost yet, not a
   * cost of zero, and including its revenue would inflate the spread.
   */
  costedRevenue: number;
  projectsCosted: number;
  /** The same lists priced at the crews' cards. Null until a crew is assigned. */
  baselineSubCost: number | null;
  baselineNetProfit: number | null;
  baselineNetProfitPct: number | null;
  /** Prior billing typed in by hand, plus everything priced off dailies since. */
  billedToDate: number;
  priorBilled: number;
  billedFromDailies: number;
  /**
   * Contract value not yet billed — work sold and still to invoice. Clamped at
   * zero: billing past the material list means the list is stale, not that the
   * backlog is negative.
   */
  leftToBill: number;
  /** Invoices and the money against them. */
  ar: ArTotals;
  /**
   * Codes reported on approved dailies that no rate card can price, with the
   * quantity stuck behind them. This is production already in the ground that
   * cannot be invoiced — the most expensive thing on this screen to not know.
   */
  unbillable: { code: string; quantity: number }[];
  /** Crews on these jobs with no signed rate card, so no cost for their work. */
  unratedCrews: string[];
  /** Coverage, so a total assembled from half the jobs can't read as complete. */
  projects: number;
  projectsValued: number;
  unpricedCodes: number;
  perProject: {
    id: string;
    name: string;
    contractValue: number;
    subCost: number | null;
    netProfit: number | null;
    billed: number;
    unpricedCodes: number;
  }[];
}

/**
 * Add every project up into what the relationship is worth.
 *
 * Contract value is not a figure anyone types — it is each job's material list
 * priced at the signed rate card, summed. Land another project and it grows on
 * its own. The sub side is the same lists at the crews' cards, so the spread is
 * the baseline net the book is carrying before overhead.
 *
 * Jobs with no material list contribute nothing and are counted separately:
 * a total built from three of five projects is not a smaller number, it is a
 * wrong one, and the caller is told which it has.
 */
export async function getCustomerRollup(customerId: string): Promise<CustomerRollup> {
  // The whole point of this figure is margin against the customer, which is
  // the one thing a crew must never see about the work they do.
  await requireStaff();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, priorBilled: true },
  });

  const empty: CustomerRollup = {
    contractValue: 0,
    costedRevenue: 0,
    projectsCosted: 0,
    baselineSubCost: null,
    baselineNetProfit: null,
    baselineNetProfitPct: null,
    billedToDate: 0,
    priorBilled: 0,
    billedFromDailies: 0,
    leftToBill: 0,
    ar: { ...EMPTY_AR, counts: { ...EMPTY_AR.counts } },
    unbillable: [],
    unratedCrews: [],
    projects: 0,
    projectsValued: 0,
    unpricedCodes: 0,
    perProject: [],
  };
  if (!customer) return empty;

  // Older projects carry only the client name, so match on either.
  const projects = await prisma.project.findMany({
    where: { OR: [{ customerId: customer.id }, { client: customer.name }] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const ar = await getCustomerAr(customer.id);

  const perProject: CustomerRollup["perProject"] = [];
  let contractValue = 0;
  let subCostTotal = 0;
  let anySubCost = false;
  let billedFromDailies = 0;
  let unpricedCodes = 0;
  let projectsValued = 0;
  let costedRevenue = 0;
  let projectsCosted = 0;
  const unbillable = new Map<string, number>();
  const unratedCrews = new Set<string>();

  for (const p of projects) {
    const v = await getProjectValuation(p.id);
    const subCost = v.subCost?.total ?? null;

    contractValue += v.revenue.total;
    billedFromDailies += v.billed.revenue.total;
    unpricedCodes += v.revenue.unpriced.length;
    if (v.revenue.total > 0) projectsValued++;
    for (const c of v.unratedCrews) unratedCrews.add(c);
    for (const u of v.billed.revenue.unpriced) {
      unbillable.set(u.code, (unbillable.get(u.code) ?? 0) + u.quantity);
    }
    if (subCost !== null) {
      subCostTotal += subCost;
      costedRevenue += v.revenue.total;
      projectsCosted++;
      anySubCost = true;
    }

    perProject.push({
      id: p.id,
      name: p.name,
      contractValue: v.revenue.total,
      subCost,
      netProfit: subCost !== null ? v.revenue.total - subCost : null,
      billed: v.billed.revenue.total,
      unpricedCodes: v.revenue.unpriced.length,
    });
  }

  // Margin is worked out only over the jobs that have both sides. Subtracting
  // one project's sub cost from three projects' revenue reads as a spectacular
  // margin and is arithmetic on two different populations — a job with no crew
  // assigned has no cost yet, not a cost of zero.
  const baselineSubCost = anySubCost ? subCostTotal : null;
  const baselineNetProfit = baselineSubCost !== null ? costedRevenue - baselineSubCost : null;

  return {
    contractValue,
    costedRevenue,
    projectsCosted,
    baselineSubCost,
    baselineNetProfit,
    baselineNetProfitPct:
      baselineNetProfit !== null && costedRevenue > 0 ? baselineNetProfit / costedRevenue : null,
    billedToDate: customer.priorBilled + billedFromDailies,
    priorBilled: customer.priorBilled,
    billedFromDailies,
    leftToBill: Math.max(0, contractValue - (customer.priorBilled + billedFromDailies)),
    ar,
    unbillable: [...unbillable.entries()].map(([code, quantity]) => ({ code, quantity })),
    unratedCrews: [...unratedCrews],
    projects: projects.length,
    projectsValued,
    unpricedCodes,
    perProject,
  };
}

/* ------------------------------------------------------------------ *
 * Accounts receivable — what has been billed, and what has come back.
 * ------------------------------------------------------------------ */

export interface ArTotals {
  /** Invoiced and not void, at the figures the customer was sent. */
  invoiced: number;
  /** Money received against those invoices. */
  collected: number;
  /** Invoiced less collected — what is actually outstanding. */
  openAr: number;
  /** The part of open AR whose due date has passed. */
  pastDue: number;
  /** Withheld under the contract. Owed, but not billable until release. */
  retainageHeld: number;
  /** Staged but not sent — revenue one click from being invoiced. */
  draftValue: number;
  counts: { draft: number; open: number; pastDue: number; paid: number };
}

const EMPTY_AR: ArTotals = {
  invoiced: 0, collected: 0, openAr: 0, pastDue: 0,
  retainageHeld: 0, draftValue: 0,
  counts: { draft: 0, open: 0, pastDue: 0, paid: 0 },
};

/**
 * Add invoices and their payments up into an AR position.
 *
 * Open AR is invoiced-less-received, never a status flag on its own: an
 * invoice marked PAID with a $40 short payment against it is $40 of AR, and a
 * business that trusts the flag never finds that money.
 *
 * Retainage sits outside AR deliberately. It is owed, but it is not collectable
 * until release, and folding it into AR makes the position look healthier than
 * the bank will.
 */
function totalAr(
  invoices: {
    status: string;
    amountDue: number;
    retainageHeld: number;
    dueAt: Date | null;
    payments: { amount: number }[];
  }[],
  today = new Date(),
): ArTotals {
  const t: ArTotals = { ...EMPTY_AR, counts: { ...EMPTY_AR.counts } };

  for (const inv of invoices) {
    if (inv.status === "VOID") continue;

    if (inv.status === "DRAFT") {
      t.draftValue += inv.amountDue;
      t.counts.draft++;
      continue;
    }

    const { paid, balance, settled } = balanceOf(inv.amountDue, inv.payments);
    t.invoiced += inv.amountDue;
    t.collected += paid;
    t.retainageHeld += inv.retainageHeld;

    if (settled) {
      t.counts.paid++;
      continue;
    }

    t.openAr += balance;
    t.counts.open++;
    if (isPastDue(inv.dueAt, balance, today)) {
      t.pastDue += balance;
      t.counts.pastDue++;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  t.invoiced = round(t.invoiced);
  t.collected = round(t.collected);
  t.openAr = round(t.openAr);
  t.pastDue = round(t.pastDue);
  t.retainageHeld = round(t.retainageHeld);
  t.draftValue = round(t.draftValue);
  return t;
}

/** The AR position for one customer. */
export async function getCustomerAr(customerId: string): Promise<ArTotals> {
  await requireStaff();
  const invoices = await prisma.invoice.findMany({
    where: { customerId },
    select: {
      status: true, amountDue: true, retainageHeld: true, dueAt: true,
      payments: { select: { amount: true } },
    },
  });
  return totalAr(invoices);
}

export interface InvoiceRow {
  id: string;
  number: string;
  customer: string;
  customerId: string;
  project: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  subtotal: number;
  retainageHeld: number;
  amountDue: number;
  paid: number;
  balance: number;
  issuedAt: string | null;
  dueAt: string | null;
  pastDue: boolean;
  lineCount: number;
  dailyCount: number;
  payments: {
    id: string; amount: number; receivedOn: string;
    method: string; reference: string; note: string;
  }[];
}

/** Every invoice, newest period first, with its money worked out. */
export async function getInvoiceRows(): Promise<InvoiceRow[]> {
  await requireStaff();
  const rows = await prisma.invoice.findMany({
    orderBy: [{ periodEnd: "desc" }, { number: "desc" }],
    select: {
      id: true, number: true, projectName: true, customerId: true,
      periodStart: true, periodEnd: true, status: true,
      subtotal: true, retainageHeld: true, amountDue: true,
      issuedAt: true, dueAt: true,
      customer: { select: { name: true } },
      lines: { select: { dailyId: true } },
      payments: {
        orderBy: { receivedOn: "asc" },
        select: {
          id: true, amount: true, receivedOn: true,
          method: true, reference: true, note: true,
        },
      },
    },
  });

  const now = new Date();
  return rows.map((r) => {
    const { paid, balance } = balanceOf(r.amountDue, r.payments);
    return {
      id: r.id,
      number: r.number,
      customer: r.customer.name,
      customerId: r.customerId,
      project: r.projectName,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      status: r.status,
      subtotal: r.subtotal,
      retainageHeld: r.retainageHeld,
      amountDue: r.amountDue,
      paid,
      balance,
      issuedAt: r.issuedAt?.toISOString().slice(0, 10) ?? null,
      dueAt: r.dueAt?.toISOString().slice(0, 10) ?? null,
      pastDue: r.status !== "DRAFT" && r.status !== "VOID" && isPastDue(r.dueAt, balance, now),
      lineCount: r.lines.length,
      dailyCount: new Set(r.lines.map((l) => l.dailyId).filter(Boolean)).size,
      payments: r.payments,
    };
  });
}

/** The AR position across every customer, for the invoicing page. */
export async function getArTotals(): Promise<ArTotals> {
  await requireStaff();
  const invoices = await prisma.invoice.findMany({
    select: {
      status: true, amountDue: true, retainageHeld: true, dueAt: true,
      payments: { select: { amount: true } },
    },
  });
  return totalAr(invoices);
}

/**
 * Contract value for every customer at once, for the directory list.
 *
 * The same arithmetic as the rollup — material lists at the signed card — but
 * batched into four queries instead of one valuation per project, because the
 * list renders every customer on the page and the per-project path does a
 * handful of round trips each.
 */
export async function getCustomerContractValues(): Promise<Record<string, number>> {
  await requireStaff();

  const [customers, projects, rates] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, name: true } }),
    prisma.project.findMany({
      select: {
        customerId: true,
        client: true,
        materials: {
        where: { inScope: true },
        select: { code: true, item: true, unit: true, planned: true },
      },
      },
    }),
    prisma.customerRate.findMany({
      select: {
        customerId: true, code: true, description: true,
        unit: true, rate: true, effectiveDate: true, expirationDate: true,
      },
    }),
  ]);

  const ratesByCustomer = new Map<string, typeof rates>();
  for (const r of rates) {
    const list = ratesByCustomer.get(r.customerId) ?? [];
    list.push(r);
    ratesByCustomer.set(r.customerId, list);
  }
  const byName = new Map(customers.map((c) => [c.name, c.id]));

  const out: Record<string, number> = {};
  for (const c of customers) out[c.id] = 0;

  for (const p of projects) {
    // Older projects carry only the client name, same fallback as the rollup.
    const customerId = p.customerId ?? byName.get(p.client) ?? null;
    if (!customerId || !(customerId in out)) continue;

    const card = ratesByCustomer.get(customerId);
    if (!card?.length) continue;

    const quantities: QuantityRow[] = p.materials
      .filter((m) => m.code && m.planned > 0)
      .map((m) => ({ code: m.code, quantity: m.planned, description: m.item, unit: m.unit }));

    out[customerId] += priceQuantities(quantities, card).total;
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Vendor packet.
 * ------------------------------------------------------------------ */

export interface VendorPacketView {
  id: string;
  company: string;
  legalName: string; dba: string; entityType: string;
  stateOfIncorporation: string; ein: string; website: string;
  addressLine1: string; addressLine2: string; city: string;
  stateRegion: string; postalCode: string;
  /** Who to ring. Captured first so an abandoned packet still has a person. */
  lead: string; email: string;
  phone: string; mobilePhone: string;
  emergencyContactName: string; emergencyContactPhone: string;
  /** Whether this crew has agreed to operational texts. */
  smsConsent: boolean;
  signatoryName: string; signatoryTitle: string;
  apContactName: string; apEmail: string; apPhone: string;
  billingContactName: string; billingContactTitle: string; billingEmail: string;
  billingMobile: string; billingOfficePhone: string; billingMailingAddress: string;
  paymentMethod: string; paymentTerms: string; remittanceEmail: string;
  contractorLicense: string; dotNumber: string; locateCert: string;
  emr: string; oshaRecordables: string; safetyContact: string;
  references: { company: string; contact: string; phone: string; email: string }[];
}

/**
 * The packet for one crew, for them to edit or for staff to review.
 *
 * Routing and account numbers come back masked — the browser is never sent the
 * real value, so a form round trip cannot leak one and a saved-page cache
 * cannot hold one.
 */
export async function getVendorPacket(subcontractorId: string): Promise<VendorPacketView | null> {
  await assertOwnSubcontractor(subcontractorId);
  const s = await prisma.subcontractor.findUnique({ where: { id: subcontractorId } });
  if (!s) return null;

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: s.id,
    company: s.company,
    legalName: s.legalName, dba: s.dba, entityType: s.entityType,
    stateOfIncorporation: s.stateOfIncorporation, ein: s.ein, website: s.website,
    addressLine1: s.addressLine1, addressLine2: s.addressLine2, city: s.city,
    stateRegion: s.stateRegion, postalCode: s.postalCode,
    phone: s.phone, mobilePhone: s.mobilePhone,
    emergencyContactName: s.emergencyContactName, emergencyContactPhone: s.emergencyContactPhone,
    smsConsent: Boolean(s.smsConsentAt),
    lead: s.lead, email: s.email,
    signatoryName: s.signatoryName, signatoryTitle: s.signatoryTitle,
    apContactName: s.apContactName, apEmail: s.apEmail, apPhone: s.apPhone,
    billingContactName: s.billingContactName, billingContactTitle: s.billingContactTitle,
    billingEmail: s.billingEmail, billingMobile: s.billingMobile,
    billingOfficePhone: s.billingOfficePhone, billingMailingAddress: s.billingMailingAddress,
    paymentMethod: s.paymentMethod, paymentTerms: s.paymentTerms, remittanceEmail: s.remittanceEmail,
    contractorLicense: s.contractorLicense, dotNumber: s.dotNumber, locateCert: s.locateCert,
    emr: s.emr === null ? "" : String(s.emr),
    oshaRecordables: s.oshaRecordables === null ? "" : String(s.oshaRecordables),
    safetyContact: s.safetyContact,
    references: (Array.isArray(s.references) ? s.references : []).map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        company: str(o.company), contact: str(o.contact),
        phone: str(o.phone), email: str(o.email),
      };
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Document Intelligence Center.
 * ------------------------------------------------------------------ */

export interface DocumentSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  project: string | null;
  subcontractor: string | null;
  customer: string | null;
  effectiveDate: string;
  expirationDate: string;
  versionNo: number;
  updatedAt: string;
  /** Newest attached file, for a one-click download straight from a row. */
  fileId: string | null;
}

export interface DocumentDashboard {
  drafts: number;
  awaitingApproval: number;
  awaitingSignature: number;
  signedThisMonth: number;
  expiringSoon: number;
  executed: number;
  templates: number;
  clauses: number;
  total: number;
  recent: DocumentSummary[];
}

/** Statuses that mean "sent, not finished" — the signature queue. */
const AWAITING_SIGNATURE = ["SENT", "VIEWED", "PARTIALLY_SIGNED"] as const;

/**
 * The document dashboard.
 *
 * Counts come from the database, so an empty centre reports zeros rather than
 * a plausible-looking figure. A zero that is true tells you what to set up.
 */
export async function getDocumentDashboard(): Promise<DocumentDashboard> {
  await requireStaff();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const soon = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const live = { deletedAt: null };

  const [
    drafts,
    awaitingApproval,
    awaitingSignature,
    signedThisMonth,
    expiringSoon,
    executed,
    templates,
    clauses,
    total,
    recentRows,
  ] = await Promise.all([
    prisma.document.count({ where: { ...live, status: "DRAFT" } }),
    prisma.document.count({ where: { ...live, status: { in: ["INTERNAL_REVIEW", "CHANGES_REQUESTED"] } } }),
    prisma.document.count({ where: { ...live, status: { in: [...AWAITING_SIGNATURE] } } }),
    prisma.document.count({
      where: { ...live, status: { in: ["SIGNED", "EXECUTED"] }, updatedAt: { gte: monthStart } },
    }),
    prisma.document.count({
      where: {
        ...live,
        status: { notIn: ["ARCHIVED", "VOIDED", "SUPERSEDED", "EXPIRED"] },
        expirationDate: { gt: "", lte: soon, gte: today },
      },
    }),
    prisma.document.count({ where: { ...live, status: "EXECUTED" } }),
    prisma.documentTemplate.count({ where: { active: true } }),
    prisma.clause.count({ where: { active: true } }),
    prisma.document.count({ where: live }),
    prisma.document.findMany({
      where: live,
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        project: { select: { name: true } },
        subcontractor: { select: { company: true } },
        customer: { select: { name: true } },
        versions: { orderBy: { versionNo: "desc" }, take: 1, select: { versionNo: true } },
        files: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
      },
    }),
  ]);

  return {
    drafts,
    awaitingApproval,
    awaitingSignature,
    signedThisMonth,
    expiringSoon,
    executed,
    templates,
    clauses,
    total,
    recent: recentRows.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      status: d.status,
      project: d.project?.name ?? null,
      subcontractor: d.subcontractor?.company ?? null,
      customer: d.customer?.name ?? null,
      effectiveDate: d.effectiveDate,
      expirationDate: d.expirationDate,
      versionNo: d.versions[0]?.versionNo ?? 0,
      updatedAt: d.updatedAt.toISOString(),
      fileId: d.files[0]?.id ?? null,
    })),
  };
}

export interface DocumentFileRef {
  id: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  kind: string;
  createdAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  files: DocumentFileRef[];
  createdAt: string;
}

/**
 * Every document a viewer may see.
 *
 * Staff see the lot. A crew sees only documents addressed to their company or
 * explicitly shared with them — the same rule the download route enforces, so
 * the list and the file can never disagree about who is allowed what.
 */
export async function getDocuments(): Promise<DocumentDetail[]> {
  const user = await viewer();
  if (!user) return [];

  const staffViewer = await visibleProjectIds(user).then((v) => v === null);

  const rows = await prisma.document.findMany({
    where: {
      deletedAt: null,
      ...(staffViewer
        ? {}
        : {
            OR: [
              { subcontractorId: user.subcontractorId ?? "" },
              {
                access: {
                  some: {
                    canView: true,
                    OR: [{ subcontractorId: user.subcontractorId ?? "" }, { userId: user.id }],
                  },
                },
              },
            ],
          }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { name: true } },
      subcontractor: { select: { company: true } },
      customer: { select: { name: true } },
      versions: { orderBy: { versionNo: "desc" }, take: 1, select: { versionNo: true } },
      files: { orderBy: { createdAt: "desc" } },
    },
  });

  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    status: d.status,
    project: d.project?.name ?? null,
    subcontractor: d.subcontractor?.company ?? null,
    customer: d.customer?.name ?? null,
    effectiveDate: d.effectiveDate,
    expirationDate: d.expirationDate,
    versionNo: d.versions[0]?.versionNo ?? 1,
    updatedAt: d.updatedAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
    fileId: d.files[0]?.id ?? null,
    files: d.files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      mime: f.mime,
      sizeBytes: f.sizeBytes,
      kind: f.kind,
      createdAt: f.createdAt.toISOString(),
    })),
  }));
}

/* ------------------------------------------------------------------ *
 * Project photos — the field record.
 * ------------------------------------------------------------------ */

export interface ProjectPhotoRow {
  id: string;
  url: string;
  mediaType: string;
  sizeBytes: number;
  kind: "PHOTO" | "VIDEO";
  source: "CAMERA" | "LIBRARY";
  capturedAt: string | null;
  capturedAtSource: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  locationSource: string;
  caption: string;
  purpose: "RECORD" | "DIRECTION";
  uploadedBy: string;
  createdAt: string;
}

/**
 * Every photo on a project, newest first.
 *
 * Ordered by when the shutter fired where that is known, falling back to upload
 * time — a crew photographing Tuesday's work on Thursday should file under
 * Tuesday, which is the whole point of keeping the two dates apart.
 */
export async function getProjectPhotos(projectId: string): Promise<ProjectPhotoRow[]> {
  await viewer();
  await assertProjectAccess(projectId);

  const rows = await prisma.projectPhoto.findMany({
    where: { projectId },
    orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    mediaType: r.mediaType,
    sizeBytes: r.sizeBytes,
    kind: r.kind === "VIDEO" ? "VIDEO" : "PHOTO",
    source: r.source === "CAMERA" ? "CAMERA" : "LIBRARY",
    capturedAt: r.capturedAt?.toISOString() ?? null,
    capturedAtSource: r.capturedAtSource,
    lat: r.lat,
    lng: r.lng,
    accuracyM: r.accuracyM,
    locationSource: r.locationSource,
    caption: r.caption,
    purpose: r.purpose === "DIRECTION" ? "DIRECTION" : "RECORD",
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Resolve an invite link to the job it was issued for.
 *
 * Public by necessity — the crew opening it has no account. It returns only
 * what the invitation itself already told them (which job, which customer,
 * where), and nothing about the project's money, materials or other crews.
 *
 * The link stays open: a job may take two or three crews, and each registers
 * through the same link. Only an unknown token is refused, so the page never
 * renders a signup form for a string somebody typed.
 */
export async function getInvite(token: string): Promise<{
  projectName: string;
  client: string;
  location: string;
} | null> {
  if (!token?.trim()) return null;

  const invite = await prisma.invite.findUnique({
    where: { token },
    select: { projectId: true, projectName: true, customer: true },
  });
  if (!invite) return null;

  // Read the project directly rather than through getProject, which is scoped
  // to a signed-in viewer and would return nothing here. The invite is the
  // authorization, and only these three fields cross over.
  const project = invite.projectId
    ? await prisma.project.findUnique({
        where: { id: invite.projectId },
        select: { name: true, client: true, location: true },
      })
    : null;

  return {
    projectName: project?.name ?? invite.projectName,
    client: project?.client ?? invite.customer,
    location: project?.location ?? "",
  };
}

/* ------------------------------------------------------------------ *
 * Rates on one job — what we bill and what we pay, side by side.
 * ------------------------------------------------------------------ */

export interface ProjectRateLine {
  code: string;
  description: string;
  unit: string;
  planned: number;
  /** What the customer pays us. Null when the code isn't on their card. */
  customerRate: number | null;
  /** What we pay this crew. Null when it isn't on theirs — the gap to fill. */
  subRate: number | null;
  /** The sub-rate row's id, so a cell can be edited in place. */
  subRateId: string | null;
  /** Per unit, and across the planned quantity. */
  spread: number | null;
  plannedRevenue: number | null;
  plannedCost: number | null;
}

export interface ProjectRates {
  crew: { id: string; company: string } | null;
  /**
   * Whether the pay column is a crew's signed card or the job's own budget.
   * Editing writes to whichever it is, so a budget never silently rewrites
   * what a company signed.
   */
  source: "crew" | "planned";
  /** Crews on the job with no card — why the pay column may be empty. */
  unratedCrews: string[];
  /** More than one rated crew: which card applies isn't knowable here. */
  ambiguous: boolean;
  lines: ProjectRateLine[];
  totals: { revenue: number; cost: number; margin: number | null };
  missingCustomerRates: number;
  missingSubRates: number;
}

/**
 * The rate picture for one job, restricted to the codes it actually uses.
 *
 * A full card is thousands of lines; a job is twenty. Sending a crew their
 * rates, or adjusting one before you do, means working from the codes on this
 * material list — so that is what this returns, both sides against each other,
 * with anything unpriced named rather than shown as zero.
 */
export async function getProjectRates(projectId: string): Promise<ProjectRates> {
  // Reads what we bill against what we pay — the spread. Staff only, and not
  // merely hidden in the page.
  await requireStaff();
  await assertProjectAccess(projectId);

  const empty: ProjectRates = {
    crew: null, source: "planned", unratedCrews: [], ambiguous: false, lines: [],
    totals: { revenue: 0, cost: 0, margin: null },
    missingCustomerRates: 0, missingSubRates: 0,
  };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      customerId: true,
      // Decides which of the customer's cards this job is priced against.
      market: true,
      client: true,
      materials: {
        where: { inScope: true },
        select: { code: true, item: true, unit: true, planned: true },
      },
      crews: { select: { id: true, company: true } },
    },
  });
  if (!project) return empty;

  const customerId =
    project.customerId ??
    (await prisma.customer.findFirst({ where: { name: project.client }, select: { id: true } }))?.id ??
    null;

  const customerRates = ratesForMarket(
    customerId
      ? await prisma.customerRate.findMany({
          where: { customerId },
        select: { code: true, description: true, unit: true, rate: true, effectiveDate: true, expirationDate: true, market: true },
        })
      : [],
    project.market,
  );

  // Same rule the valuation uses: cost at the one crew that has a card.
  const cards = ratesForMarket(
    await prisma.subcontractorRate.findMany({
      where: { subcontractorId: { in: project.crews.map((c) => c.id) } },
      select: {
        id: true, subcontractorId: true, code: true, description: true,
        unit: true, rate: true, effectiveDate: true, expirationDate: true, market: true,
      },
    }),
    project.market,
  );
  const byCrew = new Map<string, typeof cards>();
  for (const r of cards) byCrew.set(r.subcontractorId, [...(byCrew.get(r.subcontractorId) ?? []), r]);

  const rated = project.crews.filter((c) => (byCrew.get(c.id)?.length ?? 0) > 0);
  const crew = rated.length === 1 ? rated[0] : null;

  // No crew with a card? Price the cost side off the job's own budget, so a
  // margin exists to decide on before anyone is assigned.
  const planned = await prisma.projectRate.findMany({
    where: { projectId },
    select: { id: true, code: true, description: true, unit: true, rate: true },
  });
  const usingCrew = Boolean(crew);
  const subRates = crew ? (byCrew.get(crew.id) ?? []) : planned;

  const lines: ProjectRateLine[] = [];
  let revenue = 0;
  let cost = 0;
  let missingCustomerRates = 0;
  let missingSubRates = 0;

  for (const m of project.materials) {
    if (!m.code || m.planned <= 0) continue;

    const cr = findRate(m.code, customerRates);
    const sr = findRate(m.code, subRates);
    const srRow = sr
      ? subRates.find((r) => normalizeCode(r.code) === normalizeCode(m.code))
      : null;

    if (!cr) missingCustomerRates++;
    if (!sr) missingSubRates++;

    const plannedRevenue = cr ? m.planned * cr.rate : null;
    const plannedCost = sr ? m.planned * sr.rate : null;
    if (plannedRevenue !== null) revenue += plannedRevenue;
    if (plannedCost !== null) cost += plannedCost;

    lines.push({
      code: m.code,
      description: cr?.description || m.item,
      unit: cr?.unit || m.unit,
      planned: m.planned,
      customerRate: cr?.rate ?? null,
      subRate: sr?.rate ?? null,
      subRateId: srRow?.id ?? null,
      spread: cr && sr ? Math.round((cr.rate - sr.rate) * 100) / 100 : null,
      plannedRevenue,
      plannedCost,
    });
  }

  // Biggest money first — that is the line worth arguing about.
  lines.sort((a, b) => (b.plannedRevenue ?? 0) - (a.plannedRevenue ?? 0));

  return {
    crew,
    source: usingCrew ? "crew" : "planned",
    unratedCrews: project.crews
      .filter((c) => (byCrew.get(c.id)?.length ?? 0) === 0)
      .map((c) => c.company),
    ambiguous: rated.length > 1,
    lines,
    totals: {
      revenue: Math.round(revenue * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      margin: subRates.length > 0 ? Math.round((revenue - cost) * 100) / 100 : null,
    },
    missingCustomerRates,
    missingSubRates,
  };
}

/**
 * Crews that have a rate card on file, for seeding a job's budget from one.
 *
 * Only company and id cross over — this is a picker, not a window into another
 * crew's file.
 */
export interface ProjectCrew {
  id: string;
  company: string;
  lead: string;
  phone: string;
  state: Subcontractor["state"];
  trades: string[];
  /** Dailies this crew has filed on this job, and how many are still waiting. */
  dailies: number;
  pending: number;
  /** Whether they hold a rate card — a crew without one cannot be paid. */
  hasRates: boolean;
}

/**
 * The crews assigned to one job.
 *
 * The office needs this on the project page rather than by cross-referencing
 * the subcontractor list: when a daily comes in wrong, the first question is
 * always who is actually on this job, and the second is whether they can be
 * paid for it. Staff-only — a crew has no business reading the roster of who
 * else is on the job.
 */
export async function getProjectCrews(projectId: string): Promise<ProjectCrew[]> {
  await requireStaff();
  const rows = await prisma.subcontractor.findMany({
    where: { projects: { some: { id: projectId } } },
    select: {
      id: true,
      company: true,
      lead: true,
      phone: true,
      state: true,
      trades: true,
      _count: { select: { rates: true } },
    },
    orderBy: { company: "asc" },
  });

  // Dailies name their crew as text, not by id, so count by company name.
  const counts = await prisma.daily.groupBy({
    by: ["subcontractor", "status"],
    where: { projectId, subcontractor: { in: rows.map((r) => r.company) } },
    _count: { _all: true },
  });

  return rows.map((r) => {
    const mine = counts.filter((c) => c.subcontractor === r.company);
    return {
      id: r.id,
      company: r.company,
      lead: r.lead,
      phone: r.phone,
      state: SUBSTATE_LABEL[r.state] ?? "Pending review",
      trades: r.trades,
      dailies: mine.reduce((s, c) => s + c._count._all, 0),
      pending: mine
        .filter((c) => c.status !== "Approved" && c.status !== "Denied")
        .reduce((s, c) => s + c._count._all, 0),
      hasRates: r._count.rates > 0,
    };
  });
}

export async function getRatedCrews(): Promise<{ id: string; company: string }[]> {
  await requireStaff();
  const rows = await prisma.subcontractor.findMany({
    where: { rates: { some: {} } },
    select: { id: true, company: true },
    orderBy: { company: "asc" },
  });
  return rows;
}

/* ------------------------------------------------------------------ *
 * Schedule — where a job stands against its deadline.
 * ------------------------------------------------------------------ */

export interface ProjectSchedule extends SchedulePosition {
  /** Codes counted as route: plow and bore only. */
  linearCodes: number;
  /** Feet on the list that are real work but do not advance the route. */
  nonLinearCodes: number;
}

/**
 * Progress measured in route feet, against the contract date.
 *
 * Only plow and bore count. Pedestals, ground rods, warning signs and ant
 * control are all billable and none of them move the route forward, so a day
 * spent setting peds would otherwise read as a day of production. Microfiber
 * and pull-in-duct are excluded for the same reason from the other direction:
 * they bill by the foot down ground already opened, and counting them makes a
 * job look nearly twice as far along as it is.
 *
 * Completion comes from the dailies, not from anyone's estimate — and pace is
 * measured over days a daily was actually filed, so a crew that has not been
 * released reads as "not started" rather than as failing at 0 ft/day.
 */
export async function getProjectSchedule(projectId: string): Promise<ProjectSchedule> {
  await viewer();
  await assertProjectAccess(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      deadline: true,
      completedAt: true,
      materials: {
        where: { inScope: true },
        select: { code: true, planned: true },
      },
    },
  });

  const empty: ProjectSchedule = {
    ...schedulePosition({ plannedFt: 0, completedFt: 0, deadline: null, workDates: [] }),
    linearCodes: 0,
    nonLinearCodes: 0,
  };
  if (!project) return empty;

  let plannedFt = 0;
  let linearCodes = 0;
  let nonLinearCodes = 0;
  for (const m of project.materials) {
    if (!m.code || m.planned <= 0) continue;
    if (isLinearFootageCode(m.code)) {
      plannedFt += m.planned;
      linearCodes++;
    } else {
      nonLinearCodes++;
    }
  }

  // Completion from what has actually been reported, by the same rule.
  const dailies = await prisma.daily.findMany({
    where: { projectId },
    select: { workDate: true, lineItems: true, status: true },
  });

  let completedFt = 0;
  const workDates = new Set<string>();
  for (const d of dailies) {
    // Denied work is not production. Everything else has been reported by the
    // crew and is progress on the ground whether or not the paperwork is
    // approved yet.
    if (d.status === "Denied") continue;
    const items = Array.isArray(d.lineItems) ? (d.lineItems as unknown[]) : [];
    let dayFt = 0;
    for (const raw of items) {
      const li = raw as { code?: unknown; quantity?: unknown };
      if (typeof li?.code !== "string") continue;
      if (!isLinearFootageCode(li.code)) continue;
      dayFt += typeof li.quantity === "number" ? li.quantity : 0;
    }
    completedFt += dayFt;
    if (dayFt > 0 && d.workDate) workDates.add(d.workDate);
  }

  return {
    ...schedulePosition({
      plannedFt,
      // A finished job counts as its whole route built, whatever the dailies
      // add up to. Left as the filed footage, a completed job shows a health
      // ring at 0%, feet remaining against a plan nobody is working to, and a
      // required pace to finish work that is already finished.
      completedFt: project.completedAt ? plannedFt : completedFt,
      deadline: project.deadline || null,
      workDates: [...workDates],
    }),
    linearCodes,
    nonLinearCodes,
  };
}

/* ------------------------------------------------------------------ *
 * Yard badges.
 * ------------------------------------------------------------------ */

export interface CrewBadgeView {
  id: string;
  personName: string;
  phone: string;
  status: string;
  licenseExpires: string;
  reviewNote: string;
  reviewedBy: string;
  reviewedAt: string | null;
  documents: {
    id: string;
    kind: string;
    fileName: string;
    mediaType: string;
    sizeBytes: number;
    /** The image itself. Only ever sent to someone this query has cleared. */
    dataUrl: string;
    uploadedBy: string;
    createdAt: string;
  }[];
  readiness: ReturnType<typeof badgeReadiness>;
}

/**
 * Badges for one crew, with the identity images attached.
 *
 * `assertOwnSubcontractor` is the whole security boundary here: it lets staff
 * through and lets that crew see its own, and refuses everyone else. These rows
 * carry photographs of driving licences and Social Security cards, so a crew
 * reading another crew's badges would be considerably worse than reading their
 * rates.
 */
export async function getCrewBadges(subcontractorId: string): Promise<CrewBadgeView[]> {
  await assertOwnSubcontractor(subcontractorId);

  const rows = await prisma.crewBadge.findMany({
    where: { subcontractorId },
    orderBy: { createdAt: "asc" },
    include: { documents: { orderBy: { kind: "asc" } } },
  });

  return rows.map((b) => ({
    id: b.id,
    personName: b.personName,
    phone: b.phone,
    status: b.status,
    licenseExpires: b.licenseExpires,
    reviewNote: b.reviewNote,
    reviewedBy: b.reviewedBy,
    reviewedAt: b.reviewedAt?.toISOString().slice(0, 10) ?? null,
    documents: b.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      fileName: d.fileName,
      mediaType: d.mediaType,
      sizeBytes: d.sizeBytes,
      dataUrl: d.dataUrl,
      uploadedBy: d.uploadedBy,
      createdAt: d.createdAt.toISOString().slice(0, 10),
    })),
    readiness: badgeReadiness(b.documents, b.licenseExpires),
  }));
}

/**
 * Everyone waiting on a badge decision, for the office.
 *
 * Deliberately withholds the images — this is a work queue, and pulling every
 * licence photo into a list view would put them in memory and on the wire for
 * no reason. Open the crew to see the documents.
 */
export async function getPendingBadges(): Promise<
  { id: string; company: string; personName: string; status: string; since: string }[]
> {
  await requireStaff();
  const rows = await prisma.crewBadge.findMany({
    where: { status: "SUBMITTED" },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true, personName: true, status: true, updatedAt: true,
      subcontractor: { select: { company: true } },
    },
  });
  return rows.map((b) => ({
    id: b.id,
    company: b.subcontractor.company,
    personName: b.personName,
    status: b.status,
    since: b.updatedAt.toISOString().slice(0, 10),
  }));
}

/* ------------------------------------------------------------------ *
 * Crew pay statements.
 * ------------------------------------------------------------------ */

export interface SubInvoiceRow {
  id: string;
  number: string;
  company: string;
  subcontractorId: string;
  project: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  subtotal: number;
  issuedAt: string | null;
  acceptedAt: string | null;
  acceptedBy: string;
  disputeNote: string;
  disputedAt: string | null;
  disputedBy: string;
  resolutionNote: string;
  /** Settlement window in calendar days: 30 normally, 10 on fast pay. */
  termsDays: number;
  /** Calendar date this is due, derived from when it was issued. */
  dueDate: string;
  fastPay: boolean;
  /** The fee rate frozen at election. 0 when fast pay was never taken. */
  fastPayFeePct: number;
  fastPayElectedAt: string | null;
  fastPayElectedBy: string;
  /** ACH normally; wire when fast pay was taken. Never the crew's choice. */
  payMethod: string;
  /** What the fee comes to, and what actually lands in their account. */
  fee: number;
  net: number;
  /** Whether this statement can still be moved onto fast pay. */
  canElectFastPay: boolean;
  dailyCount: number;
  /** Every priced unit, so the crew can check the statement against their sheets. */
  lines: {
    id: string;
    dailyId: string;
    workDate: string;
    code: string;
    description: string;
    unit: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
}

function toSubInvoiceRow(r: {
  id: string; number: string; subcontractorId: string; projectName: string;
  periodStart: string; periodEnd: string; status: string; subtotal: number;
  issuedAt: Date | null; acceptedAt: Date | null; acceptedBy: string;
  termsDays: number; fastPay: boolean; fastPayFeePct: number;
  fastPayElectedAt: Date | null; fastPayElectedBy: string; payMethod: string;
  disputeNote: string; disputedAt: Date | null; disputedBy: string;
  resolutionNote: string;
  subcontractor: { company: string };
  lines: {
    id: string; dailyId: string; workDate: string; code: string;
    description: string; unit: string; quantity: number; rate: number; amount: number;
  }[];
}): SubInvoiceRow {
  // One place decides what a statement is worth, so the office view, the crew
  // view and any batch total all read the same number off the same rules.
  const money = amountPayable(r);
  return {
    id: r.id,
    number: r.number,
    company: r.subcontractor.company,
    subcontractorId: r.subcontractorId,
    project: r.projectName,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    status: r.status,
    subtotal: r.subtotal,
    // Minute precision on the acceptance: the date alone is not much of a
    // record, and the second is noise.
    issuedAt: r.issuedAt?.toISOString().slice(0, 10) ?? null,
    acceptedAt: r.acceptedAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
    acceptedBy: r.acceptedBy,
    disputeNote: r.disputeNote,
    disputedAt: r.disputedAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
    disputedBy: r.disputedBy,
    resolutionNote: r.resolutionNote,
    termsDays: r.termsDays,
    dueDate: dueDateFromCutoff(r.periodEnd, r.termsDays),
    fastPay: r.fastPay,
    fastPayFeePct: r.fastPayFeePct,
    fastPayElectedAt:
      r.fastPayElectedAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
    fastPayElectedBy: r.fastPayElectedBy,
    payMethod: r.payMethod,
    fee: money.fee,
    net: money.net,
    canElectFastPay: canElectFastPay(r.status, r.fastPay),
    dailyCount: new Set(r.lines.map((l) => l.dailyId).filter(Boolean)).size,
    lines: r.lines,
  };
}

const SUB_INVOICE_SELECT = {
  id: true, number: true, subcontractorId: true, projectName: true,
  periodStart: true, periodEnd: true, status: true, subtotal: true,
  issuedAt: true, acceptedAt: true, acceptedBy: true,
  termsDays: true, fastPay: true, fastPayFeePct: true,
  fastPayElectedAt: true, fastPayElectedBy: true, payMethod: true,
  disputeNote: true, disputedAt: true, disputedBy: true, resolutionNote: true,
  subcontractor: { select: { company: true } },
  lines: {
    orderBy: [{ workDate: "asc" as const }, { code: "asc" as const }],
    select: {
      id: true, dailyId: true, workDate: true, code: true,
      description: true, unit: true, quantity: true, rate: true, amount: true,
    },
  },
};

/**
 * A crew's own pay statements.
 *
 * Drafts are withheld: a statement still being built is not a figure anybody
 * should be reading, least of all the person being asked to agree to it. They
 * see it when it is sent.
 */
export async function getMySubInvoices(): Promise<SubInvoiceRow[]> {
  const user = await requireUser();
  if (!user.subcontractorId) return [];

  const rows = await prisma.subInvoice.findMany({
    where: {
      subcontractorId: user.subcontractorId,
      status: { in: ["ISSUED", "ACCEPTED", "DISPUTED", "PAID"] },
    },
    orderBy: [{ periodEnd: "desc" }, { number: "desc" }],
    select: SUB_INVOICE_SELECT,
  });
  return rows.map(toSubInvoiceRow);
}

/** Every crew's statements, for the office. */
export async function getSubInvoices(): Promise<SubInvoiceRow[]> {
  await requireStaff();
  const rows = await prisma.subInvoice.findMany({
    orderBy: [{ periodEnd: "desc" }, { number: "desc" }],
    select: SUB_INVOICE_SELECT,
  });
  return rows.map(toSubInvoiceRow);
}

/* ------------------------------------------------------------------ *
 * Tasks — work assigned to a person or a crew.
 * ------------------------------------------------------------------ */

export interface TaskRow {
  id: string;
  title: string;
  detail: string;
  status: string;
  priority: string;
  dueDate: string;
  statusNote: string;
  assigneeUserId: string | null;
  assigneeSubId: string | null;
  /** Whoever it is on, in one field for display. */
  assigneeName: string;
  assigneeKind: "employee" | "crew" | "unassigned";
  projectId: string | null;
  projectName: string;
  createdByEmail: string;
  completedAt: string | null;
  completedBy: string;
  createdAt: string;
  /** Past its due date and not finished. */
  overdue: boolean;
  /**
   * A thumbnail for the list, and how many there are.
   *
   * The problem shot leads where there is one — that is what somebody scanning
   * a list recognises a task by, faster than reading its title. Two small
   * fields on the row beat opening every task to find out whether it even has
   * a photograph.
   */
  previewUrl: string | null;
  photoCount: number;
  hasResolution: boolean;
}

const TASK_SELECT = {
  id: true, title: true, detail: true, status: true, priority: true,
  dueDate: true, statusNote: true, assigneeUserId: true, assigneeSubId: true,
  projectId: true, createdByEmail: true, completedAt: true, completedBy: true,
  createdAt: true,
  assigneeUser: { select: { name: true, email: true } },
  assigneeSub: { select: { company: true } },
  project: { select: { name: true } },
  // Just the URL and kind — the list needs one image, not every record.
  photos: { select: { url: true, kind: true }, orderBy: { createdAt: "asc" as const } },
};

function toTaskRow(t: {
  id: string; title: string; detail: string; status: string; priority: string;
  dueDate: string; statusNote: string; assigneeUserId: string | null;
  assigneeSubId: string | null; projectId: string | null; createdByEmail: string;
  completedAt: Date | null; completedBy: string; createdAt: Date;
  assigneeUser: { name: string; email: string } | null;
  assigneeSub: { company: string } | null;
  project: { name: string } | null;
  photos: { url: string; kind: string }[];
}): TaskRow {
  const today = new Date().toISOString().slice(0, 10);
  const done = t.status === "DONE" || t.status === "CANCELLED";
  return {
    id: t.id,
    title: t.title,
    detail: t.detail,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    statusNote: t.statusNote,
    assigneeUserId: t.assigneeUserId,
    assigneeSubId: t.assigneeSubId,
    assigneeName:
      t.assigneeUser?.name || t.assigneeUser?.email || t.assigneeSub?.company || "Unassigned",
    assigneeKind: t.assigneeUser ? "employee" : t.assigneeSub ? "crew" : "unassigned",
    projectId: t.projectId,
    projectName: t.project?.name ?? "",
    createdByEmail: t.createdByEmail,
    completedAt: t.completedAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
    completedBy: t.completedBy,
    createdAt: t.createdAt.toISOString().slice(0, 10),
    // A blank due date is not overdue; it simply has no date.
    overdue: Boolean(t.dueDate) && !done && t.dueDate < today,
    // The fault leads; only fall back to a resolution shot when there is no
    // photo of the problem, which usually means it was found and fixed at once.
    previewUrl: t.photos.find((p) => p.kind === "PROBLEM")?.url ?? t.photos[0]?.url ?? null,
    photoCount: t.photos.length,
    hasResolution: t.photos.some((p) => p.kind === "RESOLUTION"),
  };
}

/**
 * Tasks the viewer is allowed to see.
 *
 * Staff see everything. A crew sees only what is assigned to them — not their
 * own unassigned work, not another crew's, and nothing internal. A task is
 * often the first place somebody writes down why a crew is being chased, so
 * the scoping matters as much as it does on rates.
 */
export async function getTasks(): Promise<TaskRow[]> {
  const user = await requireUser();

  const where = isStaff(user.role)
    ? {}
    : user.subcontractorId
      ? { assigneeSubId: user.subcontractorId }
      : { id: "" };

  const rows = await prisma.task.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    select: TASK_SELECT,
  });
  return rows.map(toTaskRow);
}

/** Who a task can be put on. Staff only — it lists every employee and crew. */
export async function getTaskAssignees(): Promise<{
  employees: { id: string; name: string }[];
  crews: { id: string; company: string }[];
  projects: { id: string; name: string }[];
}> {
  await requireStaff();
  const [employees, crews, projects] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "SUBCONTRACTOR" } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.subcontractor.findMany({
      where: { state: { in: ["ACTIVE", "PENDING_REVIEW"] } },
      select: { id: true, company: true },
      orderBy: { company: "asc" },
    }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    employees: employees.map((e) => ({ id: e.id, name: e.name || e.email })),
    crews,
    projects,
  };
}

/* ------------------------------------------------------------------ *
 * Prospects — who we know, before they are on a job.
 * ------------------------------------------------------------------ */

const PROSPECT_KIND: Record<string, Prospect["kind"]> = {
  WORKER: "Worker",
  SUBCONTRACTOR: "Crew",
  PRIME: "Prime",
};

const PROSPECT_STAGE: Record<string, Prospect["stage"]> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFYING: "Qualifying",
  IN_DISCUSSION: "In discussion",
  WON: "Won",
  LOST: "Lost",
  DORMANT: "Dormant",
};

type ProspectRow = Awaited<
  ReturnType<typeof prisma.prospect.findMany<{ include: { activities: true } }>>
>[number];

function toProspect(r: ProspectRow): Prospect {
  return {
    id: r.id,
    kind: PROSPECT_KIND[r.kind] ?? "Crew",
    stage: PROSPECT_STAGE[r.stage] ?? "New",
    name: r.name,
    contactName: r.contactName,
    contactRole: r.contactRole,
    email: r.email,
    phone: r.phone,
    website: r.website,
    city: r.city,
    homeState: r.homeState,
    states: r.states,
    markets: r.markets,
    trades: r.trades,
    crewSize: r.crewSize,
    equipment: r.equipment,
    rating: r.rating,
    source: r.source,
    notes: r.notes,
    nextStep: r.nextStep,
    nextStepDue: r.nextStepDue,
    lastContact: r.lastContact,
    owner: r.owner,
    convertedSubcontractorId: r.convertedSubcontractorId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    activities: r.activities
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        body: a.body,
        author: a.author,
        createdAt: a.createdAt.toISOString(),
      })),
  };
}

/**
 * The whole pipeline.
 *
 * Ordered by what needs doing rather than by name: anything with a next step
 * that has come due floats up, then the rest by most recently touched. A CRM
 * sorted alphabetically is a filing cabinet, not a work queue.
 */
export async function getProspects(): Promise<Prospect[]> {
  await requireStaff();
  const rows = await prisma.prospect.findMany({
    include: { activities: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toProspect);
}

export interface ProspectSummary {
  total: number;
  byKind: { kind: Prospect["kind"]; count: number }[];
  /** Open means not yet Won, Lost or Dormant — the ones still in play. */
  open: number;
  won: number;
  /** Next steps whose due date has passed. The actual to-do list. */
  overdue: number;
  /** States and markets we have anybody in, most-covered first. */
  states: { name: string; count: number }[];
  markets: { name: string; count: number }[];
}

export async function getProspectSummary(): Promise<ProspectSummary> {
  await requireStaff();
  const rows = await prisma.prospect.findMany({
    select: {
      kind: true,
      stage: true,
      homeState: true,
      states: true,
      markets: true,
      nextStep: true,
      nextStepDue: true,
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const tally = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) {
      const k = x.trim();
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };

  const kinds: Prospect["kind"][] = ["Worker", "Crew", "Prime"];
  return {
    total: rows.length,
    byKind: kinds.map((kind) => ({
      kind,
      count: rows.filter((r) => (PROSPECT_KIND[r.kind] ?? "Crew") === kind).length,
    })),
    open: rows.filter((r) => !["WON", "LOST", "DORMANT"].includes(r.stage)).length,
    won: rows.filter((r) => r.stage === "WON").length,
    // A next step with no date is not overdue — it is unscheduled, which is a
    // different problem and not one to cry wolf about.
    overdue: rows.filter((r) => r.nextStep && r.nextStepDue && r.nextStepDue < today).length,
    states: tally(rows.flatMap((r) => [r.homeState, ...r.states])),
    markets: tally(rows.flatMap((r) => r.markets)),
  };
}

/* ------------------------------------------------------------------ *
 * Locates — 811 tickets and the clock on them.
 * ------------------------------------------------------------------ */

export interface LocateResponseRow {
  id: string;
  member: string;
  code: string;
  facilityType: string;
  status: string;
  respondedOn: string;
  note: string;
}

export interface LocateTicketRow {
  id: string;
  number: string;
  revision: string;
  projectId: string | null;
  projectName: string;
  street: string;
  crossStreet: string;
  city: string;
  county: string;
  workType: string;
  /** NORMAL, CANCEL, UPDATE — a cancel withdraws a locate rather than being one. */
  ticketType: string;
  calledInOn: string;
  responseBy: string;
  updateableOn: string;
  lat: number | null;
  lng: number | null;
  locateInstructions: string;
  workToBeginOn: string;
  updateBy: string;
  expiresOn: string;
  closedOn: string;
  notes: string;
  /** Worked out from the dates, never stored — see src/lib/locates.ts. */
  standing: LocateStanding;
  standingLabel: string;
  daysToExpiry: number | null;
  /** True when the dates came off the ticket rather than being computed. */
  datesStated: boolean;
  /** Whether a crew may dig on it today, and why. */
  dig: { ok: boolean; because: string };
  responses: LocateResponseRow[];
  /** Members still silent. Silence is not clearance. */
  awaiting: string[];
}

const LOCATE_SELECT = {
  id: true, number: true, revision: true, projectId: true,
  street: true, crossStreet: true, city: true, county: true, workType: true,
  calledInOn: true, workToBeginOn: true, updateBy: true, expiresOn: true,
  ticketType: true, responseBy: true, updateableOn: true,
  lat: true, lng: true, locateInstructions: true,
  closedOn: true, notes: true,
  project: { select: { name: true } },
  responses: {
    orderBy: { member: "asc" as const },
    select: { id: true, member: true, code: true, facilityType: true, status: true, respondedOn: true, note: true },
  },
} as const;

/**
 * Every locate ticket, with the clock worked out as of today.
 *
 * Standing is derived on read rather than stored, so a ticket cannot sit in
 * the database claiming to be in force three weeks after it expired. The only
 * way a stored status stays true is if something remembers to change it, and
 * nothing ever does.
 */
export async function getLocateTickets(): Promise<LocateTicketRow[]> {
  await requireStaff();
  const rows = await prisma.locateTicket.findMany({
    orderBy: [{ expiresOn: "asc" }, { number: "asc" }],
    select: LOCATE_SELECT,
  });

  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const standing = ticketStanding(r, today);
    return {
      id: r.id,
      number: r.number,
      revision: r.revision,
      projectId: r.projectId,
      projectName: r.project?.name?.trim() ?? "",
      street: r.street,
      crossStreet: r.crossStreet,
      city: r.city,
      county: r.county,
      workType: r.workType,
      ticketType: r.ticketType,
      calledInOn: r.calledInOn,
      responseBy: r.responseBy,
      updateableOn: r.updateableOn,
      lat: r.lat,
      lng: r.lng,
      locateInstructions: r.locateInstructions,
      workToBeginOn: r.workToBeginOn,
      updateBy: standing.updateBy,
      expiresOn: standing.expiresOn,
      closedOn: r.closedOn,
      notes: r.notes,
      standing: standing.standing,
      standingLabel: STANDING_LABEL[standing.standing],
      daysToExpiry: standing.daysToExpiry,
      datesStated: standing.stated.expiry,
      dig: canDig(standing, r.responses),
      responses: r.responses.map((x) => ({
        id: x.id, member: x.member, code: x.code, facilityType: x.facilityType, status: x.status,
        respondedOn: x.respondedOn, note: x.note,
      })),
      awaiting: r.responses
        .filter((x) => x.status === "UNKNOWN" || x.status === "NOT_COMPLETE")
        .map((x) => x.member),
    };
  });
}

export interface LocateSummary {
  total: number;
  active: number;
  due: number;
  expired: number;
  unknown: number;
  /** Tickets whose members have not all answered. */
  awaitingResponses: number;
}

export async function getLocateSummary(): Promise<LocateSummary> {
  const tickets = await getLocateTickets();
  const open = tickets.filter((t) => !t.closedOn);
  return {
    total: open.length,
    active: open.filter((t) => t.standing === "active").length,
    due: open.filter((t) => t.standing === "due").length,
    expired: open.filter((t) => t.standing === "expired").length,
    unknown: open.filter((t) => t.standing === "unknown").length,
    awaitingResponses: open.filter((t) => t.awaiting.length > 0).length,
  };
}


/**
 * The unit codes a crew can actually bill on this job.
 *
 * Read off the customer's own rate card, narrowed to the underground families
 * this work uses, because the full card runs to thousands of rows and a picker
 * nobody can find anything in gets typed over.
 *
 * The point is not convenience. A code typed by hand does not have to match the
 * card, and when it does not the line prices at nothing — a day that bored 210
 * ft and placed 1,162 ft of microduct billed $395 because BFOV12.7(2W) is not
 * a code and BFOV(12.7)(2W)12"DEPTH is. Offering the real strings is what stops
 * that happening again.
 */
export async function getBillableCodes(
  projectId: string,
): Promise<{ code: string; description: string }[]> {
  // The crew filling out their own sheet needs this list more than anyone —
  // they are the ones typing codes in a truck. Guarded by project access, not
  // by staff, or the picker would be empty for exactly the people it is for.
  await assertProjectAccess(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { customerId: true },
  });
  if (!project?.customerId) return [];

  // No rate is selected. The picker only has to name the code correctly, and a
  // rate on an <option> ends up in the collapsed select, which is what the
  // browser prints onto the sheet Globe receives. Nobody is sent the number.
  const rows = await prisma.customerRate.findMany({
    where: { customerId: project.customerId },
    select: { code: true, description: true },
    orderBy: { code: "asc" },
  });

  // The work we actually sell, not everything the card can price. A crew
  // scrolling 2,472 codes picks the wrong one, and the wrong one still prices,
  // so nothing downstream catches it. See MAIN_BILLABLE_CODES to add a code.
  const seen = new Set<string>();
  return rows
    .filter((r) => isMainBillableCode(r.code))
    .filter((r) => {
      const k = normalizeCode(r.code);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((r) => ({ code: r.code, description: r.description }));
}
