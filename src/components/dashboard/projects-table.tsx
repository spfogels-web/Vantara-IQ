"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatFeet, formatNumber } from "@/lib/format";
import type { Project } from "@/lib/types";
import { Panel, PanelFooter, PanelHeader } from "@/components/common/panel";
import { HealthRing } from "@/components/common/health-ring";
import { StatusPill } from "@/components/common/status-pill";
import { Meter } from "@/components/common/metric";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Pace = achieved ÷ required. Below 1.0 the project is losing ground every day
 * it stays on the current crew allocation, which is the single most useful
 * number on this table.
 */
function PaceCell({ project }: { project: Project }) {
  const pace = project.actualFtPerDay / project.requiredFtPerDay;
  const tone = pace >= 1 ? "success" : pace >= 0.85 ? "warning" : "critical";
  const styles = toneStyles[tone];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-1">
            <span className="num text-[12px] font-medium text-foreground">
              {formatNumber(project.actualFtPerDay)}
            </span>
            <span className="num text-[10.5px] text-muted-foreground">
              /{formatNumber(project.requiredFtPerDay)}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className={cn("h-full rounded-full", styles.dot)}
              style={{ width: `${Math.min(pace, 1) * 100}%` }}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        Running at {Math.round(pace * 100)}% of the rate needed to hit the date
      </TooltipContent>
    </Tooltip>
  );
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <tr className="group border-t border-border/60 transition-colors hover:bg-white/[0.025]">
      {/* Progress lives inside the name cell rather than in its own column —
          it belongs to the project, and reclaiming that column is what lets the
          table fit an 8-of-12 panel without horizontal scroll. */}
      <td className="py-3 pl-4 pr-3 sm:pl-5">
        <Link href={`/projects/${project.id}`} className="focus-ring block rounded">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-foreground group-hover:text-white">
              {project.name}
            </span>
            {project.tone === "critical" ? (
              <AlertTriangle className="size-3.5 shrink-0 text-critical" />
            ) : null}
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {project.client} · {project.location}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="num w-7 shrink-0 text-[10.5px] font-medium text-foreground">
              {project.pctComplete}%
            </span>
            <Meter value={project.pctComplete / 100} tone={project.tone} className="h-1 flex-1" />
            <span className="num shrink-0 text-[10.5px] text-muted-foreground">
              {formatFeet(project.remainingFt)}
            </span>
          </div>
        </Link>
      </td>

      <td className="px-2.5 py-3">
        <StatusPill label={project.status} tone={project.tone} className="text-[10px]" />
      </td>

      <td className="px-2.5 py-3">
        <PaceCell project={project} />
      </td>

      <td className="px-2.5 py-3">
        <span
          className={cn(
            "block truncate text-[12.5px] font-medium",
            toneStyles[project.forecastTone].text,
          )}
        >
          {project.forecast}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
          {project.crew} · {project.updatedAt}
        </span>
      </td>

      <td className="py-3 pl-2.5 pr-4 sm:pr-5">
        <div className="flex items-center justify-end">
          <HealthRing score={project.health} size={36} stroke={3} />
        </div>
      </td>
    </tr>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const pace = project.actualFtPerDay / project.requiredFtPerDay;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="focus-ring block border-t border-border/60 p-4 transition-colors first:border-t-0 active:bg-white/[0.03]"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">{project.name}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {project.client} · {project.location}
          </p>
        </div>
        <HealthRing score={project.health} size={36} stroke={3} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill label={project.status} tone={project.tone} />
        <span className={cn("text-[11.5px] font-medium", toneStyles[project.forecastTone].text)}>
          {project.forecast}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between text-[11.5px]">
          <span className="text-muted-foreground">
            <span className="num font-medium text-foreground">{project.pctComplete}%</span> complete
          </span>
          <span className="num text-muted-foreground">{formatFeet(project.remainingFt)} left</span>
        </div>
        <Meter value={project.pctComplete / 100} tone={project.tone} />
        <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
          <span>
            Pace{" "}
            <span
              className={cn(
                "num font-medium",
                pace >= 1 ? "text-success" : pace >= 0.85 ? "text-warning" : "text-critical",
              )}
            >
              {Math.round(pace * 100)}%
            </span>
          </span>
          <span className="num">
            {formatNumber(project.actualFtPerDay)} / {formatNumber(project.requiredFtPerDay)} ft/day
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ProjectsTable({ projects }: { projects: Project[] }) {
  const atRisk = projects.filter(
    (p) => p.tone === "critical" || p.tone === "warning",
  ).length;

  return (
    <Panel>
      <PanelHeader
        title="Projects requiring attention"
        description="Sorted by health score, worst first"
        count={atRisk}
        icon={<AlertTriangle className="size-3.5 text-warning" />}
        action="All projects"
        actionHref="/projects"
      />

      {/* Mobile: stacked cards. A 6-column table is unreadable under 640px. */}
      <div className="sm:hidden">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

      {/* Tablet and up: real table, horizontally scrollable if space is tight.
          Fixed layout + an explicit colgroup keeps the project name column wide
          enough to actually read — auto layout starves it to feed the numbers. */}
      <div className="hidden overflow-x-auto sm:block">
        {/* 620px is the narrowest the 8-of-12 panel gets (1280px viewport with
            the rail expanded), so the table never needs horizontal scroll. */}
        <table className="w-full min-w-[620px] table-fixed border-collapse text-left">
          <colgroup>
            <col style={{ width: "33%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "11%" }} />
          </colgroup>
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-2 pl-4 pr-3 text-[10px] font-semibold uppercase tracking-[0.09em] sm:pl-5">
                Project
              </th>
              <th className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.09em]">
                Status
              </th>
              <th className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.09em]">
                Pace
              </th>
              <th className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.09em]">
                Forecast
              </th>
              <th className="py-2 pl-2.5 pr-4 text-right text-[10px] font-semibold uppercase tracking-[0.09em] sm:pr-5">
                Health
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </tbody>
        </table>
      </div>

      <PanelFooter className="justify-between">
        <span>
          Showing <span className="num font-medium text-foreground">{projects.length}</span> of{" "}
          <span className="num font-medium text-foreground">14</span> active projects
        </span>
        <Link href="/projects" className="focus-ring rounded text-muted-foreground transition-colors hover:text-foreground">
          View all →
        </Link>
      </PanelFooter>
    </Panel>
  );
}
