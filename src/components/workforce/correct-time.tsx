"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PencilLine, X } from "lucide-react";

import { correctTimeEntry } from "@/app/workforce-actions";

/**
 * Correcting a punch, with the before and after both on screen.
 *
 * The original value stays visible next to the field being changed, because
 * somebody correcting a timecard should see what they are overwriting rather
 * than an empty box. The reason is required by the server and marked required
 * here for the same reason: a correction nobody explained is a correction
 * nobody can check a month later.
 *
 * There is no control for the location history, and there is no parameter for
 * it either. Moving a clock-out later can lower the coverage figure, and that
 * is correct — the extra time genuinely was not observed, and a number that
 * stayed flattering through a correction would be worth nothing. The warning
 * below says so before anybody is surprised by it.
 */
export function CorrectTime({
  timeEntryId,
  clockInAt,
  clockOutAt,
}: {
  timeEntryId: string;
  clockInAt: string;
  clockOutAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [nextIn, setNextIn] = React.useState(() => forInput(clockInAt));
  const [nextOut, setNextOut] = React.useState(() => (clockOutAt ? forInput(clockOutAt) : ""));
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await correctTimeEntry({
      timeEntryId,
      clockInAt: fromInput(nextIn),
      clockOutAt: nextOut ? fromInput(nextOut) : "",
      reason,
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setReason("");
      router.refresh();
    } else setError(res.error);
  }

  const field =
    "focus-ring h-10 w-full rounded-lg border border-border/60 bg-foreground/[0.03] px-2.5 text-[13px] text-foreground outline-none";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <PencilLine className="size-3.5" /> Correct times
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-auto rounded-xl border border-border bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">Correct times</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="focus-ring grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Clock in
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              Currently {readable(clockInAt)}
            </span>
            <input type="datetime-local" value={nextIn} onChange={(e) => setNextIn(e.target.value)} className={field} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Clock out
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {clockOutAt ? `Currently ${readable(clockOutAt)}` : "Still open"}
            </span>
            <input type="datetime-local" value={nextOut} onChange={(e) => setNextOut(e.target.value)} className={field} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reason <span className="text-critical">required</span>
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Employee forgot to clock out"
              className={field}
            />
          </label>

          <p className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/[0.07] px-2.5 py-2 text-[11.5px] text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              The recorded locations are not changed by this. If you extend the
              shift, the coverage figure will fall, because no location was
              reported for the added time.
            </span>
          </p>

          {error ? (
            <p className="rounded-lg border border-critical/35 bg-critical/[0.07] px-2.5 py-2 text-[12.5px] text-critical">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="focus-ring h-10 rounded-lg border border-border px-3 text-[13px] text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || reason.trim().length < 3}
              className="focus-ring h-10 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save correction"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** An ISO instant as the local value a datetime-local input wants, in ET. */
function forInput(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Back to an instant, reading the typed value as Eastern.
 *
 * The input has no timezone in it, and the browser would read it as the
 * viewer's local time — so an office manager travelling would file a
 * correction an hour out. Everything else in this product is pinned to
 * Eastern and so is this.
 */
function fromInput(local: string): string {
  if (!local) return "";
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // Find the UTC instant whose Eastern wall-clock reading is what was typed.
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = easternOffsetMinutes(new Date(guess));
  return new Date(guess + offset * 60_000).toISOString();
}

/** Minutes to add to an Eastern wall clock to reach UTC, DST included. */
function easternOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return 300;
  const hours = Number(m[1]);
  const mins = Number(m[2] ?? 0);
  return -(hours * 60 + Math.sign(hours) * mins);
}

function readable(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
