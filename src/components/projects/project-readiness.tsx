/**
 * Whether this job can actually be worked on, over the cover image.
 *
 * The mockup put a weather box here. Weather is a live service to run, a key
 * to hold and a bill to pay, and it tells a supervisor something the window
 * already told them. What belongs in the most-looked-at corner of the page is
 * whatever would stop a crew turning up: whether the locates are ready,
 * whether the route was documented before anybody dug it, and how long is
 * left on the contract.
 *
 * All three come from data this page already loaded. Nothing here is fetched
 * for the sake of the card, and nothing is shown when its underlying record
 * does not exist — a job with no locate tickets says so rather than reporting
 * a reassuring zero.
 */
import { CalendarClock, CircleCheck, CircleDot, ShieldAlert, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "positive" | "caution" | "critical" | "neutral";

export function ProjectReadiness({
  locates,
  preConStatus,
  deadline,
  workingDaysLeft,
}: {
  locates: { total: number; ready811: number; waiting: number; expired: number } | null;
  preConStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
  deadline: string | null;
  workingDaysLeft: number | null;
}) {
  const rows: { icon: React.ReactNode; label: string; value: string; tone: Tone }[] = [];

  if (locates) {
    // Expired beats waiting beats ready: the worst true thing is the one a
    // supervisor needs off this card.
    const tone: Tone = locates.expired
      ? "critical"
      : locates.waiting
        ? "caution"
        : locates.total && locates.ready811 === locates.total
          ? "positive"
          : "neutral";
    rows.push({
      icon: tone === "critical" ? <ShieldAlert className="size-3.5" /> : <CircleDot className="size-3.5" />,
      label: "811",
      value: locates.total
        ? locates.expired
          ? `${locates.expired} expired`
          : locates.waiting
            ? `${locates.waiting} waiting`
            : `${locates.ready811} of ${locates.total} ready`
        : "No tickets",
      tone,
    });
  }

  rows.push({
    icon:
      preConStatus === "COMPLETE" ? (
        <CircleCheck className="size-3.5" />
      ) : (
        <TriangleAlert className="size-3.5" />
      ),
    label: "Pre-con",
    value:
      preConStatus === "COMPLETE"
        ? "Documented"
        : preConStatus === "IN_PROGRESS"
          ? "In progress"
          : "Not started",
    tone:
      preConStatus === "COMPLETE" ? "positive" : preConStatus === "IN_PROGRESS" ? "caution" : "critical",
  });

  if (deadline) {
    rows.push({
      icon: <CalendarClock className="size-3.5" />,
      label: "Due",
      value:
        workingDaysLeft == null
          ? deadline
          : workingDaysLeft < 0
            ? `${Math.abs(workingDaysLeft)} days over`
            : `${workingDaysLeft} working days`,
      tone: workingDaysLeft == null ? "neutral" : workingDaysLeft < 0 ? "critical" : workingDaysLeft <= 5 ? "caution" : "neutral",
    });
  }

  return (
    <div className="w-[190px] rounded-xl border border-border/60 bg-background/80 p-2.5 backdrop-blur-md">
      <p className="eyebrow mb-1.5 text-[10px]">Readiness</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-md border",
                r.tone === "positive"
                  ? "border-success/30 bg-success/[0.1] text-success"
                  : r.tone === "caution"
                    ? "border-caution/30 bg-caution/[0.1] text-caution"
                    : r.tone === "critical"
                      ? "border-critical/30 bg-critical/[0.1] text-critical"
                      : "border-border/70 bg-foreground/[0.03] text-muted-foreground",
              )}
            >
              {r.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {r.label}
              </span>
              <span className="block truncate text-[12px] font-medium text-foreground">
                {r.value}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
