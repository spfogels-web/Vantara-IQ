import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Calendar, ClipboardList } from "lucide-react";

import {
  getCustomers,
  getDailies,
  getProject,
  getProjectMaterialImports,
  getProjectMaterials,
  getProjectValuation,
} from "@/data/queries";
import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import {
  formatFeet,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { ProjectCover } from "@/components/projects/project-cover";
import { ProjectValue } from "@/components/projects/project-value";
import { getCurrentUser, isStaff } from "@/lib/auth";
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  const staff = !!me && isStaff(me.role);

  const [project, dailies] = await Promise.all([getProject(id), getDailies()]);

  // getProject already returns undefined for a project this viewer isn't
  // assigned to, so an unassigned crew gets a 404 rather than a map.
  if (!project) notFound();

  // The customer record carries what Fortitude bills the GC. Staff only — a
  // subcontractor has no business reading the margin on their own work.
  const customers = staff ? await getCustomers() : [];

  // The valuation is staff-only and throws for a crew by design, so don't ask.
  const [materialImports, trackedMaterials, valuation] = await Promise.all([
    getProjectMaterialImports(project.id, project.name),
    getProjectMaterials(project.id),
    staff ? getProjectValuation(project.id) : Promise.resolve(null),
  ]);

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
          photoUrl={project.photoUrl}
          mapUrl={project.mapUrl}
          className="h-56 rounded-2xl border border-border/60 sm:h-72"
        />
      </div>

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
          is the one thing on this page that genuinely needs the room. */}
      <div className="mb-3">
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
    </PageShell>
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
