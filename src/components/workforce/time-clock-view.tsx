"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, LogIn, LogOut, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MyShift } from "@/data/queries";
import { clockIn, clockOut } from "@/app/workforce-actions";
import { useShiftTracking } from "@/components/workforce/use-shift-tracking";
import { getFix } from "@/components/evidence/capture";

/**
 * The employee's own screen, built for one hand on a phone.
 *
 * Two things have to be unmistakable: whether they are on the clock, and the
 * button that changes it. Everything else is secondary and sized that way.
 *
 * The elapsed timer here is a convenience and says so. The hours that count
 * are computed on the server from the two timestamps — a phone that slept, or
 * whose clock is wrong, must not be able to change what somebody is paid.
 */
export function TimeClockView({
  employeeName,
  open,
  recent,
  projects,
}: {
  employeeName: string;
  open: MyShift | null;
  recent: MyShift[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  /**
   * Tracking runs only while a shift is open.
   *
   * The hook subscribes on mount and tears the watch down when this flips
   * to false, which is the moment Clock Out completes. There is no path by
   * which it runs otherwise: no shift, no watch, no points.
   */
  const tracking = useShiftTracking(Boolean(open));

  // Ticks only while a shift is open. Nothing to count otherwise.
  React.useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const elapsed = open ? Math.max(0, Math.floor((now - Date.parse(open.clockInAt)) / 1000)) : 0;

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);

    // A shift starts with a position. The existing evidence helper is used
    // rather than a second GPS stack: it already copes with the browser that
    // never calls either callback when a permission prompt is dismissed.
    const fix = await getFix();
    if (!fix) {
      setBusy(false);
      setError(
        "Location access is required to clock in. Allow location for this site and try again.",
      );
      return;
    }

    const res = await clockIn({
      projectId: projectId || null,
      note,
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      accuracyMeters: typeof fix.coords.accuracy === "number" ? fix.coords.accuracy : null,
    });
    setBusy(false);
    if (res.ok) {
      setNote("");
      router.refresh();
    } else setError(res.error);
  }

  async function end() {
    if (busy) return;
    setBusy(true);
    setError(null);

    // Attempted, never required. A failed fix here must not leave somebody
    // on the clock — clockOut closes the shift either way and records that
    // the final capture did not happen.
    const fix = await getFix(8_000);
    const res = await clockOut({
      note,
      latitude: fix?.coords.latitude,
      longitude: fix?.coords.longitude,
      accuracyMeters:
        fix && typeof fix.coords.accuracy === "number" ? fix.coords.accuracy : null,
    });
    setBusy(false);
    if (res.ok) {
      setNote("");
      router.refresh();
    } else setError(res.error);
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <p className="text-[13px] text-muted-foreground">{greeting()},</p>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-foreground">
        {employeeName}
      </h1>

      <section className="mt-5 rounded-2xl border border-border/60 bg-foreground/[0.02] p-4">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-brand-bright" />
          <h2 className="text-[14px] font-semibold text-foreground">Time Clock</h2>
        </div>

        {open ? (
          <>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-wider text-success">
              You&rsquo;re clocked in
            </p>
            <p className="num mt-1 text-[32px] font-bold tracking-[-0.02em] text-foreground">
              {hms(elapsed)}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Started at {clockTime(open.clockInAt)}
              {open.projectName ? ` · ${open.projectName}` : ""}
            </p>
            {/* The one number on this screen that is not authoritative, said
                plainly rather than left to be assumed. */}
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              Your hours are worked out from the clock-in and clock-out times
              recorded on the server, not from this timer.
            </p>

            {/* What is being recorded, while it is being recorded. Never
                hidden, and never claiming more than actually arrived. */}
            <div className="mt-3 rounded-xl border border-border/60 bg-foreground/[0.03] p-3">
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider">
                <MapPin
                  className={cn(
                    "size-3.5",
                    tracking.status === "ACTIVE" ? "text-success" : "text-warning",
                  )}
                />
                <span className={tracking.status === "ACTIVE" ? "text-success" : "text-warning"}>
                  {trackingLabel(tracking.status)}
                </span>
              </p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {trackingExplanation(tracking.status)}
              </p>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
                <span>
                  <dt className="inline text-muted-foreground">Last location </dt>
                  <dd className="num inline text-foreground">
                    {tracking.lastSentAt ? ago(now, tracking.lastSentAt) : "none yet"}
                  </dd>
                </span>
                <span>
                  <dt className="inline text-muted-foreground">Points </dt>
                  <dd className="num inline text-foreground">{tracking.points}</dd>
                </span>
                {tracking.lastAccuracy !== null ? (
                  <span>
                    <dt className="inline text-muted-foreground">Accuracy </dt>
                    <dd className="num inline text-foreground">
                      {Math.round(tracking.lastAccuracy)} m
                    </dd>
                  </span>
                ) : null}
              </dl>
              <p className="mt-2 text-[11px] text-muted-foreground/80">
                Recording stops the moment you clock out.
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13px] text-muted-foreground">Ready to start your day?</p>

            {projects.length > 0 ? (
              <label className="mt-3 block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Project
                </span>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="focus-ring mt-1 h-11 w-full rounded-xl border border-border/60 bg-foreground/[0.03] px-3 text-[14px] text-foreground outline-none"
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              /* Honest rather than empty. A dropdown with nothing in it reads
                 as a broken page; this says what is actually true, and who
                 can fix it. */
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/[0.07] px-3 py-2.5 text-[12px] text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  You are not assigned to any jobs yet, so a shift cannot be
                  booked to one. You can still clock in — ask the office to
                  put you on a job.
                </span>
              </p>
            )}
          </>
        )}

        <label className="mt-3 block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Note (optional)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={open ? "How the day went" : "e.g. Starting at 153 Main St"}
            className="focus-ring mt-1 h-11 w-full rounded-xl border border-border/60 bg-foreground/[0.03] px-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-xl border border-critical/35 bg-critical/[0.07] px-3 py-2 text-[12.5px] text-critical">
            {error}
          </p>
        ) : null}

        {/* Big, and the only thing it could be mistaken for is itself. */}
        <button
          type="button"
          onClick={open ? end : start}
          disabled={busy}
          className={cn(
            "focus-ring mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white transition disabled:opacity-60",
            open ? "bg-critical hover:brightness-110" : "bg-success hover:brightness-110",
          )}
        >
          {open ? <LogOut className="size-5" /> : <LogIn className="size-5" />}
          {busy ? "Working…" : open ? "Clock Out" : "Clock In"}
        </button>
      </section>

      <section className="mt-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recent days
        </h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Nothing yet. Your finished shifts will appear here.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border/40">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-foreground">
                    {r.workDate}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {clockTime(r.clockInAt)}
                    {r.clockOutAt ? ` – ${clockTime(r.clockOutAt)}` : ""}
                    {r.projectName ? ` · ${r.projectName}` : ""}
                  </span>
                </span>
                <span className="num shrink-0 text-[13.5px] font-semibold text-foreground">
                  {r.durationSeconds === null ? "—" : hoursMinutes(r.durationSeconds)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/**
 * What the tracking state is called, in words that do not overclaim.
 *
 * "Active" is used only when something actually arrived recently. A phone
 * asleep for twenty minutes says so, because an employee reading "Active"
 * would reasonably believe their route was still being recorded.
 */
function trackingLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Location tracking active";
    case "DENIED":
      return "Location permission off";
    case "UNAVAILABLE":
      return "Location unavailable";
    case "STALE":
      return "Location paused";
    default:
      return "Starting location";
  }
}

function trackingExplanation(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "We're recording your location while you're clocked in.";
    case "DENIED":
      return "Your shift is still running. Allow location for this site to record your route again.";
    case "UNAVAILABLE":
      return "Your phone isn't giving a position right now. Your shift is unaffected.";
    case "STALE":
      return "Nothing has come through recently — this happens when the phone locks or the browser goes to the background. Open this screen to resume.";
    default:
      return "Waiting for the first position.";
  }
}

/** "2 min ago", for a timestamp that has to read at a glance. */
function ago(now: number, then: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** 3h 28m 12s — the live timer. */
function hms(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** 10h 09m — a finished day. */
function hoursMinutes(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Eastern, like every other time in this product. */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}
