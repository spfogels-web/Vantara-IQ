import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatFeet, formatNumber, paceRatio } from "@/lib/format";
import { Panel } from "@/components/common/panel";
import { HealthRing } from "@/components/common/health-ring";
import { StatusPill } from "@/components/common/status-pill";
import { Meter } from "@/components/common/metric";
import { ProjectCover } from "@/components/projects/project-cover";
import type { Project } from "@/lib/types";

/**
 * One project in the directory: its cover image, then the numbers.
 *
 * The whole card used to be wrapped in a single `<Link>`, which meant the
 * controls on the cover were buttons inside an anchor — invalid markup, and the
 * browser picks one of the two click targets to honour. Instead the details area
 * carries a stretched link and the cover keeps its own actions, so "open the
 * project" and "upload a photo" are two separate, working targets.
 */
export function ProjectCard({ project: p, canManage }: { project: Project; canManage: boolean }) {
  const pace = paceRatio(p.actualFtPerDay, p.requiredFtPerDay);
  const paceTone =
    pace === null ? "neutral" : pace >= 1 ? "success" : pace >= 0.85 ? "warning" : "critical";

  return (
    <Panel className="group overflow-hidden p-0">
      <ProjectCover
        projectId={p.id}
        projectNumber={p.number}
        cover={p.cover ?? null}
        photoCount={p.photoCount ?? 0}
        hasMap={!!p.mapUrl}
        canManage={canManage}
      />

      {/* Details. The stretched link sits over this block only — dragging a
          photo onto the cover has to reach the cover, not an anchor on top. */}
      <div className="relative p-4 transition-colors group-hover:bg-foreground/[0.03]">
        <Link
          href={`/projects/${p.id}`}
          aria-label={`Open ${p.name}`}
          className="focus-ring absolute inset-0 z-10 rounded-b-2xl"
        />

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-[14px] font-semibold text-foreground group-hover:text-white">
                {p.name}
              </h3>
              {p.tone === "critical" ? (
                <AlertTriangle className="size-3.5 shrink-0 text-critical" />
              ) : null}
              <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              <span className="num text-muted-foreground/80">{p.number}</span> · {p.client} ·{" "}
              {p.location}
            </p>
          </div>
          <HealthRing score={p.health} size={44} stroke={3.5} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill label={p.status} tone={p.tone} />
          <span className={cn("text-[11.5px] font-medium", toneStyles[p.forecastTone].text)}>
            {p.forecast}
          </span>
        </div>

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
      </div>
    </Panel>
  );
}
