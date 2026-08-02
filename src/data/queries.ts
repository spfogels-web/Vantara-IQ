import "server-only";

import {
  brief,
  crews,
  deadlines,
  healthSummary,
  kpis,
  missingDocuments,
  notifications,
  organization,
  productionSummary,
  projects,
  revenueSummary,
} from "@/data/mock";
import type {
  AppNotification,
  BriefItem,
  Crew,
  Deadline,
  HealthSummary,
  Kpi,
  MissingDocument,
  Organization,
  ProductionSummary,
  Project,
  RevenueSummary,
} from "@/lib/types";

/**
 * The single seam between the UI and its data.
 *
 * Every function is async and returns plain data, so swapping the mock import
 * for a Prisma/Drizzle call or a fetch later is a one-line change per function
 * — no component touches a fixture directly.
 *
 * The staggered delays are deliberate: paired with the <Suspense> boundaries in
 * the dashboard they let each panel stream in behind its own skeleton, which is
 * exactly how the real thing will behave once queries are live.
 */
const LATENCY: Record<string, number> = {
  org: 0,
  kpis: 180,
  health: 320,
  brief: 520,
  projects: 400,
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

export async function getOrganization(): Promise<Organization> {
  await delay(LATENCY.org);
  return organization;
}

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

/** Sorted worst-first — the table is an attention queue, not a directory. */
export async function getProjectsRequiringAttention(): Promise<Project[]> {
  await delay(LATENCY.projects);
  return [...projects].sort((a, b) => a.health - b.health);
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
