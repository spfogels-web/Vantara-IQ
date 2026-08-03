import { Suspense } from "react";

import {
  getBrief,
  getCrews,
  getDeadlines,
  getHealthSummary,
  getKpis,
  getMissingDocuments,
  getNotifications,
  getProductionSummary,
  getProductionSplit,
  getPortfolioSummary,
  getProjectsRequiringAttention,
  getRevenueSummary,
} from "@/data/queries";

import { PageHeader } from "@/components/dashboard/page-header";
import { getCurrentUser } from "@/lib/auth";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { ProjectHealth } from "@/components/dashboard/project-health";
import { AiBrief } from "@/components/dashboard/ai-brief";
import { ProjectsTable } from "@/components/dashboard/projects-table";
import { ProductionChart } from "@/components/dashboard/production-chart";
import { ProductionSplitPanel } from "@/components/dashboard/production-split";
import { RevenueCards } from "@/components/dashboard/revenue-cards";
import { CrewAvailability } from "@/components/dashboard/crew-availability";
import { UpcomingDeadlines } from "@/components/dashboard/upcoming-deadlines";
import { MissingDocuments } from "@/components/dashboard/missing-documents";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { StatusBar } from "@/components/dashboard/status-bar";
import {
  AiBriefSkeleton,
  KpiRowSkeleton,
  ListPanelSkeleton,
  ProductionChartSkeleton,
  ProjectHealthSkeleton,
  ProjectsTableSkeleton,
  RevenueCardsSkeleton,
} from "@/components/common/skeletons";

/**
 * Rendered per request so every visit streams through the Suspense boundaries
 * below. Each section resolves independently — a slow query on one panel never
 * holds up the rest of the page.
 */
export const dynamic = "force-dynamic";

async function KpiSection() {
  const kpis = await getKpis();
  return <KpiRow kpis={kpis} />;
}

async function ProjectsSection() {
  const projects = await getProjectsRequiringAttention();
  return <ProjectsTable projects={projects} />;
}

async function BriefSection() {
  const brief = await getBrief();
  return <AiBrief items={brief} />;
}

async function ProductionSplitSection() {
  const split = await getProductionSplit(7);
  return <ProductionSplitPanel split={split} />;
}

async function ProductionSection() {
  const summary = await getProductionSummary();
  return <ProductionChart summary={summary} />;
}

async function HealthSection() {
  const summary = await getHealthSummary();
  return <ProjectHealth summary={summary} />;
}

async function RevenueSection() {
  const summary = await getRevenueSummary();
  return <RevenueCards summary={summary} />;
}

async function CrewSection() {
  const crews = await getCrews();
  return <CrewAvailability crews={crews} />;
}

async function DeadlinesSection() {
  const deadlines = await getDeadlines();
  return <UpcomingDeadlines deadlines={deadlines} />;
}

async function DocumentsSection() {
  const documents = await getMissingDocuments();
  return <MissingDocuments documents={documents} />;
}

async function ActivitySection() {
  const notifications = await getNotifications();
  return <NotificationsPanel notifications={notifications} />;
}

export default async function OperationsCenterPage() {
  const [currentUser, portfolioSummary] = await Promise.all([
    getCurrentUser(),
    getPortfolioSummary(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <PageHeader name={currentUser?.name} summary={portfolioSummary} />

      {/* 12-column rhythm: an 8/4 split for the primary rows, 4/4/4 to close.
          Everything collapses to a single column below xl. */}
      <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <Suspense fallback={<KpiRowSkeleton />}>
            <KpiSection />
          </Suspense>
        </div>

        <div className="xl:col-span-8">
          <Suspense fallback={<ProjectsTableSkeleton />}>
            <ProjectsSection />
          </Suspense>
        </div>
        <div className="xl:col-span-4">
          <Suspense fallback={<AiBriefSkeleton />}>
            <BriefSection />
          </Suspense>
        </div>

        <div className="xl:col-span-8">
          <Suspense fallback={<ProductionChartSkeleton />}>
            <ProductionSplitSection />
          </Suspense>
        </div>
        <div className="xl:col-span-4">
          <Suspense fallback={<ListPanelSkeleton />}>
            <ProductionSection />
          </Suspense>
        </div>
        <div className="xl:col-span-4">
          <Suspense fallback={<ProjectHealthSkeleton />}>
            <HealthSection />
          </Suspense>
        </div>

        <div className="xl:col-span-8">
          <Suspense fallback={<RevenueCardsSkeleton />}>
            <RevenueSection />
          </Suspense>
        </div>
        <div className="xl:col-span-4">
          <Suspense fallback={<ListPanelSkeleton rows={7} />}>
            <CrewSection />
          </Suspense>
        </div>

        <div className="xl:col-span-4">
          <Suspense fallback={<ListPanelSkeleton rows={5} />}>
            <DeadlinesSection />
          </Suspense>
        </div>
        <div className="xl:col-span-4">
          <Suspense fallback={<ListPanelSkeleton rows={4} />}>
            <DocumentsSection />
          </Suspense>
        </div>
        <div className="xl:col-span-4">
          <Suspense fallback={<ListPanelSkeleton rows={6} />}>
            <ActivitySection />
          </Suspense>
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
