"use client";

import * as React from "react";
import { HardHat } from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatPercent, initials } from "@/lib/format";
import type { Crew, CrewState, Tone } from "@/lib/types";
import { Panel, PanelFooter, PanelHeader } from "@/components/common/panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const stateMeta: Record<CrewState, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  deployed: { label: "Deployed", tone: "warning" },
  off: { label: "Off rotation", tone: "neutral" },
};

function CrewRow({ crew }: { crew: Crew }) {
  const meta = stateMeta[crew.state];
  const tone = toneStyles[meta.tone];

  return (
    <li className="group flex items-center gap-3 border-t border-border/50 px-4 py-2.5 transition-colors first:border-t-0 hover:bg-foreground/[0.025] sm:px-5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border text-[10.5px] font-semibold",
          tone.bg,
          tone.border,
          tone.text,
        )}
      >
        {initials(crew.lead)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12.5px] font-medium text-foreground">{crew.name}</span>
          <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
          <span className={cn("shrink-0 text-[11px]", tone.text)}>{meta.label}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{crew.assignment}</p>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="shrink-0 text-right">
            <p className="num text-[12px] font-medium text-foreground">
              {crew.availableIn === 0 ? "Now" : `${crew.availableIn}d`}
            </p>
            <p className="text-[10.5px] text-muted-foreground">{crew.availableOn}</p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left">
          {crew.lead} · {formatPercent(crew.utilization)} utilised over 7 days
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

export function CrewAvailability({ crews }: { crews: Crew[] }) {
  const availableNow = crews.filter((c) => c.availableIn === 0).length;
  const avgUtilization =
    crews.reduce((sum, crew) => sum + crew.utilization, 0) / (crews.length || 1);

  return (
    <Panel>
      <PanelHeader
        title="Crew availability"
        description="Next 14 days"
        count={availableNow}
        icon={<HardHat className="size-3.5 text-success" />}
        action="Scheduling"
        actionHref="/crews"
      />

      <ul className="flex-1">
        {crews.map((crew) => (
          <CrewRow key={crew.id} crew={crew} />
        ))}
      </ul>

      <PanelFooter className="justify-between">
        <span>
          <span className="num font-medium text-foreground">{availableNow}</span> free today
        </span>
        <span>
          Avg. utilisation{" "}
          <span className="num font-medium text-foreground">
            {formatPercent(avgUtilization)}
          </span>
        </span>
      </PanelFooter>
    </Panel>
  );
}
