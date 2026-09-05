import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";

import { getProjects } from "@/data/queries";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatFeet, formatNumber, paceRatio } from "@/lib/format";
import { PageShell, StatStrip } from "@/components/common/page-shell";
import { ProjectCover } from "@/components/projects/project-cover";
import { Panel } from "@/components/common/panel";
import { HealthRing } from "@/components/common/health-ring";
import { StatusPill } from "@/components/common/status-pill";
import { Meter } from "@/components/common/metric";
import { MarketFilter } from "@/components/projects/market-filter";
import { isMarketId, MARKETS } from "@/lib/markets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects · Vantara IQ" };

/**
 * The jobs list, which is two different pages depending on who is reading it.
 *
 * Health, pace, forecast and feet-remaining are how Fortitude judges a job —
 * they compare a crew's output against a target the crew never agreed to, and
 * a score of 62 on somebody's own work is an argument waiting to happen rather
 * than information they can act on. A crew gets the one fact that concerns
 * them: whether the job is on schedule.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; stage?: string }>;
}) {
  const [me, all, sp] = await Promise.all([getCurrentUser(), getProjects(), searchParams]);
  const staff = !!me && isStaff(me.role);

  // Counted across every job, not the filtered set — a chip has to say how many
  // it would show, which is the whole reason to read it before pressing it.
  const counts = Object.fromEntries(
    MARKETS.map((m) => [m.id, all.filter((p) => p.market === m.id).length]),
  );
  const unassigned = all.filter((p) => !isMarketId(p.market)).length;


  /**
   * Running work, finished work, or both.
   *
   * Current is the default and stays out of the URL, because a finished job on
   * the active list drags every number with it — it counts toward projects,
   * toward average health, and toward feet remaining, all of which are meant
   * to describe what is still in front of the crews.
   */
  const stage: "current" | "completed" | "all" =
    sp.stage === "completed" || sp.stage === "all" ? sp.stage : "current";
  const stageCounts = {
    current: all.filter((p) => !p.completedAt).length,
    completed: all.filter((p) => p.completedAt).length,
  };
  const atStage =
    stage === "all" ? all : all.filter((p) => (stage === "completed" ? p.completedAt : !p.completedAt));

  const choice = sp.market;
  const selected =
    choice === "unassigned" || isMarketId(choice) ? choice : ("all" as const);

  const projects =
    selected === "all"
      ? atStage
      : selected === "unassigned"
        ? atStage.filter((p) => !isMarketId(p.market))
        : atStage.filter((p) => p.market === selected);

  // The strip describes what is on screen. Leaving it on the full book while
  // the grid showed three jobs made the two disagree, and the number in
  // bigger type is the one that gets believed.
  const remaining = projects.reduce((s, p) => s + p.remainingFt, 0);
  const atRisk = projects.filter((p) => p.tone === "critical" || p.tone === "warning").length;
  const avgHealth = projects.length
    ? Math.round(projects.reduce((s, p) => s + p.health, 0) / projects.length)
    : 0;
  const behind = projects.filter((p) => p.status === "Behind schedule").length;

  return (
    <PageShell
      eyebrow="Overview"
      title={staff ? "Projects" : "Your projects"}
      description={
        staff
          ? "Every active build with its own identity — health, pace, forecast and the intelligence behind each one."
          : "The jobs your crew is assigned to."
      }
      actions={
        staff ? (
          <Link
            href="/projects/new"
            className="brand-gradient focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold text-white"
          >
            <Plus className="size-4" /> New project
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {/* Markets first: which book you are looking at decides what every
            number under it means. Staff only — a crew sees its own jobs and
            has no book to narrow. */}
        {staff ? (
          <MarketFilter
            counts={counts}
            unassigned={unassigned}
            value={selected}
            stage={stage}
            stageCounts={stageCounts}
          />
        ) : null}

        {staff ? (
          <StatStrip
            stats={[
              { label: "Active projects", value: String(projects.length) },
              { label: "Avg health", value: String(avgHealth) },
              { label: "At risk", value: String(atRisk), tone: atRisk ? "text-warning" : undefined },
              { label: "Behind schedule", value: String(behind), tone: behind ? "text-critical" : undefined },
              { label: "Feet remaining", value: formatFeet(remaining) },
            ]}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const pace = paceRatio(p.actualFtPerDay, p.requiredFtPerDay);
            const paceTone =
              pace === null ? "neutral" : pace >= 1 ? "success" : pace >= 0.85 ? "warning" : "critical";
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="focus-ring group block rounded-2xl">
                <Panel className="overflow-hidden p-0 transition-colors group-hover:bg-foreground/[0.04]">
                  {/* Cover photo — drop an image on it or click to add one. */}
                  <ProjectCover
                    projectId={p.id}
                    projectNumber={p.number}
                    photoUrl={p.photoUrl}
                    mapUrl={p.mapUrl}
                  />

                  <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-[14px] font-semibold text-foreground group-hover:text-white">
                          {p.name}
                        </h3>
                        {p.completedAt ? (
                          <span className="shrink-0 rounded-full border border-success/45 bg-success/[0.12] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-success">
                            Done
                          </span>
                        ) : p.tone === "critical" ? (
                          <AlertTriangle className="size-3.5 shrink-0 text-critical" />
                        ) : null}
                        <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                      </div>
                      <p className="num mt-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                        {p.number}
                      </p>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {[p.client, p.location].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {staff ? <HealthRing score={p.health} size={44} stroke={3.5} /> : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusPill label={p.status} tone={p.tone} />
                    {staff ? (
                      <span className={cn("text-[11.5px] font-medium", toneStyles[p.forecastTone].text)}>
                        {p.forecast}
                      </span>
                    ) : null}
                  </div>

                  {staff ? (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-baseline justify-between text-[11.5px]">
                        <span className="text-muted-foreground">
                          <span className="num font-medium text-foreground">{p.pctComplete}%</span> complete
                        </span>
                        <span className="num text-muted-foreground">{formatFeet(p.remainingFt)} left</span>
                      </div>
                      <Meter value={p.pctComplete / 100} tone={p.tone} />
                      <div className="flex items-baseline justify-between pt-0.5 text-[11px] text-muted-foreground">
                        <span>
                          Pace{" "}
                          <span className={cn("num font-medium", toneStyles[paceTone].text)}>
                            {pace === null ? "—" : `${Math.round(pace * 100)}%`}
                          </span>
                        </span>
                        <span className="num">
                          {p.requiredFtPerDay > 0
                            ? `${formatNumber(p.actualFtPerDay)}/${formatNumber(p.requiredFtPerDay)} ft/day · `
                            : "No target · "}
                          {p.crew}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  </div>
                </Panel>
              </Link>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
