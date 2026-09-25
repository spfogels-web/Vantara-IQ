"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, MapPin, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TimesheetRow, WorkforceEmployee, WorkforceToday } from "@/data/queries";
import { assignEmployeeToProject, unassignEmployeeFromProject } from "@/app/workforce-actions";

/**
 * The office's view of the crew.
 *
 * Three questions, three tabs: who is working now, who works here, and what
 * was filed. Nothing on this screen carries money — no rate, no margin, no
 * invoice total — because the queries behind it never read one.
 */
export function WorkforceView({
  today,
  employees,
  timesheets,
  projects,
  initialTab,
  filters,
}: {
  today: WorkforceToday;
  employees: WorkforceEmployee[];
  timesheets: TimesheetRow[];
  projects: { id: string; name: string }[];
  initialTab: "today" | "employees" | "timesheets";
  filters: { from: string; to: string; employee: string; project: string; status: string };
}) {
  const [tab, setTab] = React.useState(initialTab);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="Employees" value={String(today.employees)} note="on the books" icon={<Users className="size-4" />} />
        <Stat label="Clocked in" value={String(today.clockedIn)} note="right now" icon={<Clock className="size-4" />} tone="success" />
        <Stat label="Clocked out" value={String(today.clockedOutToday)} note="today" icon={<Clock className="size-4" />} />
        <Stat label="Hours today" value={today.hoursToday.toFixed(1)} note="across the crew" icon={<Clock className="size-4" />} />
      </div>

      <div className="inline-flex w-fit rounded-lg border border-border/60 p-0.5">
        {(["today", "employees", "timesheets"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "focus-ring rounded-md px-3 py-1.5 text-[12.5px] font-medium capitalize transition-colors",
              tab === t ? "bg-brand/15 text-brand-bright" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "today" ? "On the clock" : t}
          </button>
        ))}
      </div>

      {tab === "today" ? <ActiveList rows={today.active} /> : null}
      {tab === "employees" ? <EmployeeList rows={employees} projects={projects} /> : null}
      {tab === "timesheets" ? (
        <TimesheetList rows={timesheets} employees={employees} projects={projects} filters={filters} />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  tone?: "success";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3">
      <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </p>
      <p className={cn("num mt-2 text-[24px] font-bold tracking-[-0.02em]", tone === "success" ? "text-success" : "text-foreground")}>
        {value}
      </p>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">{note}</p>
    </div>
  );
}

