"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  MapPin,
  Ruler,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import type { DailyReport, DailyStatus } from "@/lib/types";
import { formatCurrency, formatFeet, formatNumber, formatWhen, todayET } from "@/lib/format";
import { addDays } from "@/lib/billing";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { useT } from "@/components/layout/language-provider";
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

const SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  value: "Highest value",
  footage: "Most footage",
} as const;
type SortKey = keyof typeof SORTS;

/**
 * A day with something wrong with it.
 *
 * Deliberately broad. Every one of these is a reason the office ends up
 * chasing a crew weeks later — a flagged quantity, a code the card has never
 * heard of, a day with no footage and no explanation, or a day with nothing
 * photographed behind the number. Gathering them behind one filter is the
 * difference between reviewing a queue and remembering to look.
 */
function needsAttention(d: DailyReport): boolean {
  return (
    d.flags.length > 0 ||
    d.unpricedCodes > 0 ||
    d.totalFt === 0 ||
    d.photos === 0 ||
    !d.hasAsBuilt
  );
}

/** Why it needs attention, in the order somebody would want to hear it. */
function attentionReasons(d: DailyReport): string[] {
  const out: string[] = [];
  if (d.flags.length > 0) out.push(`${d.flags.length} flagged`);
  if (d.unpricedCodes > 0) out.push(`${d.unpricedCodes} unpriced`);
  if (d.totalFt === 0) out.push("no footage");
  if (d.photos === 0) out.push("no photos");
  if (!d.hasAsBuilt) out.push("no redline");
  return out;
}

/**
 * Which pile a day belongs in.
 *
 * By work date, not by when it was filed: the office asks "what did we build
 * yesterday", and a sheet typed up on Monday for Friday's work belongs with
 * Friday. ISO dates compare correctly as strings, so no parsing is needed.
 */
function bucketOf(workDate: string, today: string): string {
  if (!workDate) return "No work date";
  if (workDate === today) return "Today";
  if (workDate === addDays(today, -1)) return "Yesterday";
  if (workDate > addDays(today, -7)) return "This week";
  if (workDate > addDays(today, -30)) return "Earlier this month";
  return "Older";
}

