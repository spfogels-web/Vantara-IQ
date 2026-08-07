"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Loader2, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatFeet, formatNumber, formatPercent } from "@/lib/format";
import type { ProjectSchedule } from "@/data/queries";
import { setProjectDeadline } from "@/app/actions";

/**
 * Where the job stands against its date.
 *
 * Route feet only — plow and bore. Pedestals, ground rods, signs and ant
 * control are billable work that does not move the route, and microfiber runs
 * down ground already opened, so neither counts toward pace. Completion is what
 * the dailies report, never an estimate.
 *
 * Every number is withheld rather than guessed. No deadline means no required
 * pace; no dailies means the pace is unknown, not zero — a crew that has not
 * been released is not failing at 0 ft/day.
 */

const STATUS: Record<
  ProjectSchedule["status"],
  { label: string; tone: string; ring: string }
> = {
  "no-deadline": { label: "No deadline set", tone: "text-muted-foreground", ring: "stroke-foreground/20" },
  "not-started": { label: "Not started", tone: "text-muted-foreground", ring: "stroke-foreground/20" },
  "on-track": { label: "On track", tone: "text-success", ring: "stroke-success" },
  "at-risk": { label: "At risk", tone: "text-warning", ring: "stroke-warning" },
  behind: { label: "Behind", tone: "text-critical", ring: "stroke-critical" },
  overdue: { label: "Past deadline", tone: "text-critical", ring: "stroke-critical" },
  done: { label: "Complete", tone: "text-success", ring: "stroke-success" },
};

export function ProjectScheduleStrip({
  projectId,
  schedule: s,
  canEdit,
}: {
  projectId: string;
  schedule: ProjectSchedule;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(s.deadline ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(value: string) {
    setBusy(true);
    setError(null);
    const res = await setProjectDeadline(projectId, value);
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  const st = STATUS[s.status];
  const pct = s.pctComplete ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-5">
        {/* Completion ring */}
        <div className="relative grid size-[74px] shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="size-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-foreground/[0.08]" />
            <circle
              cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round"
              className={st.ring}
              strokeDasharray={`${Math.max(0, Math.min(1, pct)) * 97.4} 97.4`}
            />
          </svg>
          <span className="absolute flex flex-col items-center">
            <span className="num text-[17px] font-semibold tracking-[-0.02em] text-foreground">
              {s.pctComplete !== null ? `${Math.round(pct * 100)}%` : "—"}
            </span>
          </span>
        </div>

        <div className="min-w-0">
          <p className="eyebrow">Project health</p>
          <p className={cn("mt-0.5 text-[14px] font-semibold", st.tone)}>{st.label}</p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {s.pctComplete === null
              ? "No plow or bore footage on the material list yet"
              : `${formatFeet(s.completedFt)} of ${formatFeet(s.plannedFt)} route`}
          </p>
        </div>

        {/* Deadline — the one figure here anyone types. */}
        <div className="rounded-xl border border-border/70 bg-foreground/[0.02] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <CalendarClock className="size-3 text-muted-foreground" />
            <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Deadline</p>
            {canEdit && !editing ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(s.deadline ?? "");
                  setEditing(true);
                }}
                className="focus-ring -mr-1 grid size-5 place-items-center rounded text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <Pencil className="size-2.5" />
              </button>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-1 flex items-center gap-1">
              <input
                type="date"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save(draft);
                  if (e.key === "Escape") setEditing(false);
                }}
                className="num rounded border border-border/70 bg-foreground/[0.04] px-1.5 py-0.5 text-[12px] text-foreground outline-none focus:border-brand/60"
              />
              <button
                type="button"
                onClick={() => void save(draft)}
                disabled={busy}
                className="focus-ring grid size-5 place-items-center rounded text-success hover:bg-foreground/[0.06]"
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="focus-ring grid size-5 place-items-center rounded text-muted-foreground hover:bg-foreground/[0.06]"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <>
              <p className="num mt-0.5 text-[14px] font-semibold text-foreground">
                {s.deadline ?? "—"}
              </p>
              <p className="text-[10.5px] text-muted-foreground">
                {s.workingDaysLeft === null
                  ? "set a date to see pace"
                  : s.workingDaysLeft === 0
                    ? "no working days left"
                    : `${s.workingDaysLeft} working day${s.workingDaysLeft === 1 ? "" : "s"} left`}
              </p>
            </>
          )}
          {error ? <p className="mt-0.5 text-[10.5px] text-critical">{error}</p> : null}
        </div>

        {/* The numbers that follow from it. */}
        <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <Stat label="Remaining" value={s.pctComplete === null ? "—" : formatFeet(s.remainingFt)} />
          <Stat
            label="Required pace"
            value={s.requiredFtPerDay !== null ? `${formatNumber(Math.ceil(s.requiredFtPerDay))} ft/day` : "—"}
            hint={s.requiredFtPerDay !== null ? "5-day week" : s.deadline ? "past deadline" : "no deadline"}
          />
          <Stat
            label="Actual pace"
            value={s.actualFtPerDay !== null ? `${formatNumber(Math.round(s.actualFtPerDay))} ft/day` : "—"}
            hint={
              s.daysWorked > 0
                ? `over ${s.daysWorked} day${s.daysWorked === 1 ? "" : "s"} worked`
                : "no dailies yet"
            }
            tone={
              s.paceRatio === null ? undefined : s.paceRatio >= 1 ? "text-success" : "text-critical"
            }
          />
          <Stat
            label="Est. finish"
            value={s.projectedFinish ?? "—"}
            hint={
              s.daysAhead === null
                ? s.actualFtPerDay === null
                  ? "needs a daily"
                  : ""
                : s.daysAhead === 0
                  ? "on the date"
                  : s.daysAhead > 0
                    ? `${s.daysAhead} day${s.daysAhead === 1 ? "" : "s"} early`
                    : `${Math.abs(s.daysAhead)} day${s.daysAhead === -1 ? "" : "s"} late`
            }
            tone={s.daysAhead !== null && s.daysAhead < 0 ? "text-critical" : undefined}
          />
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
          <span>Route complete</span>
          <span className="num">
            {s.pctComplete === null
              ? "no route footage planned"
              : `${formatFeet(s.completedFt)} of ${formatFeet(s.plannedFt)}${s.paceRatio !== null ? ` · pace ${formatPercent(s.paceRatio)}` : ""}`}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
          <div
            className={cn("h-full rounded-full transition-[width]", {
              "bg-success": s.status === "on-track" || s.status === "done",
              "bg-warning": s.status === "at-risk",
              "bg-critical": s.status === "behind" || s.status === "overdue",
              "bg-foreground/25": s.status === "no-deadline" || s.status === "not-started",
            })}
            style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }}
          />
        </div>
        {s.nonLinearCodes > 0 ? (
          <p className="mt-1 text-[10.5px] text-muted-foreground/80">
            Pace counts the {s.linearCodes} plow and bore code
            {s.linearCodes === 1 ? "" : "s"} only. {s.nonLinearCodes} other code
            {s.nonLinearCodes === 1 ? " is" : "s are"} billable but don&apos;t advance the route.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={cn("num mt-0.5 text-[13.5px] font-semibold text-foreground", tone)}>{value}</p>
      {hint ? <p className="text-[10.5px] text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}
