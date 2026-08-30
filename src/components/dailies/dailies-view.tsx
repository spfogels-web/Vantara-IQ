"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  Check,
  ClipboardList,
  FileText,
  MapPin,
  Ruler,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import type { DailyReport, DailyStatus } from "@/lib/types";
import { formatCurrency, formatFeet, formatNumber, formatWhen } from "@/lib/format";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { deleteDaily, reopenDailyReview, reviewDaily, setDailyBillingWeek } from "@/app/actions";

const FILTERS: (DailyStatus | "All")[] = [
  "All",
  "Submitted",
  "In review",
  "Approved",
  "Denied",
];

export function DailiesView({
  dailies,
  initialId,
  sheetByDaily,
  reviewerName,
  canReview = false,
}: {
  dailies: DailyReport[];
  initialId?: string;
  /** dailyId -> { sheetId, projectId }, for dailies that came from a Globe sheet. */
  sheetByDaily?: Record<string, { sheetId: string; projectId: string }>;
  /** Who is signed in — recorded on the approval or denial. */
  reviewerName?: string;
  /**
   * Whether this viewer decides dailies. A crew files them and reads the
   * verdict; approving their own work is not a thing to offer and then refuse
   * on the server, which is what a button they cannot use amounts to.
   */
  canReview?: boolean;
}) {
  const [items, setItems] = React.useState(dailies);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All");
  const [selectedId, setSelectedId] = React.useState(
    initialId && dailies.some((d) => d.id === initialId) ? initialId : dailies[0]?.id ?? null,
  );

  const [crew, setCrew] = React.useState("All crews");
  const [job, setJob] = React.useState("All projects");

  // Built from the dailies rather than the roster, so the list only ever
  // offers crews who have actually filed something — picking a name and
  // getting an empty list is worse than not offering it.
  const crews = React.useMemo(() => {
    const seen = new Set<string>();
    for (const d of items) {
      const who = (d.subcontractor || d.crew || "").trim();
      if (who) seen.add(who);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Same rule as the crew list: only jobs that have a daily on them, so
  // picking one never lands on an empty column.
  const jobs = React.useMemo(() => {
    const seen = new Set<string>();
    for (const d of items) {
      const p = (d.project || "").trim();
      if (p) seen.add(p);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = items.filter(
    (d) =>
      (filter === "All" || d.status === filter) &&
      (crew === "All crews" || (d.subcontractor || d.crew || "").trim() === crew) &&
      (job === "All projects" || (d.project || "").trim() === job),
  );
  // Look in the filtered list first. Selecting J&P's sheet and then
  // filtering to Gulf used to leave J&P's day open on the right, which
  // reads as the filter having done nothing.
  const selected =
    filtered.find((d) => d.id === selectedId) ?? filtered[0] ?? null;

  function setStatus(id: string, status: DailyStatus, tone: DailyReport["tone"]) {
    setItems((prev) => prev.map((d) => (d.id === id ? { ...d, status, tone } : d)));
  }

  const pending = items.filter((d) => d.status === "In review" || d.status === "Submitted").length;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className="lg:col-span-5 xl:col-span-4">
        <Panel>
          <PanelHeader
            title="Daily billing sheets"
            description={`${pending} awaiting review`}
            count={filtered.length}
            icon={<ClipboardList className="size-3.5 text-gold" />}
          />
          <div className="flex flex-wrap gap-1.5 border-b border-border/70 p-2.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "focus-ring rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  filter === f
                    ? "bg-brand text-white"
                    : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}

            {/* Whose day it is. A crew name is the thing you scan this list
                for when a foreman rings about a sheet, and twenty-one rows
                is already past what anyone reads down. */}
            {jobs.length > 1 ? (
              <select
                value={job}
                onChange={(e) => setJob(e.target.value)}
                aria-label="Filter by project"
                className={cn(
                  "focus-ring ml-auto h-[26px] max-w-[190px] cursor-pointer rounded-full px-2.5 text-[11.5px] font-medium outline-none transition-colors",
                  job === "All projects"
                    ? "bg-foreground/[0.04] text-muted-foreground hover:text-foreground"
                    : "bg-brand text-white",
                )}
              >
                <option>All projects</option>
                {jobs.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : null}

            {crews.length > 1 ? (
              <select
                value={crew}
                onChange={(e) => setCrew(e.target.value)}
                aria-label="Filter by crew"
                className={cn(
                  "focus-ring h-[26px] max-w-[190px] cursor-pointer rounded-full px-2.5 text-[11.5px] font-medium outline-none transition-colors",
                  jobs.length > 1 ? "" : "ml-auto",
                  crew === "All crews"
                    ? "bg-foreground/[0.04] text-muted-foreground hover:text-foreground"
                    : "bg-brand text-white",
                )}
              >
                <option>All crews</option>
                {crews.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <ul className="max-h-[68vh] flex-1 overflow-y-auto p-1.5">
            {filtered.map((d) => {
              const active = selected?.id === d.id;
              return (
                <li key={d.id}>
                  <button
                    onClick={() => setSelectedId(d.id)}
                    className={cn(
                      "focus-ring w-full rounded-lg px-2.5 py-2.5 text-left transition-colors",
                      active ? "gold-rail" : "hover:bg-foreground/[0.03]",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                        {d.project}
                      </span>
                      {d.flags.length > 0 ? (
                        <AlertTriangle className={cn("size-3.5 shrink-0", toneStyles[d.tone].text)} />
                      ) : null}
                      <StatusPill label={d.status} tone={d.tone} className="shrink-0 text-[10px]" dot={false} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="truncate">{[d.subcontractor, d.crew].filter(Boolean).join(" · ")}</span>
                      <span className="num shrink-0">{formatFeet(d.totalFt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[10.5px] text-muted-foreground/70">
                      <span className="num">{d.sheetNumber}</span>
                      <span>{formatWhen(d.submittedAt)}</span>
                    </div>
                    {/* What this day is worth. Gross at our card; the margin
                        only appears once the filing sub's card is loaded, so a
                        missing rate reads as missing rather than as zero. */}
                    {d.billableAmount > 0 || d.unpricedCodes > 0 ? (
                      <div className="mt-1.5 flex items-center gap-2 border-t border-border/50 pt-1.5 text-[11px]">
                        <span className="num gold-figure font-semibold">
                          {formatCurrency(d.billableAmount)}
                        </span>
                        {d.grossMargin !== null ? (
                          <span
                            className={cn(
                              "num",
                              d.grossMargin > 0 ? "text-success" : "text-critical",
                            )}
                          >
                            {formatCurrency(d.grossMargin)} margin
                          </span>
                        ) : null}
                        {d.unpricedCodes > 0 ? (
                          <span className="ml-auto text-[10px] text-warning">
                            {d.unpricedCodes} unpriced
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="lg:col-span-7 xl:col-span-8">
        {selected ? (
          <DailyDetail
            daily={selected}
            onSetStatus={setStatus}
            sheet={sheetByDaily?.[selected.id]}
            reviewerName={reviewerName}
            canReview={canReview}
          />
        ) : (
          <Panel className="items-center justify-center py-24 text-center text-[13px] text-muted-foreground">
            No daily selected
          </Panel>
        )}
      </div>
    </div>
  );
}

function DailyDetail({
  daily: d,
  onSetStatus,
  sheet,
  reviewerName,
  canReview,
}: {
  daily: DailyReport;
  onSetStatus: (id: string, status: DailyStatus, tone: DailyReport["tone"]) => void;
  sheet?: { sheetId: string; projectId: string };
  reviewerName?: string;
  canReview: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [movingWeek, setMovingWeek] = React.useState(false);
  const [weekDate, setWeekDate] = React.useState("");
  /** Armed only after the server has said what the delete would take. */
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const decided = d.status === "Approved" || d.status === "Denied";

  // A different daily selected means a different decision — never carry a
  // half-typed reason across.
  React.useEffect(() => {
    setNote("");
    setError(null);
    setMovingWeek(false);
    setWeekDate("");
    setConfirmDelete(false);
  }, [d.id]);

  // Two presses, and the first one is a question to the server rather than a
  // guess in the browser: it comes back with what the delete would take off,
  // which is the only version of this warning worth showing.
  async function remove(force: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await deleteDaily(d.id, force);
    setBusy(false);
    if (res.ok) {
      setConfirmDelete(false);
      router.refresh();
      return;
    }
    setError(res.error);
    setConfirmDelete("needsConfirm" in res && Boolean(res.needsConfirm));
  }

  async function moveWeek(to: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await setDailyBillingWeek(d.id, to);
    setBusy(false);
    if (res.ok) {
      setMovingWeek(false);
      router.refresh();
    } else setError(res.error);
  }

  async function decide(decision: "APPROVED" | "DENIED") {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await reviewDaily({
      dailyId: d.id,
      decision,
      note,
      reviewedBy: reviewerName ?? "",
    });
    setBusy(false);
    if (res.ok) {
      onSetStatus(d.id, decision === "APPROVED" ? "Approved" : "Denied", decision === "APPROVED" ? "success" : "critical");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function reopen() {
    if (busy) return;
    setBusy(true);
    await reopenDailyReview(d.id);
    setBusy(false);
    onSetStatus(d.id, "In review", "warning");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel className="gold-rule">
        <PanelBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">{d.project}</h2>
                <StatusPill label={d.status} tone={d.tone} />
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {[d.customer, d.subcontractor, d.crew].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground/80">
                Sheet <span className="num">{d.sheetNumber}</span> · Work date {d.workDate} · submitted {formatWhen(d.submittedAt)}
              </p>
              {/* Which week this money lands in. Billing runs Saturday to
                  Friday, so the Friday is the fact that matters here — it is
                  what payment terms are counted from. */}
              {d.billingWeekEnd ? (
                <p className="mt-0.5 text-[11.5px]">
                  <span className="text-muted-foreground/80">Bills to week ending </span>
                  <span className={cn("num", d.billingWeekOverridden ? "font-semibold text-warning" : "text-muted-foreground/80")}>
                    {d.billingWeekEnd}
                  </span>
                  {d.billingWeekOverridden ? (
                    <span className="text-warning"> · moved by the office</span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="eyebrow text-gold">Billable</p>
              <p className="num gold-figure text-[20px] font-semibold tracking-[-0.02em]">
                {formatCurrency(d.billableAmount)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <DocChip label="Photos" ok={d.photos > 0} value={d.photos > 0 ? `${d.photos}` : "None"} icon={<Camera className="size-3.5" />} />
            <DocChip label="As-built" ok={d.hasAsBuilt} value={d.hasAsBuilt ? "Attached" : "Missing"} icon={<FileText className="size-3.5" />} />
            <DocChip label="Bore log" ok={d.hasBoreLog} value={d.hasBoreLog ? "Attached" : "N/A"} icon={<Ruler className="size-3.5" />} neutral={!d.hasBoreLog} />
          </div>
        </PanelBody>
      </Panel>

      {/* AI review */}
      <Panel className={cn(d.flags.length > 0 && toneStyles[d.tone].glow)}>
        <PanelHeader
          title="AI review"
          description={d.flags.length === 0 ? "No discrepancies detected" : `${d.flags.length} item${d.flags.length > 1 ? "s" : ""} for your team to review`}
          icon={<Sparkles className="size-3.5 text-brand-bright" />}
        />
        <PanelBody className="flex flex-col gap-2">
          {d.flags.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2.5 text-[12.5px] text-success">
              <Check className="size-4" />
              Quantities, documentation and unit codes all reconcile. Cleared for billing.
            </div>
          ) : (
            d.flags.map((f, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]",
                  toneStyles[f.tone].bg,
                  toneStyles[f.tone].border,
                  toneStyles[f.tone].text,
                )}
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{f.message}</span>
              </div>
            ))
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Nothing is approved automatically — the AI prepares, your team decides.
          </p>
        </PanelBody>
      </Panel>

      {/* When a daily came from a Globe sheet, that sheet is the record worth
          reviewing — the line items below are a summary of it, not the thing
          the crew filled in. */}
      {sheet ? (
        /* The whole panel is the link, not just the button on the end of it.
           On a narrow window the button sat off the right edge and the sheet
           was unreachable — a target you cannot hit is the same as no target,
           and this is the thing you open to check a day before approving it. */
        <Link
          href={`/dailies/sheet/${sheet.projectId}?sheet=${sheet.sheetId}`}
          className="focus-ring block rounded-2xl transition hover:brightness-110"
        >
          <Panel>
            <PanelBody className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">Globe billing sheet</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  The filled-in form and the day&apos;s redlined map, as submitted.
                </p>
              </div>
              <span
                className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white sm:w-auto"
              >
                <FileText className="size-4" /> Open billing sheet
              </span>
            </PanelBody>
          </Panel>
        </Link>
      ) : null}

      {/* Line items — the digital daily */}
      <Panel>
        <PanelHeader title="Line items" count={d.lineItems.length} icon={<MapPin className="size-3.5 text-gold" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:px-5">Location</th>
                <th className="px-4 py-2 font-medium">Unit code</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {d.lineItems.map((li, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="px-4 py-2.5 text-[12.5px] text-foreground sm:px-5">{li.location}</td>
                  <td className="px-4 py-2.5">
                    <span className="num rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[11.5px] font-semibold text-foreground ring-1 ring-inset ring-foreground/[0.06]">
                      {li.code}
                    </span>
                  </td>
                  <td className="num px-4 py-2.5 text-right text-[12.5px] font-medium text-foreground sm:px-5">
                    {formatNumber(li.quantity)} {li.unit}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70">
                <td className="px-4 py-2.5 text-[12px] font-medium text-muted-foreground sm:px-5" colSpan={2}>
                  Total footage
                </td>
                <td className="num px-4 py-2.5 text-right text-[13px] font-semibold text-foreground sm:px-5">
                  {formatFeet(d.totalFt)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Supervisor decision. Denials require a reason — "denied" with no
            explanation sends the crew back to guess what to fix.

            A crew sees the verdict and never the controls. Approving is a
            staff action and the server refuses it either way, so showing the
            buttons only produced a click that appeared to do nothing — which
            reads as broken rather than as forbidden. */}
        <div className="mt-auto flex flex-col gap-2 border-t border-border/70 px-4 py-3 sm:px-5">
          {!canReview ? (
            <div className="flex flex-wrap items-start gap-2">
              {decided ? (
                <>
                  <p
                    className={cn(
                      "text-[12.5px] font-medium",
                      d.status === "Approved" ? "text-success" : "text-critical",
                    )}
                  >
                    {d.status === "Approved"
                      ? "Approved by Fortitude"
                      : "Sent back by Fortitude"}
                    {d.reviewedAt ? ` · ${formatWhen(d.reviewedAt)}` : ""}
                  </p>
                  {d.reviewNote ? (
                    <p className="w-full whitespace-pre-wrap text-[12px] text-muted-foreground">
                      {d.reviewNote}
                    </p>
                  ) : null}
                  {d.status === "Approved" ? (
                    <p className="w-full text-[11.5px] text-muted-foreground">
                      It will appear on your next pay statement.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">
                  Filed and waiting on Fortitude to review it. You will see the
                  decision here, and the reason if anything needs changing.
                </p>
              )}
            </div>
          ) : decided ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[12.5px] font-medium",
                    d.status === "Approved" ? "text-success" : "text-critical",
                  )}
                >
                  {d.status === "Approved" ? "Approved" : "Denied"}
                  {d.reviewedBy ? ` by ${d.reviewedBy}` : ""}
                  {d.reviewedAt ? ` · ${formatWhen(d.reviewedAt)}` : ""}
                </p>
                {d.reviewNote ? (
                  <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">
                    {d.reviewNote}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void reopen()}
                  disabled={busy}
                  className="h-9 gap-1.5 rounded-lg text-[12.5px] font-medium"
                >
                  Reopen review
                </Button>
                <DeleteDaily
                  busy={busy}
                  armed={confirmDelete}
                  onAsk={() => void remove(false)}
                  onConfirm={() => void remove(true)}
                  onCancel={() => {
                    setConfirmDelete(false);
                    setError(null);
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Reason — required to deny, optional to approve"
                className="w-full resize-y rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              {error ? <p className="text-[12px] text-critical">{error}</p> : null}

              {/* Moving the billing week is an override, so it sits behind a
                  press rather than beside Approve — the rule should be what
                  happens when nobody does anything. */}
              {movingWeek ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/[0.05] px-2.5 py-2">
                  <span className="text-[11.5px] text-foreground">Bill this day to the week ending</span>
                  <input
                    type="date"
                    value={weekDate}
                    onChange={(e) => setWeekDate(e.target.value)}
                    className="focus-ring h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground"
                  />
                  <span className="text-[11px] text-muted-foreground">must be a Friday</span>
                  <button
                    type="button"
                    disabled={busy || !weekDate}
                    onClick={() => void moveWeek(weekDate)}
                    className="focus-ring h-8 rounded-lg bg-warning px-2.5 text-[12px] font-semibold text-black hover:opacity-90 disabled:opacity-40"
                  >
                    Move
                  </button>
                  {d.billingWeekOverridden ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void moveWeek("")}
                      className="focus-ring h-8 rounded-lg px-2 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      Put back on the rule
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setMovingWeek(false)}
                    className="focus-ring h-8 rounded-lg px-2 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {!movingWeek ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMovingWeek(true);
                    }}
                    className="focus-ring mr-auto h-9 rounded-lg px-2 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Move billing week
                  </button>
                ) : null}
                {!movingWeek ? (
                  <DeleteDaily
                    busy={busy}
                    armed={confirmDelete}
                    onAsk={() => void remove(false)}
                    onConfirm={() => void remove(true)}
                    onCancel={() => {
                      setConfirmDelete(false);
                      setError(null);
                    }}
                  />
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void decide("DENIED")}
                  disabled={busy}
                  className="h-9 gap-1.5 rounded-lg border-critical/30 bg-critical/10 text-[12.5px] font-medium text-critical hover:bg-critical/15"
                >
                  <X className="size-3.5" /> Deny
                </Button>
                <Button
                  size="sm"
                  onClick={() => void decide("APPROVED")}
                  disabled={busy}
                  className="h-9 gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-bright"
                >
                  <Check className="size-3.5" /> Approve daily
                </Button>
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

function DocChip({
  label,
  value,
  ok,
  icon,
  neutral,
}: {
  label: string;
  value: string;
  ok: boolean;
  icon: React.ReactNode;
  neutral?: boolean;
}) {
  const tone = neutral ? "neutral" : ok ? "success" : "critical";
  const s = toneStyles[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium", s.bg, s.border, s.text)}>
      {icon}
      <span className="text-muted-foreground">{label}:</span> {value}
    </span>
  );
}

/**
 * Removing a day.
 *
 * Two presses, and the first one asks the server rather than guessing in the
 * browser — it comes back naming the drafts the day is on and what happens to
 * the sheet, which is the only version of this warning worth reading. The
 * server refuses outright when the day is on something already sent, so the
 * confirm here can never be the thing that lets that through.
 */
function DeleteDaily({
  busy,
  armed,
  onAsk,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  armed: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!armed) {
    return (
      <button
        type="button"
        onClick={onAsk}
        disabled={busy}
        title="Delete this daily"
        className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-critical/50 hover:text-critical disabled:opacity-40"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-critical px-3 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        <Trash2 className="size-3.5" />
        {busy ? "Deleting…" : "Delete it"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="focus-ring h-9 rounded-lg px-2 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        Keep
      </button>
    </div>
  );
}
