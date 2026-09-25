"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Mail,
  MapPin,
  PencilLine,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { TimesheetRow, WorkforceEmployee, WorkforceToday } from "@/data/queries";
import {
  assignEmployeeToProject,
  inviteEmployee,
  revokeEmployeeInvite,
  setEmployeeStatus,
  unassignEmployeeFromProject,
  updateEmployee,
} from "@/app/workforce-actions";
import { AddEmployee } from "@/components/workforce/add-employee";

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
  const [editing, setEditing] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  /** A freshly minted invitation link, shown once next to the person it is for. */
  const [link, setLink] = React.useState<{ id: string; url: string } | null>(null);

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

  async function invite(employeeId: string, email: string) {
    setBusy(employeeId);
    setNotice(null);
    const res = await inviteEmployee({ employeeId, email });
    setBusy(null);
    if (!res.ok) return setNotice(res.error);
    setLink({ id: employeeId, url: `${window.location.origin}/invite/employee/${res.token}` });
    router.refresh();
  }

  async function revoke(employeeId: string) {
    setBusy(employeeId);
    setNotice(null);
    await revokeEmployeeInvite({ employeeId });
    setBusy(null);
    // Whatever link was on screen is dead now; take it off screen too.
    setLink((l) => (l?.id === employeeId ? null : l));
    router.refresh();
  }

  async function setStatus(employeeId: string, status: "ACTIVE" | "INACTIVE") {
    setBusy(employeeId);
    setNotice(null);
    const res = await setEmployeeStatus({ employeeId, status });
    setBusy(null);
    // Refusing to deactivate somebody mid-shift is a real answer, not a
    // failure — say what it was rather than leaving the toggle looking stuck.
    if (!res.ok) setNotice(res.error);
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 px-4 py-10 text-center">
        <p className="text-[13px] text-muted-foreground">
          Nobody is on the books yet. Add somebody and they can clock in from
          their phone.
        </p>
        <AddEmployee projects={projects} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-[11.5px] text-muted-foreground">
          {rows.length} {rows.length === 1 ? "employee" : "employees"}
        </span>
        <div className="ml-auto">
          <AddEmployee projects={projects} />
        </div>
      </div>

      {notice ? (
        <p className="rounded-xl border border-warning/35 bg-warning/[0.07] px-3 py-2 text-[12.5px] text-warning">
          {notice}
        </p>
      ) : null}

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
                {e.status === "ACTIVE" ? "Active" : "Inactive — no clock"}
                {e.hasLogin
                  ? " · has a login"
                  : e.invitePending
                    ? " · invited, not set up yet"
                    : " · no login yet"}
                {e.clockedIn ? ` · on the clock${e.currentProject ? ` at ${e.currentProject}` : ""}` : ""}
              </p>
            </div>
            <span className="num shrink-0 text-[12.5px] text-foreground">{e.hoursToday.toFixed(1)} h today</span>
          </div>

          {/* What still has to happen before this person can clock in, and the
              control that does it. Only ever one of these shows. */}
          {!e.hasLogin ? (
            <div className="flex flex-wrap items-center gap-2 pl-[52px]">
              <InviteControl
                employee={e}
                busy={busy === e.id}
                onInvite={(email) => invite(e.id, email)}
                onRevoke={() => revoke(e.id)}
              />
            </div>
          ) : null}

          {link?.id === e.id ? (
            <div className="ml-[52px] flex items-center gap-2 rounded-xl border border-border/60 bg-foreground/[0.03] p-2">
              <code className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                {link.url}
              </code>
              <CopyLink url={link.url} />
            </div>
          ) : null}

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

          {/* Editing who somebody is, kept behind a toggle so the roster reads
              as a list rather than a wall of inputs. */}
          <div className="flex flex-wrap items-center gap-1.5 pl-[52px]">
            <button
              type="button"
              onClick={() => setEditing((v) => (v === e.id ? null : e.id))}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              <PencilLine className="size-3" /> {editing === e.id ? "Cancel" : "Edit"}
            </button>
            <button
              type="button"
              disabled={busy === e.id}
              onClick={() => setStatus(e.id, e.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {e.status === "ACTIVE" ? (
                <>
                  <UserX className="size-3" /> Deactivate
                </>
              ) : (
                <>
                  <UserCheck className="size-3" /> Reactivate
                </>
              )}
            </button>
          </div>

          {editing === e.id ? (
            <EditEmployee
              employee={e}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          ) : null}
        </li>
      ))}
      </ul>
    </div>
  );
}

/** Copy a one-time link. Vantara sends no email; somebody hands this over. */
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(url);
        setCopied(true);
      }}
      className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11.5px] text-foreground hover:border-brand/50"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/**
 * Getting somebody a login, in whichever state they are in.
 *
 * Three of them: never invited, invited and waiting, or invited to an address
 * that needs changing. All three end at the same action — mint a link — so
 * the only thing that varies is what it is called and whether an address has
 * to be typed first.
 */
function InviteControl({
  employee,
  busy,
  onInvite,
  onRevoke,
}: {
  employee: WorkforceEmployee;
  busy: boolean;
  onInvite: (email: string) => void;
  onRevoke: () => void;
}) {
  const [email, setEmail] = React.useState(employee.inviteEmail);
  const ready = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="their@email.com"
        aria-label={`Email for ${employee.name}`}
        className="focus-ring h-8 min-w-0 flex-1 rounded-lg border border-border/60 bg-foreground/[0.03] px-2 text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground/60 sm:max-w-[220px]"
      />
      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => onInvite(email.trim())}
        className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11.5px] text-foreground hover:border-brand/50 disabled:opacity-50"
      >
        <Mail className="size-3" />
        {employee.invitePending ? "New link" : "Invite"}
      </button>
      {/* Only where there is something to withdraw. Reissuing already
          replaces the old link; this is for changing your mind entirely. */}
      {employee.invitePending ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRevoke}
          className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-[11.5px] text-muted-foreground hover:border-critical/50 hover:text-critical disabled:opacity-50"
        >
          Cancel invite
        </button>
      ) : null}
    </>
  );
}

/** Name, title and phone. Not status, and not assignments — those are their own. */
function EditEmployee({
  employee,
  onDone,
}: {
  employee: WorkforceEmployee;
  onDone: () => void;
}) {
  const [name, setName] = React.useState(employee.name);
  const [title, setTitle] = React.useState(employee.title);
  const [phone, setPhone] = React.useState(employee.phone);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const field =
    "focus-ring h-9 w-full rounded-lg border border-border/60 bg-foreground/[0.03] px-2.5 text-[12.5px] text-foreground outline-none";

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateEmployee({ employeeId: employee.id, name, title, phone });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone();
  }

  return (
    <div className="ml-[52px] flex flex-col gap-2 rounded-xl border border-border/60 p-2.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} inputMode="tel" />
        </label>
      </div>
      {error ? <p className="text-[12px] text-critical">{error}</p> : null}
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={save}
        className="focus-ring inline-flex h-9 w-full items-center justify-center rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50 sm:w-auto sm:self-start sm:px-4"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
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
