"use client";

import * as React from "react";
import { AlertTriangle, MapPin, PencilLine } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TimesheetDetail } from "@/data/queries";
import { ShiftMap } from "@/components/workforce/shift-map";
import { CorrectTime } from "@/components/workforce/correct-time";

/**
 * One shift, and everything Vantara actually observed of it.
 *
 * The map and the numbers beside it come from the same two functions —
 * coverageFor and routeSegments — so the line cannot break somewhere the
 * summary calls uninterrupted, and the summary cannot report an interruption
 * the map draws straight through.
 *
 * Nothing here is money. This screen is read by people who are not entitled
 * to see rates, and the queries behind it never load one.
 */
export function TimesheetDetailView({
  sheet,
  canCorrect = false,
}: {
  sheet: TimesheetDetail;
  /** Only management corrects a punch. An employee sees the result. */
  canCorrect?: boolean;
}) {
  const [selected, setSelected] = React.useState<string | null>(null);

  const flat = React.useMemo(
    () =>
      sheet.segments.flatMap((seg, i) =>
        seg.points.map((p) => ({ ...p, segment: i, gapAfter: null as number | null })).map((p, j, arr) =>
          j === arr.length - 1 ? { ...p, gapAfter: seg.gapAfterSeconds } : p,
        ),
      ),
    [sheet.segments],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Said once, plainly, where somebody reading the hours will see it
          — rather than leaving a corrected timecard looking identical to
          one nobody has touched. */}
      {sheet.adjustments.length > 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-warning/35 bg-warning/[0.07] px-3 py-2 text-[12.5px] text-warning">
          <PencilLine className="size-3.5 shrink-0" />
          These times were corrected by hand.
          <span className="text-muted-foreground">
            See the adjustment history below.
          </span>
        </p>
      ) : null}

      {canCorrect ? (
        <div className="flex justify-end">
          <CorrectTime
            timeEntryId={sheet.id}
            clockInAt={sheet.clockInAt}
            clockOutAt={sheet.clockOutAt}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <Fact label="Employee" value={sheet.employeeName} note={sheet.employeeTitle} />
        <Fact label="Project" value={sheet.projectName || "—"} note={sheet.workDate} />
        <Fact
          label="Clock in"
          value={time(sheet.clockInAt)}
          note={sheet.clockInLocationOk ? "location recorded" : "no location"}
          warn={!sheet.clockInLocationOk}
        />
        <Fact
          label="Clock out"
          value={sheet.clockOutAt ? time(sheet.clockOutAt) : "still open"}
          note={
            sheet.clockOutAt === null
              ? "on the clock"
              : sheet.clockOutLocationOk
                ? "location recorded"
                : "final location failed"
          }
          warn={sheet.clockOutAt !== null && !sheet.clockOutLocationOk}
        />
        <Fact
          label="Total hours"
          value={sheet.hours === null ? "—" : sheet.hours.toFixed(2)}
          note={sheet.status.replace("_", " ").toLowerCase()}
        />
      </div>

      {/* The coverage summary, and the sentence that stops it being misread. */}
      <section className="rounded-xl border border-border/60 p-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Measure label="Location coverage" value={`${sheet.coverage.percent}%`} warn={sheet.coverage.percent < 60} />
          <Measure label="GPS points" value={String(sheet.coverage.points)} />
          <Measure label="Interruptions" value={String(sheet.coverage.interruptions)} warn={sheet.coverage.interruptions > 0} />
          <Measure
            label="Longest gap"
            value={sheet.coverage.longestGapSeconds ? minutes(sheet.coverage.longestGapSeconds) : "none"}
          />
          <Measure label="Distance between points" value={`${(sheet.observedMetres / 1609.34).toFixed(1)} mi`} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Coverage is how much of the shift the device was reporting its
          position. It is not a record of whether somebody was working, and the
          distance is the path between recorded points rather than miles driven.
        </p>
      </section>

      <ShiftMap segments={sheet.segments} selectedId={selected} onSelect={setSelected} />

      <section className="rounded-xl border border-border/60">
        <h2 className="border-b border-border/60 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Timeline
        </h2>
        {flat.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
            No locations were recorded for this shift.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {flat.map((p) => (
              <React.Fragment key={p.id}>
                <li>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className={cn(
                      "focus-ring flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.03]",
                      selected === p.id && "bg-brand/[0.07]",
                    )}
                  >
                    <span className="num w-16 shrink-0 text-[12px] text-muted-foreground">
                      {time(p.capturedAt)}
                    </span>
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        p.kind === "CLOCK_IN"
                          ? "bg-success"
                          : p.kind === "CLOCK_OUT"
                            ? "bg-critical"
                            : "bg-brand-bright",
                      )}
                    />
                    <span className="flex-1 truncate text-[12.5px] text-foreground">
                      {p.kind === "CLOCK_IN" ? "Clock in" : p.kind === "CLOCK_OUT" ? "Clock out" : "Location"}
                    </span>
                    <span className="num shrink-0 text-[11.5px] text-muted-foreground">
                      {p.accuracyMeters === null ? "accuracy unknown" : `±${Math.round(p.accuracyMeters)} m`}
                    </span>
                  </button>
                </li>
                {/* The gap, stated where it happened. The map breaks its line
                    at exactly the same place, from the same number. */}
                {p.gapAfter ? (
                  <li className="flex items-center gap-2 bg-warning/[0.06] px-3 py-2 text-[12px] text-warning">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Location reporting unavailable — {minutes(p.gapAfter)}
                  </li>
                ) : null}
              </React.Fragment>
            ))}
          </ul>
        )}
      </section>

      {sheet.adjustments.length > 0 ? (
        <section className="rounded-xl border border-border/60">
          <h2 className="border-b border-border/60 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Adjustment history
          </h2>
          {/* Append-only. Nothing here is ever rewritten by a later
              correction — a second change adds a second row, so the whole
              sequence of what this timecard has been stays readable. */}
          <ul className="divide-y divide-border/40">
            {sheet.adjustments.map((a) => (
              <li key={a.id} className="px-3 py-2.5">
                <p className="text-[12.5px] text-foreground">
                  {fieldLabel(a.field)} corrected
                  <span className="num ml-2 text-muted-foreground">
                    {valueLabel(a.field, a.oldValue)} → {valueLabel(a.field, a.newValue)}
                  </span>
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {a.reason}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                  {a.actor} · {stamp(a.at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sheet.clockInNote || sheet.clockOutNote ? (
        <section className="rounded-xl border border-border/60 p-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</h2>
          {sheet.clockInNote ? (
            <p className="mt-1.5 text-[12.5px] text-foreground">
              <span className="text-muted-foreground">On clock in: </span>
              {sheet.clockInNote}
            </p>
          ) : null}
          {sheet.clockOutNote ? (
            <p className="mt-1.5 text-[12.5px] text-foreground">
              <span className="text-muted-foreground">On clock out: </span>
              {sheet.clockOutNote}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Fact({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-[14px] font-semibold text-foreground">{value}</p>
      {note ? (
        <p className={cn("mt-0.5 truncate text-[11px]", warn ? "text-warning" : "text-muted-foreground")}>
          {warn ? <MapPin className="mr-1 inline size-3" /> : null}
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Measure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span>
      <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={cn("num text-[18px] font-bold", warn ? "text-warning" : "text-foreground")}>{value}</span>
    </span>
  );
}

function fieldLabel(field: string): string {
  switch (field) {
    case "clockInAt":
      return "Clock in";
    case "clockOutAt":
      return "Clock out";
    case "workDate":
      return "Work date";
    case "projectId":
      return "Project";
    default:
      return field;
  }
}

/** Times read as times; everything else as what it was. */
function valueLabel(field: string, value: string): string {
  if (field !== "clockInAt" && field !== "clockOutAt") return value || "—";
  if (!value) return "not set";
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function minutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
