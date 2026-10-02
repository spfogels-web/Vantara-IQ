"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, HardHat, OctagonPause, Timer, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelBody } from "@/components/common/panel";
import type { IncidentKpis, IncidentRow } from "@/data/queries";
import {
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_TONE,
  INCIDENT_TYPE_LABEL,
  INCIDENT_TYPES,
  isOpenStatus,
  type IncidentStatusValue,
  type IncidentTypeValue,
} from "@/lib/incidents";

/**
 * The company's incidents.
 *
 * Reads as a queue rather than an archive: what is still open, what has been
 * waiting, and what stopped a crew working. The figures across the top are the
 * ones somebody would act on this morning — not totals for a report.
 *
 * Filtering happens on what is already on screen, so narrowing to one crew
 * narrows the table and nothing silently reloads underneath it.
 */

const STATUS_FILTERS: (IncidentStatusValue | "ALL" | "OPEN")[] = [
  "OPEN",
  "ALL",
  "REPORTED",
  "UNDER_REVIEW",
  "REPAIR_IN_PROGRESS",
  "REPAIRED",
  "RESOLVED",
  "CLOSED",
  "VOID",
];

function statusClass(status: IncidentStatusValue) {
  const tone = INCIDENT_STATUS_TONE[status];
  return {
    critical: "bg-critical/12 text-critical",
    warning: "bg-warning/12 text-warning",
    info: "bg-info/12 text-info",
    success: "bg-success/12 text-success",
    neutral: "bg-foreground/[0.06] text-muted-foreground",
  }[tone];
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone: "critical" | "warning" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.015] px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg",
            tone === "critical" && value > 0
              ? "bg-critical/12 text-critical"
              : tone === "warning" && value > 0
                ? "bg-warning/12 text-warning"
                : "bg-foreground/[0.06] text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <p className="eyebrow">{label}</p>
      </div>
      <p className="num mt-2 text-[22px] font-semibold tracking-[-0.02em] text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export function IncidentsView({
  rows,
  kpis,
  staff,
  role,
}: {
  rows: IncidentRow[];
  kpis: IncidentKpis;
  staff: boolean;
  role: string;
}) {
  const [status, setStatus] = React.useState<(typeof STATUS_FILTERS)[number]>("OPEN");
  const [type, setType] = React.useState<IncidentTypeValue | "ALL">("ALL");
  const [project, setProject] = React.useState<string>("ALL");
  const [injuryOnly, setInjuryOnly] = React.useState(false);

  const projects = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.projectId)) seen.set(r.projectId, r.projectName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = React.useMemo(
    () =>
      rows.filter((r) => {
        if (status === "OPEN" && !isOpenStatus(r.status)) return false;
        if (status !== "OPEN" && status !== "ALL" && r.status !== status) return false;
        if (type !== "ALL" && r.type !== type) return false;
        if (project !== "ALL" && r.projectId !== project) return false;
        if (injuryOnly && !r.injury) return false;
        return true;
      }),
    [rows, status, type, project, injuryOnly],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Open"
          value={kpis.open}
          hint="still want a person"
          icon={<AlertTriangle className="size-3.5" />}
          tone="critical"
        />
        <Kpi
          label="Work stopped"
          value={kpis.workStoppedNow}
          hint="crews off the job now"
          icon={<OctagonPause className="size-3.5" />}
          tone="critical"
        />
        <Kpi
          label="Strikes · 90 days"
          value={kpis.strikes90d}
          hint="lines hit"
          icon={<Zap className="size-3.5" />}
          tone="warning"
        />
        <Kpi
          label="Open over 7 days"
          value={kpis.openOverSevenDays}
          hint="nobody has finished with"
          icon={<Timer className="size-3.5" />}
          tone="warning"
        />
        <Kpi
          label="Safety · 12 months"
          value={kpis.qualifyingSafety12m}
          hint="injury or safety type"
          icon={<HardHat className="size-3.5" />}
          tone="critical"
        />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2.5 py-2">
          {STATUS_FILTERS.map((f) => {
            const n =
              f === "ALL"
                ? rows.length
                : f === "OPEN"
                  ? rows.filter((r) => isOpenStatus(r.status)).length
                  : rows.filter((r) => r.status === f).length;
            if (n === 0 && f !== "ALL" && f !== "OPEN") return null;
            return (
              <button
                key={f}
                onClick={() => setStatus(f)}
                className={cn(
                  "focus-ring rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  status === f
                    ? "bg-foreground/[0.08] text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f === "ALL" ? "All" : f === "OPEN" ? "Open" : INCIDENT_STATUS_LABEL[f]}
                <span className="num ml-1.5 text-muted-foreground/70">{n}</span>
              </button>
            );
          })}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <select
              id="incident-type-filter"
              value={type}
              onChange={(e) => setType(e.target.value as IncidentTypeValue | "ALL")}
              className="focus-ring rounded-lg border border-border/60 bg-transparent px-2 py-1 text-[11.5px] text-muted-foreground"
            >
              <option value="ALL">Every type</option>
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INCIDENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>

            {projects.length > 1 ? (
              <select
                id="incident-project-filter"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="focus-ring max-w-[180px] rounded-lg border border-border/60 bg-transparent px-2 py-1 text-[11.5px] text-muted-foreground"
              >
                <option value="ALL">Every project</option>
                {projects.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            ) : null}

            <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <input
                id="incident-injury-filter"
                type="checkbox"
                checked={injuryOnly}
                onChange={(e) => setInjuryOnly(e.target.checked)}
                className="focus-ring size-3.5 rounded border-border/60"
              />
              Injury only
            </label>
          </div>
        </div>

        <PanelBody className="p-0">
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <AlertTriangle className="mx-auto size-6 text-muted-foreground/40" />
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                {rows.length === 0
                  ? role === "EMPLOYEE"
                    ? "You have not reported an incident."
                    : "No incidents on record."
                  : "Nothing matches that filter."}
              </p>
              {rows.length === 0 ? (
                <p className="mt-1 text-[11.5px] text-muted-foreground/70">
                  That is an absence of records, not a clean bill of health.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {/* Table on a desk, cards on a phone — the same rows either way. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Number</th>
                      <th className="px-3 py-2 font-medium">Project</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Severity</th>
                      <th className="px-3 py-2 font-medium">Occurred</th>
                      <th className="px-3 py-2 font-medium">Crew</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border/40 transition-colors hover:bg-foreground/[0.02]"
                      >
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/incidents/${r.id}`}
                            className="num focus-ring font-semibold text-foreground hover:text-brand-bright"
                          >
                            {r.number}
                          </Link>
                          {r.workStopped ? (
                            <span className="ml-2 rounded bg-critical/12 px-1.5 py-0.5 text-[10px] font-medium text-critical">
                              work stopped
                            </span>
                          ) : null}
                          {r.injury ? (
                            <span className="ml-1.5 rounded bg-critical/12 px-1.5 py-0.5 text-[10px] font-medium text-critical">
                              injury
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {r.projectName}
                          {r.projectNumber ? (
                            <span className="num ml-1.5 text-muted-foreground/60">{r.projectNumber}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{INCIDENT_TYPE_LABEL[r.type]}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {INCIDENT_SEVERITY_LABEL[r.severity]}
                        </td>
                        <td className="num px-3 py-2.5 text-muted-foreground">
                          {r.occurredAt.toLocaleDateString("en-US")}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.crew || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10.5px] font-medium",
                              statusClass(r.status),
                            )}
                          >
                            {INCIDENT_STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="num px-3 py-2.5 text-right text-muted-foreground">
                          {r.ageDays}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="flex flex-col md:hidden">
                {filtered.map((r) => (
                  <li key={r.id} className="border-b border-border/40 px-3.5 py-3">
                    <Link href={`/incidents/${r.id}`} className="focus-ring block">
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-[13px] font-semibold text-foreground">{r.number}</span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10.5px] font-medium",
                            statusClass(r.status),
                          )}
                        >
                          {INCIDENT_STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] text-foreground">{r.summary}</p>
                      <p className="mt-1 text-[11.5px] text-muted-foreground">
                        {INCIDENT_TYPE_LABEL[r.type]} · {r.projectName} ·{" "}
                        {r.occurredAt.toLocaleDateString("en-US")}
                      </p>
                      {r.workStopped || r.injury ? (
                        <p className="mt-1 text-[11px] font-medium text-critical">
                          {[r.workStopped ? "work stopped" : null, r.injury ? "injury" : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </PanelBody>
      </Panel>

      {!staff ? (
        <p className="px-1 text-[11.5px] text-muted-foreground">
          {role === "EMPLOYEE"
            ? "You see the incidents you reported."
            : "You see your own company's incidents on the jobs you are assigned to."}
        </p>
      ) : null}
    </div>
  );
}
