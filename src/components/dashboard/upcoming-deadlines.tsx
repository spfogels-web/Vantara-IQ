"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { initials } from "@/lib/format";
import type { Deadline } from "@/lib/types";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function UpcomingDeadlines({ deadlines }: { deadlines: Deadline[] }) {
  const urgent = deadlines.filter((d) => d.daysOut <= 4).length;

  return (
    <Panel>
      <PanelHeader
        title="Upcoming deadlines"
        description={`${urgent} inside 4 days`}
        icon={<CalendarClock className="size-3.5 text-warning" />}
        action="Calendar"
        actionHref="/calendar"
      />

      <ul className="flex-1 p-2">
        {deadlines.map((deadline) => {
          const tone = toneStyles[deadline.tone];
          return (
            <li key={deadline.id}>
              <Link
                href={`/projects?milestone=${deadline.id}`}
                className="focus-ring group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-white/[0.035]"
              >
                {/* Countdown chip carries the urgency; the rail reinforces it */}
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-lg border",
                    tone.bg,
                    tone.border,
                  )}
                >
                  <span className={cn("num text-[14px] font-semibold leading-none", tone.text)}>
                    {deadline.daysOut}
                  </span>
                  <span className="mt-0.5 text-[8.5px] font-medium uppercase tracking-wide text-muted-foreground">
                    days
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-foreground">
                    {deadline.milestone}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {deadline.project} · {deadline.date}
                  </span>
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[9.5px] font-semibold text-muted-foreground ring-1 ring-inset ring-white/[0.06]">
                      {initials(deadline.owner)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">Owner · {deadline.owner}</TooltipContent>
                </Tooltip>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
