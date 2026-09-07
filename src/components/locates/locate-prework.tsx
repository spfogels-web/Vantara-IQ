import Link from "next/link";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LocateRow } from "@/data/locates-ops";

/**
 * What the locates say, on the page where the work actually starts.
 *
 * The gap this closes: the office knew a contractor locate was outstanding and
 * the crew filling in a daily had no way to find that out. Putting it on the
 * billing sheet is the only place it reliably gets read, because that is the
 * page somebody opens on the day.
 *
 * Ordered by consequence, not by count. An expired ticket outranks an
 * outstanding self-locate, which outranks a utility that has not answered,
 * which outranks the good news. Only one banner shows — a crew that has to
 * read four boxes to find out whether they can dig reads none of them.
 */
export function LocatePreWork({
  rows,
  projectId,
}: {
  rows: LocateRow[];
  projectId: string;
}) {
  if (rows.length === 0) return null;

  const expired = rows.filter((r) => r.urgency === "expired");
  const issues = rows.filter((r) => r.field === "CONTRACTOR_LOCATE_ISSUE");
  const ourLocate = rows.filter(
    (r) => r.field === "CONTRACTOR_LOCATE_REQUIRED" || r.field === "CONTRACTOR_LOCATE_IN_PROGRESS",
  );
  const waiting = rows.filter((r) => r.external === "WAITING_ON_811");
  const ready = rows.filter((r) => r.field === "FIELD_READY");

  const streets = (list: LocateRow[]) =>
    [...new Set(list.map((r) => r.street).filter(Boolean))].slice(0, 6).join(", ") ||
    list.map((r) => r.number).slice(0, 4).join(", ");

  // The utilities we owe, named. "Complete the locate" is not an instruction;
  // "complete the Windstream locate" is.
  const owed = [...new Set(ourLocate.flatMap((r) => r.contractorOutstanding))];

  if (issues.length > 0) {
    return (
      <Banner
        tone="critical"
        icon={<ShieldAlert className="size-4" />}
        heading="Do not dig — locate problem"
        body={`A locate we performed could not be completed on ${streets(issues)}. It has to be sorted out before anybody breaks ground.`}
        projectId={projectId}
      />
    );
  }

  if (expired.length > 0) {
    return (
      <Banner
        tone="critical"
        icon={<AlertTriangle className="size-4" />}
        heading={`${expired.length} locate ticket${expired.length === 1 ? " has" : "s have"} expired`}
        body={`${streets(expired)} — the marks on the ground are out of date. File an update before working these.`}
        projectId={projectId}
      />
    );
  }

  if (ourLocate.length > 0) {
    return (
      <Banner
        tone="warning"
        icon={<AlertTriangle className="size-4" />}
        heading="Pre-work required"
        body={
          owed.length > 0
            ? `811 is clear on ${streets(ourLocate)}, but ${owed.join(" and ")} ${
                owed.length === 1 ? "is ours" : "are ours"
              } to locate. Walk it, mark it and sign it off before excavation — the ticket is not field ready until you do.`
            : `811 is clear on ${streets(ourLocate)}, but our own locate has not been signed off yet.`
        }
        projectId={projectId}
      />
    );
  }

  if (waiting.length > 0) {
    return (
      <Banner
        tone="warning"
        icon={<AlertTriangle className="size-4" />}
        heading={`Waiting on a utility${waiting.length > 1 ? ` — ${waiting.length} tickets` : ""}`}
        body={`${streets(waiting)} — ${[...new Set(waiting.flatMap((r) => r.waitingOn))]
          .slice(0, 4)
          .join(", ")} ${waiting.length === 1 ? "has" : "have"} not given an acceptable response yet.`}
        projectId={projectId}
      />
    );
  }

  if (ready.length > 0) {
    return (
      <Banner
        tone="success"
        icon={<CheckCircle2 className="size-4" />}
        heading={`${ready.length} location${ready.length === 1 ? "" : "s"} field ready`}
        body={`${streets(ready)} — outside utilities cleared and our own locates verified.`}
        projectId={projectId}
      />
    );
  }

  return null;
}

function Banner({
  tone,
  icon,
  heading,
  body,
  projectId,
}: {
  tone: "success" | "warning" | "critical";
  icon: React.ReactNode;
  heading: string;
  body: string;
  projectId: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-start gap-2.5 rounded-xl border px-3 py-2.5",
        tone === "success"
          ? "border-success/40 bg-success/[0.06]"
          : tone === "warning"
            ? "border-warning/45 bg-warning/[0.07]"
            : "border-critical/50 bg-critical/[0.08]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-critical",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[12.5px] font-bold uppercase tracking-[0.05em]",
            tone === "success"
              ? "text-success"
              : tone === "warning"
                ? "text-warning"
                : "text-critical",
          )}
        >
          {heading}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-foreground">{body}</p>
      </div>
      <Link
        href={`/locates?project=${projectId}`}
        className="focus-ring shrink-0 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05]"
      >
        See locates
      </Link>
    </div>
  );
}

/** The one-line version, for a card in a grid of jobs. */
export function LocateChip({ rows }: { rows: LocateRow[] }) {
  if (rows.length === 0) return null;

  const expired = rows.filter((r) => r.urgency === "expired").length;
  const issues = rows.filter((r) => r.field === "CONTRACTOR_LOCATE_ISSUE").length;
  const ourLocate = rows.filter(
    (r) => r.field === "CONTRACTOR_LOCATE_REQUIRED" || r.field === "CONTRACTOR_LOCATE_IN_PROGRESS",
  ).length;
  const ready = rows.filter((r) => r.field === "FIELD_READY").length;

  const [label, tone] =
    issues > 0
      ? ["Locate problem", "critical"]
      : expired > 0
        ? [`${expired} expired`, "critical"]
        : ourLocate > 0
          ? ["Our locate required", "warning"]
          : ready > 0
            ? [`${ready} field ready`, "success"]
            : ["Waiting on utilities", "warning"];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]",
        tone === "success"
          ? "border-success/40 bg-success/10 text-success"
          : tone === "warning"
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-critical/40 bg-critical/10 text-critical",
      )}
    >
      {label}
    </span>
  );
}
