import "server-only";

import { prisma } from "@/lib/prisma";
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
import { balanceOf, isPastDue } from "@/lib/billing";
import { schedulePosition, type SchedulePosition } from "@/lib/schedule";
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
  isPriorityCode,
  productionMethod,
  type ProductionMethod,
} from "@/lib/unit-codes";
import {
  brief,
  crews,
  deadlines,
  healthSummary,
  invoices,
  materials,
  missingDocuments,
  notifications,
  organization,
  payApplications,
  productionSummary,
  reportDefinitions,
  revenueSummary,
} from "@/data/mock";
import type {
  AppNotification,
  BriefItem,
  Crew,
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

type ProjectRow = Awaited<ReturnType<typeof prisma.project.findMany>>[number];

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    client: r.client,
    location: r.location,
    status: r.status as Project["status"],
    tone: r.tone as Tone,
    remainingFt: r.remainingFt,
    requiredFtPerDay: r.requiredFtPerDay,
    actualFtPerDay: r.actualFtPerDay,
    forecast: r.forecast,
    forecastTone: r.forecastTone as Tone,
    health: r.health,
    pctComplete: r.pctComplete,
    crew: r.crew,
    updatedAt: r.updatedAt,
    mapUrl: r.mapUrl,
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
};

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
    compliance: (r.compliance as unknown as Subcontractor["compliance"]) ?? [],
    complianceTone: r.complianceTone as Tone,
    scorecard: (r.scorecard as unknown as SubScorecard) ?? emptyScorecard,
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
  const [projects, dailies] = await Promise.all([
    prisma.project.findMany({ select: { tone: true, status: true } }),
    prisma.daily.findMany({
      select: {
        status: true,
        workDate: true,
        submittedAt: true,
        totalFt: true,
        billableAmount: true,
        lineItems: true,
      },
    }),
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

  const awaiting = dailies.filter(
    (d) => d.status === "Submitted" || d.status === "In review",
  ).length;
  const approved = dailies.filter((d) => d.status === "Approved");
  const readyToBill = approved.reduce((s, d) => s + d.billableAmount, 0);
  const atRisk = projects.filter((p) => p.tone === "critical" || p.tone === "warning").length;

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
      id: "revenue-ready",
      label: "Revenue ready to bill",
      value: readyToBill,
      format: "currency",
      delta: null,
      deltaLabel:
        readyToBill > 0
          ? `${approved.length} approved ${approved.length === 1 ? "daily" : "dailies"}`
          : "needs customer rates loaded",
      trend: "flat",
      tone: readyToBill > 0 ? "success" : "neutral",
      icon: "dollar",
      href: "/invoicing",
      series: flat(readyToBill),
    },
    {
      id: "approved-pay-apps",
      label: "Approved pay apps",
      value: 0,
      format: "currency",
      delta: null,
      deltaLabel: "no pay applications yet",
      trend: "flat",
      tone: "neutral",
      icon: "payapps",
      href: "/pay-applications",
      series: flat(0),
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

export async function getHealthSummary(): Promise<HealthSummary> {
  return healthSummary;
}

export async function getBrief(): Promise<BriefItem[]> {
  return brief;
}

export async function getProductionSummary(): Promise<ProductionSummary> {
  return productionSummary;
}

export async function getRevenueSummary(): Promise<RevenueSummary> {
  return revenueSummary;
}

export async function getCrews(): Promise<Crew[]> {
  return crews;
}

export async function getDeadlines(): Promise<Deadline[]> {
  return deadlines;
}

export async function getMissingDocuments(): Promise<MissingDocument[]> {
  return missingDocuments;
}

export async function getNotifications(): Promise<AppNotification[]> {
  return notifications;
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
  });
  return rows.map(toProject);
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

  const r = await prisma.project.findUnique({ where: { id } });
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
    include: { projects: { select: { id: true, name: true, number: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toSubcontractor);
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
async function priceDailies(
  rows: { customer: string; subcontractor: string; workDate: string; lineItems: unknown }[],
) {
  const customerNames = [...new Set(rows.map((r) => r.customer?.trim()).filter(Boolean))];
  const subNames = [...new Set(rows.map((r) => r.subcontractor?.trim()).filter(Boolean))];

  const rateSelect = {
    code: true, description: true, unit: true,
    rate: true, effectiveDate: true, expirationDate: true,
  } as const;

  const [customers, subs] = await Promise.all([
    customerNames.length
      ? prisma.customer.findMany({
          where: { name: { in: customerNames } },
          select: { name: true, rates: { select: rateSelect } },
        })
      : Promise.resolve([]),
    subNames.length
      ? prisma.subcontractor.findMany({
          where: { company: { in: subNames } },
          select: { company: true, rates: { select: rateSelect } },
        })
      : Promise.resolve([]),
  ]);

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

    const ours = customerRates.get(r.customer?.trim() ?? "") ?? [];
    const theirs = subRates.get(r.subcontractor?.trim() ?? "") ?? [];

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
    return rows.map((r, i) =>
      toDaily(r, {
        billableAmount: priced[i].subCost ?? 0,
        subCost: priced[i].subCost,
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

export async function getPayApplications(): Promise<PayApplication[]> {
  return payApplications;
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
  header: unknown;
  laborCodes: unknown;
  laborRows: unknown;
  matCodes: unknown;
  matRows: unknown;
  redlines: unknown;
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
  header: unknown;
  laborCodes: unknown;
  laborRows: unknown;
  matCodes: unknown;
  matRows: unknown;
  redlines: unknown;
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
          subcontractor: user.subcontractorName ?? " ",
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

  const customerRates = customer
    ? await prisma.customerRate.findMany({
        where: { customerId: customer.id },
        select: { code: true, description: true, unit: true, rate: true, effectiveDate: true, expirationDate: true },
      })
    : [];

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
  const crewCards = await prisma.subcontractorRate.findMany({
    where: { subcontractorId: { in: project.crews.map((c) => c.id) } },
    select: {
      subcontractorId: true, code: true, description: true,
      unit: true, rate: true, effectiveDate: true, expirationDate: true,
    },
  });

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
  phone: string; mobilePhone: string;
  emergencyContactName: string; emergencyContactPhone: string;
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

  const customerRates = customerId
    ? await prisma.customerRate.findMany({
        where: { customerId },
        select: { code: true, description: true, unit: true, rate: true, effectiveDate: true, expirationDate: true },
      })
    : [];

  // Same rule the valuation uses: cost at the one crew that has a card.
  const cards = await prisma.subcontractorRate.findMany({
    where: { subcontractorId: { in: project.crews.map((c) => c.id) } },
    select: {
      id: true, subcontractorId: true, code: true, description: true,
      unit: true, rate: true, effectiveDate: true, expirationDate: true,
    },
  });
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
      completedFt,
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
  disputeNote: string; disputedAt: Date | null; disputedBy: string;
  resolutionNote: string;
  subcontractor: { company: string };
  lines: {
    id: string; dailyId: string; workDate: string; code: string;
    description: string; unit: string; quantity: number; rate: number; amount: number;
  }[];
}): SubInvoiceRow {
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
    dailyCount: new Set(r.lines.map((l) => l.dailyId).filter(Boolean)).size,
    lines: r.lines,
  };
}

const SUB_INVOICE_SELECT = {
  id: true, number: true, subcontractorId: true, projectName: true,
  periodStart: true, periodEnd: true, status: true, subtotal: true,
  issuedAt: true, acceptedAt: true, acceptedBy: true,
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