const BUCKET_ORDER = ["Today", "Yesterday", "This week", "Earlier this month", "Older", "No work date"];

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
  const t = useT();
  const [items, setItems] = React.useState(dailies);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All");
  // Which day is open, or null for none. A row toggles rather than only
  // selecting, so a day you have finished with can be shut again.
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialId && dailies.some((d) => d.id === initialId) ? initialId : null,
  );

  const [crew, setCrew] = React.useState("All crews");
  const [job, setJob] = React.useState("All projects");
  const [sort, setSort] = React.useState<SortKey>("newest");
  const [onlyAttention, setOnlyAttention] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const today = todayET();

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

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = items.filter(
      (d) =>
        (filter === "All" || d.status === filter) &&
        (crew === "All crews" || (d.subcontractor || d.crew || "").trim() === crew) &&
        (job === "All projects" || (d.project || "").trim() === job) &&
        (!onlyAttention || needsAttention(d)) &&
        (q === "" ||
          [d.project, d.subcontractor, d.crew, d.roads, d.sheetNumber, d.customer]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
    const by: Record<SortKey, (a: DailyReport, b: DailyReport) => number> = {
      // Work date first, then filing time, so two days built on the same date
      // fall in the order they arrived rather than at random.
      newest: (a, b) =>
        b.workDate.localeCompare(a.workDate) || b.submittedAt.localeCompare(a.submittedAt),
      oldest: (a, b) =>
        a.workDate.localeCompare(b.workDate) || a.submittedAt.localeCompare(b.submittedAt),
      value: (a, b) => b.billableAmount - a.billableAmount,
      footage: (a, b) => b.totalFt - a.totalFt,
    };
    return [...kept].sort(by[sort]);
  }, [items, filter, crew, job, onlyAttention, sort, query]);

  /**
   * The list as day-headed groups.
   *
   * Only while the list is in date order. Sorted by value, a "Today" heading
   * over a row from three weeks ago is a lie about what is under it, so those
   * sorts render one flat run instead.
   */
  const groups = React.useMemo(() => {
    if (sort !== "newest" && sort !== "oldest") return [{ label: "", rows: filtered }];
    const byLabel = new Map<string, DailyReport[]>();
    for (const d of filtered) {
      const label = bucketOf(d.workDate, today);
      const held = byLabel.get(label);
      if (held) held.push(d);
      else byLabel.set(label, [d]);
    }
    const order = sort === "newest" ? BUCKET_ORDER : [...BUCKET_ORDER].reverse();
    return order.filter((l) => byLabel.has(l)).map((label) => ({ label, rows: byLabel.get(label)! }));
  }, [filtered, sort, today]);

  const attentionCount = React.useMemo(() => items.filter(needsAttention).length, [items]);
  // A day filtered out of the list closes with it. Selecting J&P's sheet
  // and then filtering to Gulf used to leave J&P's day open, which reads as
  // the filter having done nothing.
  const openId = filtered.some((d) => d.id === selectedId) ? selectedId : null;

  function setStatus(id: string, status: DailyStatus, tone: DailyReport["tone"]) {
    setItems((prev) => prev.map((d) => (d.id === id ? { ...d, status, tone } : d)));
  }

  const pending = items.filter((d) => d.status === "In review" || d.status === "Submitted").length;

  /**
   * Today, across every crew.
   *
   * This screen could tell you a sheet had arrived and nothing about the day
   * the company had just had. Footage and value were only reachable by opening
   * rows and adding them up in your head.
   */
  const todays = items.filter((d) => d.workDate === today);
  const stats = {
    pending,
    ft: todays.reduce((n, d) => n + d.totalFt, 0),
    value: todays.reduce((n, d) => n + d.billableAmount, 0),
    crews: new Set(todays.map((d) => (d.subcontractor || d.crew || "").trim()).filter(Boolean)).size,
  };

  return (
    <div className="flex flex-col gap-3">
      <Overview stats={stats} total={items.length} t={t} />

      <Panel>
        <PanelHeader
          title={t("Daily billing sheets")}
          description={`${pending} ${t("NEED REVIEW")} · ${items.length} ${t("filed")}`}
          count={filtered.length}
          icon={<ClipboardList className="size-3.5 text-gold" />}
        />

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 p-2.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "focus-ring rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                filter === f
                  ? "bg-brand text-white"
                  : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
              )}
            >
              {t(f)}
            </button>
          ))}

          {/* Everything the office would otherwise have to remember to look
              for, behind one switch: a flagged quantity, a code the card has
              never heard of, a day with no footage, a day with nothing
              photographed behind the number. */}
          {attentionCount > 0 ? (
            <button
              onClick={() => setOnlyAttention((v) => !v)}
              className={cn(
                "focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
                onlyAttention
                  ? "bg-warning text-black"
                  : "bg-warning/15 text-warning hover:bg-warning/25",
              )}
            >
              <AlertTriangle className="size-3" />
              {t("Needs attention")}
              <span className="num">{attentionCount}</span>
            </button>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {jobs.length > 1 ? (
              <select
                value={job}
                onChange={(e) => setJob(e.target.value)}
                aria-label={t("Filter by project")}
                className={cn(
                  "focus-ring h-[28px] max-w-[190px] cursor-pointer rounded-full px-2.5 text-[12px] font-medium outline-none transition-colors",
                  job === "All projects"
                    ? "bg-foreground/[0.04] text-muted-foreground hover:text-foreground"
                    : "bg-brand text-white",
                )}
              >
                <option>{t("All projects")}</option>
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
                aria-label={t("Filter by crew")}
                className={cn(
                  "focus-ring h-[28px] max-w-[190px] cursor-pointer rounded-full px-2.5 text-[12px] font-medium outline-none transition-colors",
                  crew === "All crews"
                    ? "bg-foreground/[0.04] text-muted-foreground hover:text-foreground"
                    : "bg-brand text-white",
                )}
              >
                <option>{t("All crews")}</option>
                {crews.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : null}

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label={t("Sort dailies")}
              className="focus-ring h-[28px] cursor-pointer rounded-full bg-foreground/[0.05] px-2.5 text-[12px] font-medium text-foreground outline-none"
            >
              {Object.entries(SORTS).map(([k, label]) => (
                <option key={k} value={k}>
                  {t(label)}
                </option>
              ))}
            </select>

            {/* A crew name, a road, a sheet number. Twenty-one rows is already
                past what anyone reads down, and the filters above only narrow
                by things the office thought to make a filter for. */}
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search dailies…")}
                aria-label={t("Search dailies")}
                className="focus-ring h-[28px] w-[180px] rounded-full bg-foreground/[0.05] pl-7 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/70"
              />
            </label>
          </div>
        </div>

        {/* The queue itself, full width.
            It used to be a narrow column beside a permanent detail panel, so
            every row was squeezed into a third of the screen while most of the
            screen showed one day. Reviewing is scanning first — the list gets
            the width, and the day being decided opens underneath its own row
            rather than across the page from it. */}
        <ul className="flex flex-col">
          {groups.map((g) => (
            <li key={g.label || "all"}>
              {g.label ? (
                <p className="sticky top-0 z-20 flex items-baseline gap-2 border-b border-border/60 bg-card/95 px-3 py-2 backdrop-blur">
                  <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-foreground">
                    {t(g.label)}
                  </span>
                  <span className="num text-[11.5px] text-muted-foreground">
                    {g.rows.length} {g.rows.length === 1 ? t("daily") : t("dailies")}
                  </span>
                  <span className="num ml-auto gold-figure text-[12px] font-semibold">
                    {formatFeet(g.rows.reduce((n, r) => n + r.totalFt, 0))}
                  </span>
                  <span className="num gold-figure text-[12px] font-semibold">
                    {formatCurrency(g.rows.reduce((n, r) => n + r.billableAmount, 0))}
                  </span>
                </p>
              ) : null}

              <ul>
                {g.rows.map((d) => {
                  const open = openId === d.id;
                  const reasons = attentionReasons(d);
                  return (
                    <li
                      key={d.id}
                      className={cn(
                        "border-b border-border/50 last:border-0",
                        open && "bg-foreground/[0.02]",
                      )}
                    >
                      <button
                        // Toggling rather than only selecting: a row that
                        // opens and cannot be shut leaves the reviewer
                        // scrolling past a day they have finished with.
                        onClick={() => setSelectedId(open ? null : d.id)}
                        aria-expanded={open}
                        className={cn(
                          "focus-ring group/row flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 text-left transition-colors",
                          open ? "gold-rail" : "hover:bg-foreground/[0.03]",
                        )}
                      >
                        <FileText
                          className={cn(
                            "hidden size-8 shrink-0 rounded-lg bg-foreground/[0.05] p-1.5 sm:block",
                            open ? "text-gold" : "text-muted-foreground",
                          )}
                        />

                        {/* Who and where. */}
                        <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                          <span className="truncate text-[14.5px] font-semibold text-foreground">
                            {d.project}
                          </span>
                          <span className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
                            <span className="truncate font-semibold text-cyan">
                              {d.subcontractor}
                            </span>
                            {d.crew ? (
                              <span className="num shrink-0 rounded bg-foreground/[0.06] px-1.5 py-px text-[10px] text-muted-foreground">
                                {d.crew}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "flex items-center gap-1.5 truncate text-[12.5px]",
                              d.roads ? "font-medium text-gold" : "text-muted-foreground/70",
                            )}
                          >
                            <MapPin className="size-3.5 shrink-0" />
                            {d.roads || t("No road recorded")}
                          </span>
                        </span>

                        {/* The two numbers the day is judged on. */}
                        <span className="flex w-[104px] shrink-0 flex-col">
                          <span className="num gold-figure text-[19px] font-bold leading-none tracking-[-0.02em]">
                            {formatFeet(d.totalFt)}
                          </span>
                          <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
                            {t("Production")}
                          </span>
                        </span>

                        <span className="flex w-[104px] shrink-0 flex-col">
                          <span className="num gold-figure text-[17px] font-semibold leading-none">
                            {formatCurrency(d.billableAmount)}
                          </span>
                          <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
                            {t("Est. value")}
                          </span>
                        </span>

                        <span className="hidden w-[150px] shrink-0 flex-col lg:flex">
                          <span className="text-[12.5px] text-foreground/85">
                            {formatWhen(d.submittedAt)}
                          </span>
                          <span className="num mt-1 text-[11px] text-muted-foreground">
                            {d.sheetNumber}
                          </span>
                        </span>

                        {/* Status, and why this one is worth opening. */}
                        <span className="flex w-[186px] shrink-0 flex-col gap-1">
                          <StatusPill
                            label={t(d.status)}
                            tone={d.tone}
                            className="w-fit text-[11px]"
                            dot={false}
                          />
                          {reasons.length > 0 ? (
                            <span className="flex items-start gap-1.5 text-[11px] font-medium text-warning">
                              <AlertTriangle className="mt-px size-3 shrink-0" />
                              <span className="min-w-0">{reasons.join(" · ")}</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[11px] text-success">
                              <Check className="size-3 shrink-0" />
                              {t("AI check complete")}
                            </span>
                          )}
                        </span>

                        <span
                          className={cn(
                            "ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
                            open
                              ? "bg-brand text-white"
                              : "border border-border text-foreground group-hover/row:border-brand/60",
                          )}
                        >
                          {d.status === "Approved" || d.status === "Denied"
                            ? t("View")
                            : t("Review")}
                          <ChevronDown
                            className={cn("size-3.5 transition-transform", open && "rotate-180")}
                          />
                        </span>
                      </button>

                      {/* Everything about the day, under the day.
                          Its own row is the context — which is what a detail
                          panel across the page from a narrow list never had,
                          and why people lost track of which one they had
                          opened. */}
                      {open ? (
                        <div className="border-t border-border/60 bg-background/40 px-3 py-3">
                          <DailyDetail
                            daily={d}
                            onSetStatus={setStatus}
                            sheet={sheetByDaily?.[d.id]}
                            reviewerName={reviewerName}
                            canReview={canReview}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}

          {filtered.length === 0 ? (
            <li className="px-3 py-14 text-center text-[13px] text-muted-foreground">
              <ClipboardList className="mx-auto mb-2 size-7 opacity-40" />
              {t("Nothing matches these filters.")}
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * Today's numbers, above the queue.
 *
 * Four figures rather than a paragraph. The count of days waiting is the one
 * that decides whether anybody opens this screen at all, so it leads and it is
 * coloured by whether there is anything to do.
 */
function Overview({
  stats,
  total,
  t,
}: {
  stats: { pending: number; ft: number; value: number; crews: number };
  total: number;
  t: (s: string) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Stat
        value={String(stats.pending)}
        label={t("Need review")}
        note={`${t("out of")} ${total} ${t("filed")}`}
        tone={stats.pending > 0 ? "brand" : "muted"}
      />
      {/* A bare zero beside "across every crew" reads as a broken figure.
          Nothing filed yet is a normal state at 7am and it should say so. */}
      <Stat
        value={formatFeet(stats.ft)}
        label={t("Production today")}
        note={stats.crews === 0 ? t("nothing filed for today yet") : t("across every crew")}
        tone="gold"
      />
      <Stat
        value={formatCurrency(stats.value)}
        label={t("Value today")}
        note={stats.crews === 0 ? t("nothing filed for today yet") : t("gross at our card")}
        tone="gold"
      />
      <Stat
        value={String(stats.crews)}
        label={t("Crews today")}
        note={stats.crews === 0 ? t("nothing filed yet") : t("filed a day")}
        tone="muted"
      />
    </div>
  );
}

function Stat({
  value,
  label,
  note,
  tone,
}: {
  value: string;
  label: string;
  note: string;
  tone: "brand" | "gold" | "muted";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3",
        tone === "brand" && "border-brand/40 bg-brand/[0.07]",
        tone === "gold" && "border-gold/35 bg-gold/[0.06]",
        tone === "muted" && "border-border bg-foreground/[0.02]",
      )}
    >
      <p
        className={cn(
          "num text-[24px] font-bold leading-none tracking-[-0.02em]",
          tone === "gold" ? "gold-figure" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/85">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
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
  const t = useT();
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
                <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-foreground">{d.project}</h2>
                <StatusPill label={t(d.status)} tone={d.tone} />
              </div>
              {/* The same three colours as the list row it was opened from,
                  so the eye lands on the crew in both places. */}
              <p className="mt-1 text-[13.5px] text-foreground">
                {d.customer ? <span>{d.customer} · </span> : null}
                <span className="font-semibold text-cyan">{d.subcontractor}</span>
                {d.crew ? <span className="text-foreground/60"> · {d.crew}</span> : null}
              </p>
              <p className="mt-1 text-[12.5px] text-foreground/80">
                {t("Sheet")} <span className="num">{d.sheetNumber}</span> · {t("Work date")} {d.workDate} · {t("submitted")} {formatWhen(d.submittedAt)}
                {d.roads ? (
                  <>
                    <br />
                    <span className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-gold">
                      <MapPin className="size-4" />
                      {d.roads}
                    </span>
                  </>
                ) : null}
              </p>
              {/* Which week this money lands in. Billing runs Saturday to
                  Friday, so the Friday is the fact that matters here — it is
                  what payment terms are counted from. */}
              {d.billingWeekEnd ? (
                <p className="mt-1 text-[12.5px]">
                  <span className="text-foreground/80">{t("Bills to week ending ")}</span>
                  <span className={cn("num", d.billingWeekOverridden ? "font-semibold text-warning" : "text-foreground/80")}>
                    {d.billingWeekEnd}
                  </span>
                  {d.billingWeekOverridden ? (
                    <span className="text-warning"> · {t("moved by the office")}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="eyebrow text-gold">{t("Billable")}</p>
              <p className="num gold-figure text-[20px] font-semibold tracking-[-0.02em]">
                {formatCurrency(d.billableAmount)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <DocChip label={t("Photos")} ok={d.photos > 0} value={d.photos > 0 ? `${d.photos}` : t("None")} icon={<Camera className="size-3.5" />} />
            <DocChip label={t("As-built")} ok={d.hasAsBuilt} value={d.hasAsBuilt ? t("Attached") : t("Missing")} icon={<FileText className="size-3.5" />} />
            <DocChip label={t("Bore log")} ok={d.hasBoreLog} value={d.hasBoreLog ? t("Attached") : "N/A"} icon={<Ruler className="size-3.5" />} neutral={!d.hasBoreLog} />
          </div>
        </PanelBody>
      </Panel>

      {/* AI review */}
      <Panel className={cn(d.flags.length > 0 && toneStyles[d.tone].glow)}>
        <PanelHeader
          title={t("AI review")}
          description={
            d.flags.length === 0
              ? t("No discrepancies detected")
              : `${d.flags.length} ${t("for your team to review")}`
          }
          icon={<Sparkles className="size-3.5 text-brand-bright" />}
        />
        <PanelBody className="flex flex-col gap-2">
          {/* What the AI actually checked, line by line.
              "No discrepancies detected" tells a reviewer the machine ran; it
              does not tell them what it looked at, so they open the daily to
              find out — which is the work the check was supposed to save. Four
              named checks, each pass or fail, answers the question the reviewer
              is really asking: is there a reason to open this one. */}
          <ul className="flex flex-col gap-1.5">
            <AiCheck
              ok={d.unpricedCodes === 0}
              label={t("Units matched the rate card")}
              fail={`${d.unpricedCodes} ${t("code(s) the card has never heard of — those quantities bill nothing")}`}
            />
            <AiCheck
              ok={d.totalFt > 0}
              label={t("Footage reconciled")}
              fail={t("No footage on this day — a zero day needs a note saying why")}
            />
            <AiCheck
              ok={d.flags.length === 0}
              label={t("Quantities verified")}
              fail={`${d.flags.length} ${t("quantity flagged below")}`}
            />
            <AiCheck
              ok={d.photos > 0 && d.hasAsBuilt}
              label={t("Required documentation attached")}
              fail={[
                d.photos === 0 ? t("no field photos") : null,
                !d.hasAsBuilt ? t("no redline or as-built") : null,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          </ul>

          {d.flags.length > 0
            ? d.flags.map((f, i) => (
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
            : null}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("Nothing is approved automatically — the AI prepares, your team decides.")}
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
                <p className="text-[13px] font-medium text-foreground">{t("Globe billing sheet")}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {t("The filled-in form and the day's redlined map, as submitted.")}
                </p>
              </div>
              <span
                className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white sm:w-auto"
              >
                <FileText className="size-4" /> {t("Open billing sheet")}
              </span>
            </PanelBody>
          </Panel>
        </Link>
      ) : null}

      {/* Line items — the digital daily */}
      <Panel>
        <PanelHeader title={t("Line items")} count={d.lineItems.length} icon={<MapPin className="size-3.5 text-gold" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:px-5">{t("Location")}</th>
                <th className="px-4 py-2 font-medium">{t("Unit code")}</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">{t("Quantity")}</th>
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

/**
 * One line of the AI check.
 *
 * A tick or a cross and the reason. The reason is the part that matters — a
 * cross with nothing beside it sends the reviewer into the daily to find out
 * what is wrong, which is the trip this panel exists to save.
 */
function AiCheck({ ok, label, fail }: { ok: boolean; label: string; fail: string }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]",
        ok
          ? "border-success/25 bg-success/[0.07] text-success"
          : "border-warning/35 bg-warning/[0.07] text-warning",
      )}
    >
      {ok ? (
        <Check className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      )}
      <span className="min-w-0">
        <span className={cn(ok ? "" : "font-semibold")}>{label}</span>
        {!ok && fail ? (
          <span className="block text-[11.5px] opacity-90">{fail}</span>
        ) : null}
      </span>
    </li>
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
