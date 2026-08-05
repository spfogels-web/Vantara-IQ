import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Calendar, ClipboardList } from "lucide-react";

import {
  getCustomers,
  getDailies,
  getProject,
  getProjectMaterialImports,
  getProjectMaterials,
  getProjectMaps,
  getProjectPhotos,
  getProjectValuation,
  getProjectWorkOrders,
} from "@/data/queries";
import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import {
  formatFeet,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { ProjectCover } from "@/components/projects/project-cover";
import { ProjectPhotos } from "@/components/projects/project-photos";
import { ProjectValue } from "@/components/projects/project-value";
import { canManagePhotos, getCurrentUser, isStaff } from "@/lib/auth";
import type { ProjectMapRef, ProjectPhoto } from "@/lib/types";
import { PageShell } from "@/components/common/page-shell";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { HealthRing } from "@/components/common/health-ring";
import { StatusPill } from "@/components/common/status-pill";
import { Meter } from "@/components/common/metric";
import { ProjectHeaderActions, ProjectMapPanel } from "@/components/projects/project-detail-client";
import { ProjectMaterials } from "@/components/projects/project-materials";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; upload?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab, upload } = await searchParams;
  const me = await getCurrentUser();
  const staff = !!me && isStaff(me.role);
  const canPhotos = !!me && canManagePhotos(me.role);

  // The tab lives in the URL rather than in client state, so "Photos" on a card
  // is a link straight to it and the back button does what it should.
  const tab = rawTab === "photos" ? "photos" : "overview";

  const [project, dailies] = await Promise.all([getProject(id), getDailies()]);

  // getProject already returns undefined for a project this viewer isn't
  // assigned to, so an unassigned crew gets a 404 rather than a map.
  if (!project) notFound();

  const onPhotos = tab === "photos";

  // The customer record carries what Fortitude bills the GC. Staff only — a
  // subcontractor has no business reading the margin on their own work.
  const customers = staff && !onPhotos ? await getCustomers() : [];

  // Each tab pays only for its own data. The valuation is staff-only and throws
  // for a crew by design, so don't ask.
  let materialImports: Awaited<ReturnType<typeof getProjectMaterialImports>> = [];
  let trackedMaterials: Awaited<ReturnType<typeof getProjectMaterials>> = [];
  let valuation: Awaited<ReturnType<typeof getProjectValuation>> | null = null;
  if (!onPhotos) {
    [materialImports, trackedMaterials, valuation] = await Promise.all([
      getProjectMaterialImports(project.id, project.name),
      getProjectMaterials(project.id),
      staff ? getProjectValuation(project.id) : Promise.resolve(null),
    ]);
  }

  let photos: ProjectPhoto[] = [];
  let maps: ProjectMapRef[] = [];
  let workOrders: string[] = [];
  if (onPhotos) {
    [photos, maps, workOrders] = await Promise.all([
      getProjectPhotos(project.id),
      getProjectMaps(project.id),
      getProjectWorkOrders(project.id),
    ]);
  }

  const daysToFinish = Math.ceil(project.remainingFt / Math.max(project.actualFtPerDay, 1));

  // Kept for the payment-terms panel; the money now comes from real rate cards.
  const customer = customers.find((c) => c.name === project.client);

  const totalFt = Math.round(project.remainingFt / (1 - project.pctComplete / 100));
  const installedFt = totalFt - project.remainingFt;

  const projectDailies = dailies.filter((d) => d.projectId === project.id);

  return (
    <PageShell
      eyebrow={`Project ${project.number}`}
      title={project.name}
      description={`${project.client} · ${project.location}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link
          href="/projects"
          className="focus-ring inline-flex items-center gap-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All projects
        </Link>
        <ProjectHeaderActions projectId={project.id} photoUrl={project.photoUrl} />
      </div>

      {/* The cover photo, where it belongs — this is the page you land on to
          orient yourself, and an aerial does that faster than any number. Drop
          a new one straight onto it, same as on the cards. */}
      <div className="mb-3">
        <ProjectCover
          projectId={project.id}
          projectNumber={project.number}
          cover={project.cover ?? null}
          photoCount={project.photoCount ?? 0}
          hasMap={!!project.mapUrl}
          canManage={canPhotos}
          variant="hero"
        />
      </div>

      {/* Tabs. Overview is everything that was already here; Photos is the
          project's visual record. */}
      <nav className="mb-3 flex items-center gap-1 border-b border-border/60">
        <TabLink href={`/projects/${project.id}`} active={tab === "overview"} label="Overview" />
        <TabLink
          href={`/projects/${project.id}?tab=photos`}
          active={onPhotos}
          label="Photos"
          count={project.photoCount ?? 0}
        />
      </nav>

      {onPhotos ? (
        <ProjectPhotos
          projectId={project.id}
          photos={photos}
          maps={maps}
          workOrders={workOrders}
          canManage={canPhotos}
          initialUploadOpen={upload === "1"}
        />
      ) : (
      <>
      {/* Status first: health, pace and progress read in one line before
          anything else on the page. */}
      <div className="mb-3">
          <Panel>
            <PanelBody className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-4">
                <HealthRing score={project.health} size={72} stroke={5} />
                <div>
                  <p className="eyebrow">Project health</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusPill label={project.status} tone={project.tone} />
                  </div>
                  <p className={cn("mt-1.5 text-[12.5px] font-medium", toneStyles[project.forecastTone].text)}>
                    Forecast: {project.forecast}
                  </p>
                </div>
              </div>

              <div className="ml-auto grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
                <KeyStat label="Complete" value={`${project.pctComplete}%`} />
                <KeyStat label="Remaining" value={formatFeet(project.remainingFt)} />
                <KeyStat label="Est. finish" value={`${daysToFinish} days`} />
                <KeyStat label="Actual pace" value={`${formatNumber(project.actualFtPerDay)} ft/day`} />
                <KeyStat label="Required pace" value={`${formatNumber(project.requiredFtPerDay)} ft/day`} />
                <KeyStat label="Crew" value={project.crew} />
              </div>
            </PanelBody>
            <div className="border-t border-border/70 px-4 py-3 sm:px-5">
              <div className="flex items-baseline justify-between text-[11.5px]">
                <span className="text-muted-foreground">Progress</span>
                <span className="num text-muted-foreground">
                  {formatFeet(installedFt)} of {formatFeet(totalFt)}
                </span>
              </div>
              <Meter value={project.pctComplete / 100} tone={project.tone} className="mt-1.5" />
            </div>
          </Panel>
      </div>

      {/* Six numbers in one strip. They read fine side by side, and giving
          them a column of their own was costing the map the width it needs. */}
      {/* What the job is worth, priced off the material list. This is the
          number to look at first — it lands the day the list does, before any
          production exists to measure. */}
      {staff && valuation ? (
        <div className="mb-3">
          <ProjectValue v={valuation} />
        </div>
      ) : null}

      {/* The map runs the full width — it's a plan drawing, and redlining it
          is the one thing on this page that genuinely needs the room. The id is
          what a card's "View map" action scrolls to. */}
      <div id="project-map" className="mb-3 scroll-mt-20">
        <ProjectMapPanel
          projectId={project.id}
          initialMapUrl={project.mapUrl}
          initialMarkups={project.markups}
        />
      </div>

      {/* Material gets the full width. It is the densest thing on the page —
          a job carries dozens of codes — and squeezing it into a sidebar
          column was what made every other panel stretch to match it. */}
      <div className="mb-3">
        <Panel>
          <PanelHeader
            title="Material on project"
            count={trackedMaterials.length}
            icon={<Boxes className="size-3.5" />}
            action="Materials"
            actionHref="/materials"
          />
          <ProjectMaterials
            projectId={project.id}
            imports={materialImports}
            tracked={trackedMaterials}
          />
        </Panel>
      </div>

      {/* Dailies and the customer close the page. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Panel>
            <PanelHeader
              title="Recent dailies"
              count={projectDailies.length}
              icon={<ClipboardList className="size-3.5" />}
              action="All dailies"
              actionHref="/dailies"
            />
            {projectDailies.length === 0 ? (
              <PanelBody className="py-8 text-center text-[12.5px] text-muted-foreground">
                No dailies submitted for this project yet.
              </PanelBody>
            ) : (
              <ul className="p-2">
                {projectDailies.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/dailies?sheet=${d.id}`}
                      className="focus-ring flex items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-foreground/[0.03]"
                    >
                      <span className="num shrink-0 text-[11px] text-muted-foreground">{d.workDate}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                        {d.subcontractor} · {d.crew}
                      </span>
                      <span className="num shrink-0 text-[12px] font-medium text-foreground">
                        {formatFeet(d.totalFt)}
                      </span>
                      <StatusPill label={d.status} tone={d.tone} className="shrink-0 text-[10px]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="xl:col-span-4">
          <Panel>
            <PanelHeader title="Customer" icon={<Calendar className="size-3.5" />} />
            <PanelBody className="flex flex-col gap-2.5">
              <p className="text-[14px] font-semibold text-foreground">{project.client}</p>
              {customer ? (
                <>
                  <Row label="Payment terms" value={customer.paymentTerms} />
                  <Row label="Retainage" value={formatPercent(customer.retainagePct)} />
                  <Row label="Avg days to pay" value={String(customer.avgDaysToPay)} />
                  <Link
                    href="/customers"
                    className="focus-ring mt-1 inline-flex items-center gap-1 rounded text-[12px] font-medium text-brand-bright hover:underline"
                  >
                    View customer →
                  </Link>
                </>
              ) : (
                <p className="text-[12px] text-muted-foreground">Customer record not linked.</p>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>
      </>
      )}
    </PageShell>
  );
}

/** One tab in the project's tab strip. A link, so the URL is the state. */
function TabLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors",
        active
          ? "border-brand text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {typeof count === "number" && count > 0 ? (
        <span className="num rounded-full bg-foreground/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function KeyStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="num mt-0.5 text-[14px] font-semibold text-foreground">{value}</p>
    </div>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-2 text-[12.5px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
