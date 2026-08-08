import Link from "next/link";
import { HardHat, Phone, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { ProjectCrew } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";

/**
 * Who is on this job.
 *
 * Sits at the top of the project page because it is the question the office
 * asks first — a daily arrives, and before anything else you need to know
 * which crew filed it and whether they are cleared to be paid for it. Two
 * problems are called out rather than left to be discovered: a crew that is
 * not yet approved, and a crew with no rate card, which is the one that turns
 * into an unpayable invoice at the end of the week.
 */
export function ProjectCrews({ crews }: { crews: ProjectCrew[] }) {
  return (
    <Panel>
      <PanelHeader
        title="Crews on this job"
        count={crews.length}
        icon={<HardHat className="size-3.5" />}
      />
      <PanelBody>
        {crews.length === 0 ? (
          <div className="flex items-center gap-2.5 py-1">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-warning/12 text-warning">
              <TriangleAlert className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-foreground">
                Nobody is assigned to this job
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                Dailies filed against it will have no crew to bill.{" "}
                <Link href="/subcontractors" className="focus-ring rounded text-brand hover:underline">
                  Assign a crew
                </Link>
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {crews.map((c) => {
              const blocked = c.state !== "Active" || !c.hasRates;
              return (
                <li key={c.id}>
                  <Link
                    href={`/subcontractors?crew=${c.id}`}
                    className="focus-ring group flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition hover:bg-foreground/[0.04]"
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-semibold",
                        blocked
                          ? "bg-warning/12 text-warning"
                          : "bg-brand/12 text-brand",
                      )}
                    >
                      {initials(c.company)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-foreground group-hover:text-white">
                          {c.company}
                        </span>
                        <StatusPill
                          label={c.state}
                          tone={c.state === "Active" ? "success" : "warning"}
                        />
                      </div>
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        {[c.lead, c.trades.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") ||
                          "No lead on file"}
                      </p>
                    </div>

                    {/* What the office is actually chasing, in the order it
                        matters: can they be paid, then what is waiting on us. */}
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      {!c.hasRates ? (
                        <span className="num text-[11px] font-semibold text-warning">
                          No rate card
                        </span>
                      ) : null}
                      {c.pending > 0 ? (
                        <span className="num text-[11px] text-warning">
                          {c.pending} to review
                        </span>
                      ) : null}
                      <span className="num text-[11px] text-muted-foreground">
                        {c.dailies} dail{c.dailies === 1 ? "y" : "ies"}
                      </span>
                      {c.phone ? (
                        <span
                          className="focus-ring hidden size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground sm:grid"
                          title={c.phone}
                        >
                          <Phone className="size-3.5" />
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
