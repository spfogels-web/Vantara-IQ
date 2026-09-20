/**
 * One project, as a command page.
 *
 * This was a column of ten open panels, and reading it meant scrolling past a
 * 62-page plan drawing to find out who was on the job. The facts now live on
 * the closed rows and each section opens on demand, so the first screen
 * answers the questions somebody actually arrives with — is it on time, what
 * is it worth, can it be worked — and the detail is one click from there.
 *
 * Nothing below computes anything. Every component is the one the old page
 * used, moved; every figure is the one the server already returned. The
 * financial numbers in particular come from `getProjectValuation` and
 * `getProjectRates`, which resolve Customer → Market → Rate Card, and are not
 * re-derived here or in the browser.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Building2,
  ClipboardList,
  DollarSign,
  ExternalLink,
  HardHat,
  Images,
  Map as MapIcon,
  MapPin,
  Ruler,
  SquareGanttChart,
} from "lucide-react";

import {
  getCustomers,
  getDailies,
  getProject,
  getProjectMaterialImports,
  getProjectMaterials,
  getProjectPhotos,
  getProjectCrews,
  getProjectRates,
  getProjectSchedule,
  getRatedCrews,
  getProjectValuation,
} from "@/data/queries";
import { formatCompactCurrency, formatFeet, formatPercent } from "@/lib/format";
import { ProjectCover } from "@/components/projects/project-cover";
import { projectImageSrc } from "@/lib/project-image";
import { ProjectCrews } from "@/components/projects/project-crews";
import { ProjectValue } from "@/components/projects/project-value";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { PageShell } from "@/components/common/page-shell";
import { MessageButton } from "@/components/messages/message-button";
import { PanelBody } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { ProjectHeaderActions, ProjectMapPanel } from "@/components/projects/project-detail-client";
import { ProjectMaterials } from "@/components/projects/project-materials";
import { ProjectLocateRules } from "@/components/locates/project-locate-rules";
import { getProjectLocateRules, getProjectLocateSummary } from "@/data/locates-ops";
import { PreConstruction } from "@/components/projects/pre-construction";
import { ProjectPhotos } from "@/components/projects/project-photos";
import { ProjectSection, Summary } from "@/components/projects/project-section";
import { ProjectKpis } from "@/components/projects/project-kpis";
import { ProjectReadiness } from "@/components/projects/project-readiness";
import { listCustomerRateCards } from "@/app/actions";
import { CompleteToggle } from "@/components/projects/complete-toggle";
import { ProjectRatesPanel } from "@/components/projects/project-rates";
import { ProjectScheduleStrip } from "@/components/projects/project-schedule";

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
  const [locateRules, locateSummary] = await Promise.all([
    getProjectLocateRules(project.id),
    getProjectLocateSummary(project.id),
  ]);
  const [materialImports, trackedMaterials, valuation, photos, projectRates, ratedCrews, schedule, projectCrews, rateCards] = await Promise.all([
    getProjectMaterialImports(project.id, project.name),
    getProjectMaterials(project.id),
    staff ? getProjectValuation(project.id) : Promise.resolve(null),
    getProjectPhotos(project.id),
    staff ? getProjectRates(project.id) : Promise.resolve(null),
    staff ? getRatedCrews() : Promise.resolve([]),
    getProjectSchedule(project.id),
    staff ? getProjectCrews(project.id) : Promise.resolve([]),
    // Every card on file, so an unpriced job can be filled from one.
    staff ? listCustomerRateCards() : Promise.resolve([]),
  ]);

  // Kept for the payment-terms panel; the money now comes from real rate cards.
  const customer = customers.find((c) => c.name === project.client);

  const projectDailies = dailies.filter((d) => d.projectId === project.id);

  /**
   * The closed-row summaries, all of them read off the data above.
   *
   * None of these costs a query. A count that needed one would be a count
   * worth opening the section for instead.
   */
  const awaitingReview = projectDailies.filter(
    (d) => d.status === "Submitted" || d.status === "In review",
  ).length;
  const preConCount = photos.filter((p) => p.stage === "PRE_CONSTRUCTION").length;
  const videoCount = photos.filter((p) => p.kind === "VIDEO").length;
  const gpsCount = photos.filter((p) => p.lat != null && p.lng != null).length;
  const damageCount = photos.filter((p) => p.existingDamage).length;
  // Counted, not summed. The list carries feet and eaches and reels, and a
  // single total across those units would be a number that means nothing.
  const materialOutstanding = trackedMaterials.filter((m) => m.remaining > 0).length;

  return (
    <PageShell
      eyebrow={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="eyebrow">Project</span>
          <span className="num text-[17px] font-bold tracking-[-0.01em] text-foreground">
            {project.number}
          </span>
          {project.completedAt ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/45 bg-success/[0.12] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-success">
              Completed
            </span>
          ) : null}
        </span>
      }
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
        <div className="flex flex-wrap items-center gap-2">
          <CompleteToggle
            projectId={project.id}
            completedAt={project.completedAt}
            canEdit={staff}
          />
          {/* One thread per job, for everybody on it. */}
          {staff ? (
            <MessageButton
              projectId={project.id}
              title={project.name}
              label="Message project team"
              variant="solid"
            />
          ) : null}
          <ProjectHeaderActions projectId={project.id} photoUrl={project.photoUrl} />
        </div>
      </div>

      {/* The identity strip: the handful of facts that qualify every number
          further down. Anything the record does not carry is left out rather
          than shown as a blank label. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-foreground/[0.015] px-3.5 py-2.5">
        <Fact icon={<MapPin className="size-3.5" />} value={project.location} />
        {project.market ? <Fact icon={<MapIcon className="size-3.5" />} value={project.market} /> : null}
        <Fact icon={<Building2 className="size-3.5" />} value={project.client} />
        {project.crew ? <Fact icon={<HardHat className="size-3.5" />} value={project.crew} /> : null}
        {schedule.plannedFt > 0 ? (
          <Fact icon={<Ruler className="size-3.5" />} value={formatFeet(schedule.plannedFt)} />
        ) : null}

        {/* Progress reads as a figure and a bar, because "62%" and "how far
            along the bar" are two different reads and people do both. */}
        <div className="ml-auto flex min-w-[180px] items-center gap-2.5">
          <span className="eyebrow shrink-0 text-[10px]">Progress</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
            <span
              className="block h-full rounded-full bg-brand"
              style={{ width: `${Math.min(100, Math.round((schedule.pctComplete ?? 0) * 100))}%` }}
            />
          </span>
          <span className="num shrink-0 text-[12.5px] font-semibold text-foreground">
            {schedule.pctComplete != null ? formatPercent(schedule.pctComplete) : "—"}
          </span>
        </div>
      </div>

      {/* The cover, with what would stop a crew working laid over it. The
          coordinates the mockup shows are not on the record, so nothing here
          claims any: the address goes to Maps as the address. When a geocode
          lands later it replaces this overlay's contents and nothing else on
          the page has to move. */}
      <div className="relative mb-3">
        <ProjectCover
          projectId={project.id}
          projectNumber={project.number}
          photoUrl={project.photoUrl}
          mapUrl={project.mapUrl}
          // Full height only when there is actually an aerial to read. The
          // same helper the cover itself uses, so the two cannot disagree: a
          // PDF map is not a cover image, and 288px of empty frame at the top
          // of the page is the worst thing on it.
          className={
            projectImageSrc(project)
              ? "h-56 rounded-2xl border border-border/60 sm:h-72"
              : "h-32 rounded-2xl border border-border/60 sm:h-36"
          }
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 hidden justify-end p-3 sm:flex">
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <ProjectReadiness
              locates={staff ? locateSummary : null}
              preConStatus={project.preConStatus ?? "NOT_STARTED"}
              deadline={schedule.deadline}
              workingDaysLeft={schedule.workingDaysLeft}
            />
            {project.location ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location)}`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5 text-[11.5px] text-brand-bright backdrop-blur-md hover:underline"
              >
                <ExternalLink className="size-3" /> Open in Maps
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* What the job is worth, off the material list and the rate cards. */}
      {staff && valuation ? (
        <div className="mb-3">
          <ProjectKpis v={valuation} />
        </div>
      ) : null}

      {/* On a phone the readiness card would cover the cover photo, so it
          runs underneath instead. */}
      <div className="mb-3 sm:hidden">
        <ProjectReadiness
          locates={staff ? locateSummary : null}
          preConStatus={project.preConStatus ?? "NOT_STARTED"}
          deadline={schedule.deadline}
          workingDaysLeft={schedule.workingDaysLeft}
        />
      </div>

      <div className="space-y-2">
        <ProjectSection
          icon={<SquareGanttChart className="size-4" />}
          title="Project overview"
          accent="green"
          description="Schedule, production pace and the contract date"
          summary={
            <Summary
              parts={[
                project.location,
                schedule.plannedFt > 0 ? formatFeet(schedule.plannedFt) : null,
                project.market || null,
              ]}
            />
          }
        >
          <PanelBody>
            <ProjectScheduleStrip
              projectId={project.id}
              schedule={schedule}
              canEdit={staff}
              market={project.market}
              showMetrics={staff}
            />
          </PanelBody>
          {staff && valuation ? (
            <div className="border-t border-border/40 p-2">
              <ProjectValue v={valuation} />
            </div>
          ) : null}
        </ProjectSection>

        {/* The plan drawing. Left unmounted until opened — this is the PDF
            engine, and it was the single heaviest thing on the old page. */}
        <ProjectSection
          icon={<MapIcon className="size-4" />}
          title="Project map & plans"
          accent="blue"
          description="Construction drawings, as-builts and redlines"
          summary={
            <Summary
              parts={[
                project.hasMap || project.mapUrl ? "1 map" : "No map",
                Array.isArray(project.markups) && project.markups.length
                  ? `${project.markups.length} redlines`
                  : null,
              ]}
            />
          }
        >
          <ProjectMapPanel
            projectId={project.id}
            initialMapUrl={project.mapUrl}
            initialMapOriginalUrl={project.mapOriginalUrl}
            initialMarkups={project.markups}
            canEdit={staff}
          />
        </ProjectSection>

        {staff && projectRates ? (
          <ProjectSection
            icon={<DollarSign className="size-4" />}
            title="Rates on this job"
            accent="gold"
            description="Unit pricing, pay items and customer/subcontractor rate cards"
            summary={
              <Summary
                parts={[
                  projectRates.lines.length
                    ? `${projectRates.lines.length} codes`
                    : "No codes priced",
                  projectRates.lines.length
                    ? `${formatCompactCurrency(projectRates.totals.revenue)} / ${formatCompactCurrency(projectRates.totals.cost)}`
                    : null,
                ]}
              />
            }
            badge={
              projectRates.missingCustomerRates > 0 ? (
                <Badge tone="caution">{projectRates.missingCustomerRates} unpriced</Badge>
              ) : null
            }
          >
            <ProjectRatesPanel
              projectId={project.id}
              rates={projectRates}
              crews={ratedCrews}
              rateCards={rateCards}
            />
          </ProjectSection>
        ) : null}

        {staff ? (
          <ProjectSection
            icon={<MapPin className="size-4" />}
            title="Locates"
            accent="orange"
            description="811 tickets, utility responses and locate status"
            summary={
              <Summary
                parts={[
                  locateSummary.total
                    ? `${locateSummary.total} ${locateSummary.total === 1 ? "ticket" : "tickets"}`
                    : "No tickets",
                  locateSummary.total ? `${locateSummary.ready811} ready` : null,
                  locateSummary.waiting ? `${locateSummary.waiting} waiting` : null,
                ]}
              />
            }
            badge={
              locateSummary.expired ? (
                <Badge tone="critical">{locateSummary.expired} expired</Badge>
              ) : null
            }
          >
            <ProjectLocateRules
              projectId={project.id}
              rules={locateRules}
              summary={locateSummary}
            />
            <div className="border-t border-border/40 px-3 py-2">
              <Link
                href={`/locates?project=${project.id}`}
                className="focus-ring text-[12px] font-medium text-brand-bright hover:underline"
              >
                All locates →
              </Link>
            </div>
          </ProjectSection>
        ) : null}

        {staff ? (
          <ProjectSection
            icon={<Boxes className="size-4" />}
            title="Material on project"
            accent="cyan"
            description="Engineered quantities, issued materials and remaining balances"
            summary={
              <Summary
                parts={[
                  trackedMaterials.length ? `${trackedMaterials.length} items` : "No material list",
                  materialOutstanding > 0
                    ? `${materialOutstanding} still outstanding`
                    : trackedMaterials.length
                      ? "All issued"
                      : null,
                ]}
              />
            }
          >
            <ProjectMaterials
              projectId={project.id}
              imports={materialImports}
              tracked={trackedMaterials}
            />
          </ProjectSection>
        ) : null}

        {staff ? (
          <ProjectSection
            icon={<HardHat className="size-4" />}
            title="Crews on this job"
            accent="indigo"
            description="Subcontractors, crew assignments and contacts"
            summary={
              <Summary
                parts={[
                  projectCrews.length ? projectCrews[0].company : "No crew assigned",
                  projectCrews.length > 1 ? `+${projectCrews.length - 1} more` : null,
                ]}
              />
            }
            badge={
              projectCrews.some((c) => !c.hasRates) ? (
                <Badge tone="caution">
                  {projectCrews.filter((c) => !c.hasRates).length} without rates
                </Badge>
              ) : null
            }
          >
            <ProjectCrews crews={projectCrews} />
          </ProjectSection>
        ) : null}

        <ProjectSection
          icon={<ClipboardList className="size-4" />}
          title="Dailies"
          accent="gold"
          description="Daily reports, production and field updates"
          summary={
            <Summary
              parts={[
                projectDailies.length ? `${projectDailies.length} filed` : "None filed",
                awaitingReview ? `${awaitingReview} awaiting review` : null,
              ]}
            />
          }
        >
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
                    <span className="num shrink-0 text-[11px] text-muted-foreground">
                      {d.workDate}
                    </span>
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
        </ProjectSection>

        {/* Pre-construction and the gallery are one section, because they are
            one record: the baseline shots and the production shots are rows in
            the same table, seen through the same viewer. */}
        <ProjectSection
          icon={<Images className="size-4" />}
          title="Project evidence"
          accent="violet"
          description="Pre-construction, field photos and video, direction, closeout"
          summary={
            <Summary
              parts={[
                `${photos.length - videoCount} ${photos.length - videoCount === 1 ? "photo" : "photos"}`,
                videoCount ? `${videoCount} videos` : null,
                gpsCount ? `${gpsCount} with GPS` : null,
              ]}
            />
          }
          badge={
            (project.preConStatus ?? "NOT_STARTED") !== "COMPLETE" ? (
              <Badge tone={preConCount ? "caution" : "critical"}>
                {preConCount ? "Pre-con incomplete" : "No pre-con"}
              </Badge>
            ) : damageCount ? (
              <Badge tone="caution">{damageCount} existing damage</Badge>
            ) : null
          }
        >
          <div className="space-y-2 p-2">
            <PreConstruction
              projectId={project.id}
              status={project.preConStatus ?? "NOT_STARTED"}
              completedBy={project.preConCompletedBy ?? ""}
              completedAt={project.preConCompletedAt ?? null}
              count={preConCount}
              canComplete={staff}
            />
            <ProjectPhotos projectId={project.id} photos={photos} canDelete={staff} />
          </div>
        </ProjectSection>

        {/* A sibling of Dailies, never a child of one. The module does not
            exist yet and this does not pretend otherwise — no counts, no
            zero dressed up as a clean bill of health. */}
        <ProjectSection
          icon={<AlertTriangle className="size-4" />}
          title="Damage reports / incidents"
          accent="red"
          description="Utility strikes, property damage, safety incidents and claims"
          summary={<span className="text-muted-foreground/70">Not yet available</span>}
        >
          <PanelBody className="py-8 text-center">
            <AlertTriangle className="mx-auto size-6 text-muted-foreground/40" />
            <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
              Incidents will be recorded here as their own project record — an incident number,
              time and place, the utility struck, the 811 ticket, who was notified and what it
              took to repair. A crew will be able to open one straight from their phone without
              starting a daily first.
            </p>
            <p className="mt-2 text-[11.5px] text-muted-foreground/70">
              Until then, photograph damage through Project evidence and mark it existing damage
              where it was already there.
            </p>
          </PanelBody>
        </ProjectSection>

        {staff ? (
          <ProjectSection
            icon={<Building2 className="size-4" />}
            title="Customer"
            accent="green"
            description="Customer details, terms and contacts"
            summary={
              <Summary
                parts={[project.client, customer ? customer.paymentTerms : "Not linked"]}
              />
            }
          >
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
          </ProjectSection>
        ) : null}
      </div>
    </PageShell>
  );
}

function Fact({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className="text-muted-foreground/70">{icon}</span>
      <span className="truncate text-foreground/90">{value}</span>
    </span>
  );
}

function Badge({ tone, children }: { tone: "caution" | "critical"; children: React.ReactNode }) {
  return (
    <span
      className={
        tone === "critical"
          ? "inline-flex items-center rounded-full border border-critical/40 bg-critical/[0.1] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-critical"
          : "inline-flex items-center rounded-full border border-caution/40 bg-caution/[0.1] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-caution"
      }
    >
      {children}
    </span>
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
