import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { PanelBody } from "@/components/common/panel";
import type { IncidentRow } from "@/data/queries";
import {
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_TONE,
  INCIDENT_TYPE_LABEL,
  type IncidentStatusValue,
} from "@/lib/incidents";

/**
 * This job's incidents, inside the project accordion.
 *
 * The project-scoped view of the same records the global page manages, plus the
 * way in. Deliberately a list and a button rather than a second management
 * surface: somebody who wants to work through incidents goes to /incidents.
 */

function statusClass(status: IncidentStatusValue) {
  return {
    critical: "bg-critical/12 text-critical",
    warning: "bg-warning/12 text-warning",
    info: "bg-info/12 text-info",
    success: "bg-success/12 text-success",
    neutral: "bg-foreground/[0.06] text-muted-foreground",
  }[INCIDENT_STATUS_TONE[status]];
}

export function ProjectIncidents({
  projectId,
  incidents,
  canReport,
}: {
  projectId: string;
  incidents: IncidentRow[];
  canReport: boolean;
}) {
  return (
    <PanelBody className="flex flex-col gap-3">
      {incidents.length === 0 ? (
        <div className="py-6 text-center">
          <AlertTriangle className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Nothing has been reported on this job.
          </p>
          {/* The distinction the old placeholder was careful about, kept: an
              empty list is an absence of records, not a clean record. */}
          <p className="mt-1 text-[11.5px] text-muted-foreground/70">
            That is an absence of reports, not a clean bill of health.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {incidents.map((i) => (
            <li key={i.id} className="border-b border-border/40 py-2.5 last:border-0">
              <Link href={`/incidents/${i.id}`} className="focus-ring block">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="num text-[12.5px] font-semibold text-foreground">{i.number}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10.5px] font-medium",
                      statusClass(i.status),
                    )}
                  >
                    {INCIDENT_STATUS_LABEL[i.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-foreground">{i.summary}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {INCIDENT_TYPE_LABEL[i.type]} · {i.occurredAt.toLocaleDateString("en-US")}
                  {i.crew ? ` · ${i.crew}` : ""}
                  {i.photoCount > 0 ? ` · ${i.photoCount} photo${i.photoCount === 1 ? "" : "s"}` : ""}
                </p>
                {i.workStopped || i.injury ? (
                  <p className="mt-0.5 text-[11px] font-medium text-critical">
                    {[i.workStopped ? "work stopped" : null, i.injury ? "injury" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canReport ? (
        <Link
          href={`/incidents/new?project=${projectId}`}
          className="focus-ring inline-flex items-center gap-1.5 self-start rounded-lg border border-border/60 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Report an incident
        </Link>
      ) : null}
    </PanelBody>
  );
}
