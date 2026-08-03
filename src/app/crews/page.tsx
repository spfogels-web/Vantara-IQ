import { HardHat } from "lucide-react";

import { getCrews } from "@/data/queries";
import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatPercent, initials } from "@/lib/format";
import type { CrewState } from "@/lib/types";
import { PageShell, StatStrip } from "@/components/common/page-shell";
import { Panel, PanelBody } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Meter } from "@/components/common/metric";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crews · Vantara IQ" };

const stateTone: Record<CrewState, "success" | "info" | "warning" | "neutral"> = {
  available: "success",
  deployed: "info",
  scheduled: "warning",
  off: "neutral",
};

const stateLabel: Record<CrewState, string> = {
  available: "Available",
  deployed: "Deployed",
  scheduled: "Scheduled",
  off: "Off rotation",
};

export default async function CrewsPage() {
  const crews = await getCrews();

  const available = crews.filter((c) => c.state === "available").length;
  const deployed = crews.filter((c) => c.state === "deployed").length;
  const avgUtil = crews.reduce((s, c) => s + c.utilization, 0) / crews.length;

  return (
    <PageShell
      eyebrow="Network"
      title="Crews"
      description="Who's deployed, who's free, and when each crew comes available — the allocation picture behind every schedule recovery."
    >
      <div className="flex flex-col gap-3">
        <StatStrip
          stats={[
            { label: "Total crews", value: String(crews.length) },
            { label: "Available", value: String(available), tone: available ? "text-success" : undefined },
            { label: "Deployed", value: String(deployed) },
            { label: "Avg utilization", value: formatPercent(avgUtil) },
          ]}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {crews.map((c) => {
            const tone = stateTone[c.state];
            const utilTone = c.utilization >= 0.95 ? "critical" : c.utilization >= 0.85 ? "warning" : "success";
            return (
              <Panel key={c.id}>
                <PanelBody className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/[0.06] ring-1 ring-inset ring-white/[0.06]">
                      <HardHat className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-foreground">{c.name}</p>
                      <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                        <span className="grid size-4 place-items-center rounded-full bg-white/[0.06] text-[8px] font-semibold text-muted-foreground">
                          {initials(c.lead)}
                        </span>
                        {c.lead}
                      </p>
                    </div>
                    <StatusPill label={stateLabel[c.state]} tone={tone} />
                  </div>

                  <div className="rounded-lg bg-white/[0.02] px-3 py-2 text-[12px] text-muted-foreground">
                    {c.assignment}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-[11.5px]">
                      <span className="text-muted-foreground">Utilization (7-day)</span>
                      <span className={cn("num font-medium", toneStyles[utilTone].text)}>
                        {formatPercent(c.utilization)}
                      </span>
                    </div>
                    <Meter value={c.utilization} tone={utilTone} />
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-2.5 text-[11.5px]">
                    <span className="text-muted-foreground">Available</span>
                    <span className="font-medium text-foreground">
                      {c.availableIn === 0 ? "Now" : `${c.availableOn} · in ${c.availableIn}d`}
                    </span>
                  </div>
                </PanelBody>
              </Panel>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
