import "server-only";

import { prisma } from "@/lib/prisma";
import {
  brief,
  crews,
  deadlines,
  healthSummary,
  invoices,
  kpis,
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
const LATENCY: Record<string, number> = {
  kpis: 180,
  health: 320,
  brief: 520,
  production: 620,
  revenue: 480,
  crews: 560,
  deadlines: 300,
  documents: 380,
  notifications: 240,
};

function delay(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  };
}

const SUBSTATE_LABEL: Record<string, Subcontractor["state"]> = {
  ACTIVE: "Active",
  ONBOARDING: "Onboarding",
  PENDING_REVIEW: "Pending review",
  INVITED: "Invited",
  INACTIVE: "Inactive",
};

type SubRow = Awaited<ReturnType<typeof prisma.subcontractor.findMany>>[number];

function toSubcontractor(r: SubRow): Subcontractor {
  return {
    id: r.id,
    company: r.company,
    lead: r.lead,
    email: r.email,
    phone: r.phone,
    location: r.location,
    trades: r.trades,
    state: SUBSTATE_LABEL[r.state] ?? "Pending review",
    tone: r.tone as Tone,
    assignedProjects: r.assignedProjects,
    compliance: (r.compliance as unknown as Subcontractor["compliance"]) ?? [],
    complianceTone: r.complianceTone as Tone,
    scorecard: (r.scorecard as unknown as SubScorecard) ?? emptyScorecard,
    crewSize: r.crewSize,
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

function toDaily(r: DailyRow): DailyReport {
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
    billableAmount: r.billableAmount,
    lineItems: (r.lineItems as unknown as DailyLineItem[]) ?? [],
    photos: r.photos,
    hasAsBuilt: r.hasAsBuilt,
    hasBoreLog: r.hasBoreLog,
    flags: (r.flags as unknown as DailyFlag[]) ?? [],
  };
}

/* -- Organization (fixture) ------------------------------------------------- */

export async function getOrganization(): Promise<Organization> {
  return organization;
}

/* -- Dashboard aggregates (fixtures for now) -------------------------------- */

export async function getKpis(): Promise<Kpi[]> {
  await delay(LATENCY.kpis);
  return kpis;
}

export async function getHealthSummary(): Promise<HealthSummary> {
  await delay(LATENCY.health);
  return healthSummary;
}

export async function getBrief(): Promise<BriefItem[]> {
  await delay(LATENCY.brief);
  return brief;
}

export async function getProductionSummary(): Promise<ProductionSummary> {
  await delay(LATENCY.production);
  return productionSummary;
}

export async function getRevenueSummary(): Promise<RevenueSummary> {
  await delay(LATENCY.revenue);
  return revenueSummary;
}

export async function getCrews(): Promise<Crew[]> {
  await delay(LATENCY.crews);
  return crews;
}

export async function getDeadlines(): Promise<Deadline[]> {
  await delay(LATENCY.deadlines);
  return deadlines;
}

export async function getMissingDocuments(): Promise<MissingDocument[]> {
  await delay(LATENCY.documents);
  return missingDocuments;
}

export async function getNotifications(): Promise<AppNotification[]> {
  await delay(LATENCY.notifications);
  return notifications;
}

/* -- Entities (Postgres) ---------------------------------------------------- */

export async function getCustomers(): Promise<Customer[]> {
  const rows = await prisma.customer.findMany({
    include: { _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => toCustomer(r, r._count.projects));
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  const r = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { projects: true } } },
  });
  return r ? toCustomer(r, r._count.projects) : undefined;
}

/** Every project, worst-health first — the directory doubles as a triage queue. */
export async function getProjects(): Promise<Project[]> {
  const rows = await prisma.project.findMany({ orderBy: { health: "asc" } });
  return rows.map(toProject);
}

/** Sorted worst-first — the dashboard table is an attention queue. */
export async function getProjectsRequiringAttention(): Promise<Project[]> {
  return getProjects();
}

export async function getProject(id: string): Promise<Project | undefined> {
  const r = await prisma.project.findUnique({ where: { id } });
  return r ? toProject(r) : undefined;
}

export async function getSubcontractors(): Promise<Subcontractor[]> {
  const rows = await prisma.subcontractor.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toSubcontractor);
}

export async function getDailies(): Promise<DailyReport[]> {
  const rows = await prisma.daily.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toDaily);
}

/* -- Materials / billing / pay / reports (fixtures for now) ----------------- */

export async function getMaterials(): Promise<Material[]> {
  await delay(LATENCY.production);
  return materials;
}

export async function getInvoices(): Promise<Invoice[]> {
  await delay(LATENCY.revenue);
  return invoices;
}

export async function getPayApplications(): Promise<PayApplication[]> {
  await delay(LATENCY.revenue);
  return payApplications;
}

export async function getReportDefinitions(): Promise<ReportDefinition[]> {
  await delay(LATENCY.brief);
  return reportDefinitions;
}
