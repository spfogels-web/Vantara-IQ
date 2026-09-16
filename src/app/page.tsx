import { Suspense } from "react";

import {
  getBrief,
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
  getTasks,
} from "@/data/queries";

import { PageHeader } from "@/components/dashboard/page-header";
import { redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth";
import { MarketingHome } from "@/components/marketing/marketing-home";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { ProjectHealth } from "@/components/dashboard/project-health";
import { AiBrief } from "@/components/dashboard/ai-brief";
import { OpsAssistant } from "@/components/dashboard/ops-assistant";
import { canUseOpsAssistant } from "@/app/actions";
import { ProjectsTable } from "@/components/dashboard/projects-table";
import { ProductionChart } from "@/components/dashboard/production-chart";
import { ProductionSplitPanel } from "@/components/dashboard/production-split";
import { RevenueCards } from "@/components/dashboard/revenue-cards";
import { OpenTasks } from "@/components/dashboard/open-tasks";
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

async function AssistantSection() {
  return (await canUseOpsAssistant()) ? <OpsAssistant /> : null;
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

async function TaskSection() {
  const tasks = await getTasks();
  return <OpenTasks tasks={tasks} />;
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

/**
 * Title and description follow whoever is asking, for the same reason the page
 * does.
 *
 * The layout default is "Operations Center · Vantara IQ", which is right for
 * the dashboard and wrong for the front door — a stranger's browser tab, a
 * shared link and a search result would all have announced the inside of a
 * product they have not bought.
 */
export async function generateMetadata() {
  const user = await getCurrentUser();
  if (user) return {};
  // Written for the search that a contractor actually types, without
  // stuffing the visible copy: the words below appear in the page itself
  // because they describe the product, not because they are keywords.
  const title = "Vantara IQ — the operating system for infrastructure construction";
  const description =
    "Construction operations software for telecom, fibre, power, gas, water and civil contractors. " +
    "Digital dailies, redlines and as-builts, 811 locate management, material custody, subcontractor " +
    "management and pay, automated billing and project margin — connected in one platform.";

  return {
    title,
    description,
    keywords: [
      "infrastructure construction software",
      "telecom construction management software",
      "fiber construction management",
      "underground utility construction software",
      "aerial fiber construction software",
      "fiber daily reporting software",
      "construction redline software",
      "811 locate management software",
      "subcontractor management software",
      "utility construction management",
      "FTTH construction software",
      "broadband construction management",
    ],
    alternates: { canonical: "https://www.vantaraiq.com/" },
    openGraph: {
      title,
      description,
      url: "https://www.vantaraiq.com/",
      siteName: "Vantara IQ",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * The root, which is two pages depending on who is asking.
 *
 * A stranger gets the marketing site: until now they got a sign-in form,
 * which tells somebody evaluating the product nothing at all. Anyone signed
 * in still lands on the Operations Center exactly as before.
 *
 * The check happens before any of the dashboard queries, so a visitor with
 * no account never causes a portfolio summary to be computed.
 */
export default async function OperationsCenterPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) return <MarketingHome />;

  // A crew has no Operations Center. The middleware sends them to their
  // dailies everywhere else; the root is public now, so it has to say so
  // here too or a foreman signing in lands on the office dashboard.
  if (!isStaff(currentUser.role)) redirect("/dailies");

  const portfolioSummary = await getPortfolioSummary();

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

        {/* Directly under the numbers, because it is the thing that explains
            them. One account only — it sees every rate, every crew’s pay and
            the whole money position at once. */}
        <div className="xl:col-span-12">
          <Suspense fallback={null}>
            <AssistantSection />
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
            <TaskSection />
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