/** Who is on the clock, and whether their phone is still talking to us. */
function ActiveList({ rows }: { rows: WorkforceToday["active"] }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (rows.length === 0) {
    return <Empty>Nobody is clocked in.</Empty>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border/40 rounded-xl border border-border/60">
      {rows.map((r) => (
        <li key={r.timeEntryId} className="flex flex-wrap items-center gap-3 p-3">
          <Avatar name={r.name} url={r.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-foreground">
              {r.name}
              {r.title ? <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">{r.title}</span> : null}
            </p>
            <p className="truncate text-[11.5px] text-muted-foreground">
              {r.projectName || "No job selected"} · in at {clock(r.clockInAt)} · {elapsed(now, r.clockInAt)}
            </p>
          </div>
          <TrackingChip status={r.tracking} lastAt={r.lastPointAt} now={now} points={r.points} />
          <Link
            href={`/workforce/timesheets/${r.timeEntryId}`}
            className="focus-ring shrink-0 text-[12px] font-medium text-brand-bright"
          >
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the location record is doing, said honestly.
 *
 * An open shift is not evidence that tracking works. This reads the last
 * point rather than the shift, so a phone that went to sleep an hour ago says
 * so instead of showing a reassuring green dot.
 */
function TrackingChip({
  status,
  lastAt,
  now,
  points,
}: {
  status: string;
  lastAt: string | null;
  now: number;
  points: number;
}) {
  const tone =
    status === "ACTIVE"
      ? "border-success/40 bg-success/15 text-success"
      : "border-warning/40 bg-warning/15 text-warning";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]", tone)}>
      <MapPin className="size-3" />
      {status === "ACTIVE" ? "Reporting" : status === "STALE" ? "Paused" : "No location"}
      <span className="num text-muted-foreground">
        {lastAt ? elapsed(now, lastAt) : "—"} · {points}
      </span>
    </span>
  );
}

/** The roster, and who may book time where. */
function EmployeeList({
  rows,
  projects,
}: {
  rows: WorkforceEmployee[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function add(employeeId: string, projectId: string) {
    if (!projectId) return;
    setBusy(employeeId);
    await assignEmployeeToProject({ employeeId, projectId });
    setBusy(null);
    router.refresh();
  }

  async function remove(employeeId: string, projectId: string) {
    setBusy(employeeId);
    await unassignEmployeeFromProject({ employeeId, projectId });
    setBusy(null);
    router.refresh();
  }

  if (rows.length === 0) return <Empty>No employees yet.</Empty>;

  return (
    <ul className="flex flex-col divide-y divide-border/40 rounded-xl border border-border/60">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={e.name} url={e.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-foreground">
                {e.name}
                {e.title ? <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">{e.title}</span> : null}
              </p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {e.status === "ACTIVE" ? "Active" : "Inactive"}
                {e.hasLogin ? " · has a login" : " · no login yet"}
                {e.clockedIn ? ` · on the clock${e.currentProject ? ` at ${e.currentProject}` : ""}` : ""}
              </p>
            </div>
            <span className="num shrink-0 text-[12.5px] text-foreground">{e.hoursToday.toFixed(1)} h today</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pl-[52px]">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Jobs</span>
            {e.projects.length === 0 ? (
              <span className="text-[11.5px] text-warning">none — cannot book time to any job</span>
            ) : (
              e.projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy === e.id}
                  onClick={() => remove(e.id, p.id)}
                  title="Remove from this job"
                  className="focus-ring inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11.5px] text-foreground hover:border-critical/50 hover:text-critical disabled:opacity-50"
                >
                  {p.name} <span aria-hidden>×</span>
                </button>
              ))
            )}
            <select
              value=""
              disabled={busy === e.id}
              onChange={(ev) => add(e.id, ev.target.value)}
              aria-label={`Assign ${e.name} to a job`}
              className="focus-ring h-7 rounded-lg border border-border/60 bg-foreground/[0.03] px-2 text-[11.5px] text-foreground outline-none"
            >
              <option value="">Add job…</option>
              {projects
                .filter((p) => !e.projects.some((x) => x.id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** What was filed, and which ones are worth opening. */
function TimesheetList({
  rows,
  employees,
  projects,
  filters,
}: {
  rows: TimesheetRow[];
  employees: WorkforceEmployee[];
  projects: { id: string; name: string }[];
  filters: { from: string; to: string; employee: string; project: string; status: string };
}) {
  const router = useRouter();

  function apply(next: Partial<typeof filters>) {
    const merged = { ...filters, ...next };
    const q = new URLSearchParams({ tab: "timesheets" });
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    router.push(`/workforce?${q.toString()}`);
  }

  const field =
    "focus-ring h-8 rounded-lg border border-border/60 bg-foreground/[0.03] px-2 text-[12px] text-foreground outline-none";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={filters.from} onChange={(e) => apply({ from: e.target.value })} aria-label="From" className={field} />
        <input type="date" value={filters.to} onChange={(e) => apply({ to: e.target.value })} aria-label="To" className={field} />
        <select value={filters.employee} onChange={(e) => apply({ employee: e.target.value })} aria-label="Employee" className={field}>
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <select value={filters.project} onChange={(e) => apply({ project: e.target.value })} aria-label="Project" className={field}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(e) => apply({ status: e.target.value })} aria-label="Status" className={field}>
          <option value="">Any status</option>
          {["OPEN", "COMPLETE", "EDITED", "NEEDS_REVIEW"].map((s) => (
            <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <Empty>Nothing filed for these filters.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[820px] table-fixed border-collapse">
            <thead>
              <tr className="border-b border-border/60 text-left">
                {["Employee", "Project", "Date", "In", "Out", "Hours", "Status", "Location", ""].map((h, i) => (
                  <th key={h + i} className="eyebrow truncate px-2 py-2 text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="truncate px-2 py-2.5 text-[12.5px] text-foreground">{r.employeeName}</td>
                  <td className="truncate px-2 py-2.5 text-[12px] text-muted-foreground">{r.projectName || "—"}</td>
                  <td className="num truncate px-2 py-2.5 text-[12px] text-muted-foreground">{r.workDate}</td>
                  <td className="num truncate px-2 py-2.5 text-[12px] text-muted-foreground">{clock(r.clockInAt)}</td>
                  <td className="num truncate px-2 py-2.5 text-[12px] text-muted-foreground">
                    {r.clockOutAt ? clock(r.clockOutAt) : "—"}
                  </td>
                  <td className="num truncate px-2 py-2.5 text-[12.5px] font-semibold text-foreground">
                    {r.hours === null ? "—" : r.hours.toFixed(2)}
                  </td>
                  <td className="truncate px-2 py-2.5 text-[11.5px] text-muted-foreground">
                    {r.status.replace("_", " ").toLowerCase()}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-[12px]">
                    <span className={r.coveragePercent < 60 ? "text-warning" : "text-muted-foreground"}>
                      {r.coveragePercent}% · {r.points}
                    </span>
                    {r.needsAttention ? (
                      <AlertTriangle className="ml-1 inline size-3 text-warning" aria-label="Worth a look" />
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <Link href={`/workforce/timesheets/${r.id}`} className="focus-ring text-[11.5px] font-medium text-brand-bright">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A photo where there is one, initials where there is not. */
function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="size-10 shrink-0 rounded-full border border-border/60 object-cover" />;
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border/60 bg-foreground/[0.05] text-[12.5px] font-semibold text-foreground">
      {initials || "?"}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-border/60 px-4 py-10 text-center text-[13px] text-muted-foreground">
      {children}
    </p>
  );
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function elapsed(now: number, since: string): string {
  const s = Math.max(0, Math.round((now - Date.parse(since)) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
