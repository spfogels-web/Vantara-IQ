"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Coins,
  ExternalLink,
  Image as ImageIcon,
  Check,
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
import type { DailyReport, DailyStatus, Tone } from "@/lib/types";
import { formatCurrency, formatFeet, formatNumber, formatWhen, todayET } from "@/lib/format";
import { addDays } from "@/lib/billing";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { useT } from "@/components/layout/language-provider";
import { useOrgName } from "@/components/layout/org-provider";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { deleteDaily, reopenDailyReview, reviewDaily, setDailyBillingWeek } from "@/app/actions";

/**
 * What the queue can be narrowed to.
 *
 * This was an array the chips were rendered from. The tabs render from
 * TABS now — which carries its own counts and the "Need review" bucket that
 * is not a status at all — so the array was left describing a row of buttons
 * that no longer existed, and only its element type was still read.
 */
type Filter = DailyStatus | "All";

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
  thumbs,
  reviewerName,
  canReview = false,
}: {
  dailies: DailyReport[];
  initialId?: string;
  /** dailyId -> { sheetId, projectId }, for dailies that came from a Globe sheet. */
  sheetByDaily?: Record<string, { sheetId: string; projectId: string }>;
  /**
   * sheetId -> a few photo urls and how many there are in total.
   *
   * Fetched once for the whole page rather than per row — see
   * getDailyThumbnails. Absent for a daily that has none, or whose photos
   * pre-date the evidence records, and the row then shows the count it always
   * had rather than nothing at all.
   */
  thumbs?: Record<string, { urls: string[]; total: number }>;
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
  const [filter, setFilter] = React.useState<Filter>("All");
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

  /**
   * The four figures the office opens this page for.
   *
   * Computed over what is actually on screen rather than over everything ever
   * filed, so narrowing to one crew narrows the numbers with it — a total that
   * ignores the filter above it is a total nobody can act on. Value is the
   * customer figure the rate card already produced; nothing here prices
   * anything.
   */
  const kpi = React.useMemo(() => {
    const approved = filtered.filter((d) => d.status === "Approved");
    return {
      needReview: filtered.filter(needsAttention).length,
      approved: approved.length,
      feet: filtered.reduce((n, d) => n + (d.totalFt || 0), 0),
      value: filtered.reduce((n, d) => n + (d.billableAmount || 0), 0),
      unpriced: filtered.reduce((n, d) => n + (d.unpricedCodes || 0), 0),
    };
  }, [filtered]);

  const open = openId ? filtered.find((d) => d.id === openId) ?? null : null;

  return (
    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* ── What the day looks like, in four numbers ─────────────── */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Kpi
            accent="blue"
            icon={<ClipboardList className="size-4" />}
            label={t("Need review")}
            value={String(kpi.needReview)}
            note={
              kpi.needReview
                ? t("of {n} shown").replace("{n}", String(filtered.length))
                : t("nothing waiting")
            }
            tone={kpi.needReview ? "caution" : "positive"}
          />
          <Kpi
            accent="green"
            icon={<CheckCircle2 className="size-4" />}
            label={t("Approved")}
            value={String(kpi.approved)}
            note={t("in this view")}
            tone="positive"
          />
          <Kpi
            accent="cyan"
            icon={<Ruler className="size-4" />}
            label={t("Production")}
            value={kpi.feet ? formatFeet(kpi.feet) : "—"}
            note={
              kpi.feet
                ? t("across {n} dailies").replace("{n}", String(filtered.length))
                : t("no footage in this view")
            }
            tone="neutral"
          />
          <Kpi
            accent="violet"
            icon={<Coins className="size-4" />}
            label={t("Est. value")}
            value={kpi.value ? formatCurrency(kpi.value) : "—"}
            note={
              kpi.unpriced
                ? t("{n} codes unpriced").replace("{n}", String(kpi.unpriced))
                : t("at the customer's rates")
            }
            tone={kpi.unpriced ? "caution" : "neutral"}
          />
        </div>

        {/* ── The queue ────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-border/60 bg-foreground/[0.015]">
          {/* Status tabs. Every status the application actually stores —
              Draft and Flagged included, because a daily in one of them is
              still a daily somebody has to deal with, and dropping it from
              the list is how it gets forgotten. "Need review" is derived, not
              stored: it is the set that needs a person, whatever status they
              are sitting in. */}
          <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-2.5 py-2">
            {TABS.map((f) => {
              const n =
                f === "All"
                  ? items.length
                  : f === "Need review"
                    ? attentionCount
                    : items.filter((d) => d.status === f).length;
              const active = f === "Need review" ? onlyAttention : !onlyAttention && filter === f;
              if (n === 0 && f !== "All" && f !== "Need review") return null;
              return (
                <button
                  key={f}
                  onClick={() => {
                    if (f === "Need review") {
                      setOnlyAttention(true);
                      setFilter("All");
                    } else {
                      setOnlyAttention(false);
                      setFilter(f as Filter);
                    }
                  }}
                  className={cn(
                    "focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                    active
                      ? "bg-brand/15 text-brand-bright ring-1 ring-inset ring-brand/30"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                    f === "Need review" && !active && n > 0 && "text-warning",
                  )}
                >
                  {f === "Need review" && n > 0 ? <AlertTriangle className="size-3" /> : null}
                  {t(f)}
                  <span
                    className={cn(
                      "num text-[11px]",
                      active ? "text-brand-bright/80" : "text-muted-foreground/70",
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search and the three narrowings that matter. All of them act on
              the same list the numbers above are computed from. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-2.5 py-2">
            <label className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search by project, crew, sheet # or road…")}
                className="focus-ring h-8 w-full rounded-lg border border-border/60 bg-foreground/[0.03] pl-8 pr-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70"
              />
            </label>

            <select
              value={job}
              onChange={(e) => setJob(e.target.value)}
              aria-label={t("Filter by project")}
              className="focus-ring h-8 max-w-[200px] rounded-lg border border-border/60 bg-foreground/[0.03] px-2 text-[12.5px] text-foreground outline-none"
            >
              <option>{t("All projects")}</option>
              {jobs.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>

            {crews.length > 1 ? (
              <select
                value={crew}
                onChange={(e) => setCrew(e.target.value)}
                aria-label={t("Filter by crew")}
                className="focus-ring h-8 max-w-[190px] rounded-lg border border-border/60 bg-foreground/[0.03] px-2 text-[12.5px] text-foreground outline-none"
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
              className="focus-ring h-8 rounded-lg border border-border/60 bg-foreground/[0.03] px-2 text-[12.5px] text-foreground outline-none"
            >
              {Object.entries(SORTS).map(([k, label]) => (
                <option key={k} value={k}>
                  {t(label)}
                </option>
              ))}
            </select>
          </div>

          {/* ── The table ──────────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <ClipboardList className="mx-auto size-6 text-muted-foreground/40" />
              <p className="mt-2 text-[13px] font-medium text-foreground">
                {onlyAttention ? t("Nothing needs review") : t("No dailies here")}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {onlyAttention
                  ? t("Everything filed has been looked at.")
                  : t("Nothing matches these filters yet.")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-left">
                    {[
                      t("Project / location"),
                      t("Sheet #"),
                      t("Date"),
                      t("Production"),
                      t("Est. value"),
                      t("Status"),
                      t("Crew"),
                      t("Photos"),
                      "",
                    ].map((h, i) => (
                      <th
                        key={h + i}
                        className={cn(
                          "eyebrow whitespace-nowrap px-3 py-2 text-[10px]",
                          (i === 3 || i === 4) && "text-right",
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.label || "all"}>
                    {g.label ? (
                      <tr>
                        <td colSpan={9} className="bg-foreground/[0.02] px-3 py-1.5">
                          <span className="eyebrow text-[10px]">{t(g.label)}</span>
                          <span className="num ml-2 text-[11px] text-muted-foreground">
                            {formatFeet(g.rows.reduce((n, d) => n + (d.totalFt || 0), 0))}
                            <span className="px-1.5 text-muted-foreground/40">·</span>
                            {formatCurrency(g.rows.reduce((n, d) => n + (d.billableAmount || 0), 0))}
                          </span>
                        </td>
                      </tr>
                    ) : null}
                    {g.rows.map((d) => {
                      const on = openId === d.id;
                      const why = attentionReasons(d);
                      const shot = thumbs?.[sheetByDaily?.[d.id]?.sheetId ?? ""];
                      return (
                        <tr
                          key={d.id}
                          onClick={() => setSelectedId(on ? null : d.id)}
                          className={cn(
                            "cursor-pointer border-b border-border/40 transition-colors",
                            on ? "bg-brand/[0.07]" : "hover:bg-foreground/[0.03]",
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <p className="truncate text-[13px] font-semibold text-foreground">
                              {d.project}
                            </p>
                            <p className="truncate text-[11.5px] text-muted-foreground">
                              {d.subcontractor || d.crew}
                              {d.roads ? (
                                <>
                                  <span className="px-1.5 text-muted-foreground/40">·</span>
                                  {d.roads}
                                </>
                              ) : null}
                            </p>
                          </td>
                          <td className="num whitespace-nowrap px-3 py-2.5 text-[12px] text-muted-foreground">
                            {d.sheetNumber || "—"}
                          </td>
                          <td className="num whitespace-nowrap px-3 py-2.5 text-[12px] text-muted-foreground">
                            {d.workDate}
                          </td>
                          <td className="num whitespace-nowrap px-3 py-2.5 text-right text-[12.5px] font-semibold text-foreground">
                            {d.totalFt ? formatFeet(d.totalFt) : "—"}
                          </td>
                          <td className="num whitespace-nowrap px-3 py-2.5 text-right text-[12.5px] font-semibold text-foreground">
                            {d.billableAmount ? formatCurrency(d.billableAmount) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusPill label={t(d.status)} tone={d.tone} className="text-[10px]" />
                            {why.length ? (
                              <span
                                title={why.join(" · ")}
                                className="ml-1.5 inline-flex items-center gap-1 text-[10.5px] text-warning"
                              >
                                <AlertTriangle className="size-3" />
                                {why.length}
                              </span>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-muted-foreground">
                            {d.crew || "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <Thumbs shot={shot} count={d.photos} />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-[11.5px] font-medium text-brand-bright">
                              {on ? t("Close") : d.status === "Approved" || d.status === "Denied" ? t("View") : t("Review")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </div>

        {/* ── The day itself ───────────────────────────────────────── */}
        {open ? (
          <DailyWorkspace
            d={open}
            t={t}
            canReview={canReview}
            reviewerName={reviewerName}
            sheet={sheetByDaily?.[open.id]}
            shot={thumbs?.[sheetByDaily?.[open.id]?.sheetId ?? ""]}
            onClose={() => setSelectedId(null)}
            onSetStatus={setStatus}
          />
        ) : null}
      </div>

      {/* ── The rail. Below the table on anything narrower. ────────── */}
      <aside className="flex w-full flex-col gap-3 2xl:w-[300px] 2xl:shrink-0">
        <AiPanel t={t} />
        <QuickActions t={t} />
        <ActivityPanel d={open} t={t} />
      </aside>
    </div>
  );
}


/*
 * Overview and Stat used to live here.
 *
 * They were four tiles fixed to today: days waiting, footage, value and
 * crews. The redesign's tiles are computed over whatever the queue is
 * currently showing instead, so narrowing to one crew narrows the numbers
 * with it — see Kpi. Keeping the old pair around would have left two
 * tile designs and two definitions of the same four figures.
 */

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
  const orgName = useOrgName();
  // Translated with the company as a placeholder rather than baked into the
  // sentence, so the Spanish reads correctly and the name stays this
  // organisation's own.
  const approvedLabel = t("Approved by {company}").replace("{company}", orgName);
  const sentBackLabel = t("Sent back by {company}").replace("{company}", orgName);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [movingWeek, setMovingWeek] = React.useState(false);
  const [weekDate, setWeekDate] = React.useState("");
  /** Armed only after the server has said what the delete would take. */
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const decided = d.status === "Approved" || d.status === "Denied";

  /**
   * The four checks below, as data, so the heading can count them.
   *
   * The heading used to read off `flags` alone, which meant a day with no
   * photographs and no as-built announced "No discrepancies detected" while
   * the list directly underneath it showed that check failing — and the row
   * in the table, which has always counted documentation, showed a warning
   * against the same day. A reviewer trusting the heading skips exactly the
   * daily somebody needs to chase. One source, three places.
   */
  const checks = [
    {
      ok: d.unpricedCodes === 0,
      label: t("Units matched the rate card"),
      fail: `${d.unpricedCodes} ${t("code(s) the card has never heard of — those quantities bill nothing")}`,
    },
    {
      ok: d.totalFt > 0,
      label: t("Footage reconciled"),
      fail: t("No footage on this day — a zero day needs a note saying why"),
    },
    {
      ok: d.flags.length === 0,
      label: t("Quantities verified"),
      fail: `${d.flags.length} ${t("quantity flagged below")}`,
    },
    {
      ok: d.photos > 0 && d.hasAsBuilt,
      label: t("Required documentation attached"),
      fail: [
        d.photos === 0 ? t("no field photos") : null,
        !d.hasAsBuilt ? t("no redline or as-built") : null,
      ]
        .filter(Boolean)
        .join(", "),
    },
  ];
  const failed = checks.filter((c) => !c.ok).length;

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
                <span className="font-semibold text-brand">{d.subcontractor}</span>
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
                  {/* Two different reasons this is not the week you would
                      expect, and a crew is owed the difference between them. */}
                  {d.billingWeekLate ? (
                    <span className="text-warning">
                      {" "}
                      · {t("filed after the Friday cutoff, so it bills next week")}
                    </span>
                  ) : d.billingWeekOverridden ? (
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
      <Panel className={cn(failed > 0 && toneStyles[d.tone].glow)}>
        <PanelHeader
          title={t("AI review")}
          description={
            failed === 0
              ? t("No discrepancies detected")
              : `${failed} ${t("for your team to review")}`
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
            {checks.map((c) => (
              <AiCheck key={c.label} ok={c.ok} label={c.label} fail={c.fail} />
            ))}
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
                <p className="text-[13px] font-medium text-foreground">{d.customer ? t("{customer} billing sheet").replace("{customer}", d.customer) : t("Billing sheet")}</p>
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
                      ? approvedLabel
                      : sentBackLabel}
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
                  Filed and waiting on {orgName} to review it. You will see the
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

/** The status tabs. Every status the application stores, plus the derived one. */
const TABS = [
  "All",
  "Need review",
  "Draft",
  "Submitted",
  "In review",
  "Approved",
  "Denied",
  "Flagged",
] as const;

/** One of the four figures above the queue. */
function Kpi({
  icon,
  label,
  value,
  note,
  accent,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  accent: "blue" | "green" | "cyan" | "violet";
  tone: "neutral" | "positive" | "caution";
}) {
  return (
    <div
      style={{ ["--accent" as string]: `var(--vq-${accent})` }}
      className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--accent)_32%,transparent)] bg-[color-mix(in_oklab,var(--accent)_13%,transparent)] text-[var(--accent)]">
          {icon}
        </span>
        <span className="eyebrow truncate text-[10.5px]">{label}</span>
      </div>
      <p
        className={cn(
          "num mt-2 text-[24px] font-bold tracking-[-0.02em]",
          tone === "positive"
            ? "text-success"
            : tone === "caution"
              ? "text-warning"
              : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * Up to three photographs from the day, and a count of the rest.
 *
 * Drawn at the size they are displayed rather than at the size they were
 * taken: a phone photograph is several megabytes and there may be a hundred
 * rows, so the browser is told to fetch them lazily and decode them
 * asynchronously. Where a URL cannot be resolved the row falls back to the
 * count it always had rather than losing the information entirely.
 */
function Thumbs({ shot, count }: { shot?: { urls: string[]; total: number }; count: number }) {
  if (!shot?.urls.length) {
    return count > 0 ? (
      <span className="num inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
        <ImageIcon className="size-3.5" />
        {count}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[11px] text-warning/80" title="No field photos">
        <AlertTriangle className="size-3" />
        none
      </span>
    );
  }
  const more = Math.max(0, (shot.total || count) - shot.urls.length);
  return (
    <span className="flex items-center gap-1">
      {shot.urls.map((u) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={u}
          src={u}
          alt=""
          loading="lazy"
          decoding="async"
          width={36}
          height={36}
          className="size-9 shrink-0 rounded border border-border/60 object-cover"
        />
      ))}
      {more > 0 ? (
        <span className="num grid size-9 shrink-0 place-items-center rounded border border-border/60 bg-foreground/[0.04] text-[10.5px] text-muted-foreground">
          +{more}
        </span>
      ) : null}
    </span>
  );
}

/** The sections of a selected daily. Only what the application can answer. */
const SECTIONS = [
  { id: "overview", label: "Overview", icon: ClipboardList },
  { id: "photos", label: "Photos & media", icon: Camera },
  { id: "crew", label: "Crew & notes", icon: MapPin },
] as const;

/**
 * One daily, opened underneath the queue.
 *
 * The detail itself is the component that has always rendered it —
 * `DailyDetail` holds the line items, the rate columns, the approve and deny
 * decisions and the billing week, and none of that is re-implemented here.
 * What is new is the frame: a header that says what this day is, and a rail
 * that lets somebody move between what the day produced, what was
 * photographed, and who did it, without scrolling past all three.
 */
function DailyWorkspace({
  d,
  t,
  canReview,
  reviewerName,
  sheet,
  shot,
  onClose,
  onSetStatus,
}: {
  d: DailyReport;
  t: (s: string) => string;
  canReview: boolean;
  reviewerName?: string;
  sheet?: { sheetId: string; projectId: string };
  shot?: { urls: string[]; total: number };
  onClose: () => void;
  onSetStatus: (id: string, status: DailyStatus, tone: DailyReport["tone"]) => void;
}) {
  const [section, setSection] = React.useState<(typeof SECTIONS)[number]["id"]>("overview");
  const why = attentionReasons(d);

  return (
    <div className="overflow-hidden rounded-xl border border-brand/30 bg-foreground/[0.02]">
      {/* Who, what, when — before anything asks to be read. */}
      <div className="flex flex-wrap items-start gap-3 border-b border-border/60 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
              {d.project}
            </h2>
            <StatusPill label={t(d.status)} tone={d.tone} className="text-[10px]" />
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {d.subcontractor || d.crew}
            {d.sheetNumber ? (
              <>
                <span className="px-1.5 text-muted-foreground/40">·</span>
                {t("Sheet")} {d.sheetNumber}
              </>
            ) : null}
            <span className="px-1.5 text-muted-foreground/40">·</span>
            {formatWhen(d.submittedAt)}
          </p>
          {d.roads ? (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-brand-bright">
              <MapPin className="size-3" /> {d.roads}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {sheet ? (
            <>
              <a
                href={`/api/daily-sheet/${sheet.sheetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <FileText className="size-3" /> {t("PDF")}
              </a>
              <Link
                href={`/dailies/sheet/${sheet.projectId}?sheet=${sheet.sheetId}`}
                className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" /> {t("Open sheet")}
              </Link>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="focus-ring grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Section rail. Horizontal on a laptop, vertical once there is room. */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 px-2 py-2 lg:w-[176px] lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
          {SECTIONS.map((s) => {
            const on = section === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  "focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                  on
                    ? "bg-brand/15 font-medium text-brand-bright"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                {t(s.label)}
                {s.id === "photos" && (shot?.total ?? d.photos) > 0 ? (
                  <span className="num ml-auto text-[10.5px] text-muted-foreground/70">
                    {shot?.total ?? d.photos}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {section === "overview" ? (
            <>
              {/* The five facts, then the detail that has always been here. */}
              <div className="grid grid-cols-2 gap-2 p-2.5 lg:grid-cols-5">
                <Fact label={t("Production")} value={d.totalFt ? formatFeet(d.totalFt) : "—"} />
                <Fact
                  label={t("Est. value")}
                  value={d.billableAmount ? formatCurrency(d.billableAmount) : "—"}
                />
                {/* A daily that was never submitted has no time to show, and
                    an empty card reads as a rendering fault rather than as a
                    fact about the day. */}
                <Fact
                  label={t("Submitted")}
                  value={d.submittedAt ? formatWhen(d.submittedAt) || d.workDate : t("Not filed")}
                />
                <Fact label={t("Crew")} value={d.crew || d.subcontractor || "—"} />
                <Fact
                  label={t("Documentation")}
                  value={why.length ? t("Needs attention") : t("Complete")}
                  tone={why.length ? "caution" : "positive"}
                />
              </div>
              <DailyDetail
                daily={d}
                onSetStatus={onSetStatus}
                sheet={sheet}
                reviewerName={reviewerName}
                canReview={canReview}
              />
            </>
          ) : section === "photos" ? (
            <PhotosSection d={d} shot={shot} sheet={sheet} t={t} />
          ) : (
            <CrewSection d={d} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "caution";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-foreground/[0.02] px-2.5 py-2">
      <p className="eyebrow text-[9.5px]">{label}</p>
      <p
        className={cn(
          "num mt-1 truncate text-[14px] font-semibold",
          tone === "positive"
            ? "text-success"
            : tone === "caution"
              ? "text-warning"
              : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/*
 * There is no AiReviewShell here on purpose.
 *
 * A first version of this redesign rendered its own review panel in the
 * section rail: four checks, drawn from unpricedCodes, totalFt, flags and
 * the documentation state. DailyDetail already renders exactly those four,
 * from exactly those fields, with better failure text. Two identical panels
 * one above the other is not more review, it is the same review twice, and
 * the second one is the copy that goes stale.
 *
 * The panel that survives is the older one, reached from Overview. It is
 * honest about what it is: every tick is computed from a real field, none of
 * it is a model's opinion, and it is where Vantara's review plugs in when
 * there is one.
 */

/** The photographs filed with the day, at a size worth looking at. */
function PhotosSection({
  d,
  shot,
  sheet,
  t,
}: {
  d: DailyReport;
  shot?: { urls: string[]; total: number };
  sheet?: { sheetId: string; projectId: string };
  t: (s: string) => string;
}) {
  if (!shot?.urls.length) {
    return (
      <div className="px-4 py-10 text-center">
        <Camera className="mx-auto size-6 text-muted-foreground/40" />
        <p className="mt-2 text-[13px] font-medium text-foreground">
          {d.photos > 0 ? t("Photographs are on the sheet") : t("No photographs attached")}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {d.photos > 0
            ? t("This day has {n}, filed before evidence records existed.").replace(
                "{n}",
                String(d.photos),
              )
            : t("A day with no photographs behind the number is the one that comes back.")}
        </p>
        {sheet ? (
          <Link
            href={`/dailies/sheet/${sheet.projectId}?sheet=${sheet.sheetId}`}
            className="focus-ring mt-2 inline-flex text-[12px] font-medium text-brand-bright hover:underline"
          >
            {t("Open the sheet")} →
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {shot.urls.map((u) => (
          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="focus-ring block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-28 w-full rounded-lg border border-border/60 object-cover"
            />
          </a>
        ))}
      </div>
      {shot.total > shot.urls.length && sheet ? (
        <Link
          href={`/dailies/sheet/${sheet.projectId}?sheet=${sheet.sheetId}`}
          className="focus-ring mt-2 inline-flex text-[12px] font-medium text-brand-bright hover:underline"
        >
          {t("See all {n} on the sheet").replace("{n}", String(shot.total))} →
        </Link>
      ) : null}
    </div>
  );
}

/** Who filed it, and anything the office wrote on it. */
function CrewSection({ d, t }: { d: DailyReport; t: (s: string) => string }) {
  const rows: [string, string][] = [
    [t("Subcontractor"), d.subcontractor || "—"],
    [t("Crew"), d.crew || "—"],
    [t("Customer"), d.customer || "—"],
    [t("Work date"), d.workDate],
    [t("Bills to week ending"), d.billingWeekEnd || "—"],
  ];
  return (
    <div className="p-3">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-border/40 py-1.5">
            <dt className="text-[12px] text-muted-foreground">{k}</dt>
            <dd className="num text-[12.5px] font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      {d.reviewNote ? (
        <div className="mt-3 rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
          <p className="eyebrow text-[9.5px]">{t("Review note")}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-foreground">{d.reviewNote}</p>
          {d.reviewedBy ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {d.reviewedBy}
              {d.reviewedAt ? ` · ${formatWhen(d.reviewedAt)}` : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground">{t("No review note on this day.")}</p>
      )}
    </div>
  );
}

/** The rail's shared frame, so three panels do not each invent their own. */
function Rail({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-foreground/[0.015]">
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-[12.5px] font-semibold text-foreground">{title}</h3>
      </header>
      {children}
    </section>
  );
}

/** Reserved for Vantara's review. Says so, rather than showing invented advice. */
function AiPanel({ t }: { t: (s: string) => string }) {
  return (
    <Rail title={t("Vantara insights")} icon={<Sparkles className="size-3.5" />}>
      <div className="px-3 py-4 text-center">
        <Sparkles className="mx-auto size-5 text-brand-bright/50" />
        <p className="mt-2 text-[12px] font-medium text-foreground">{t("Not connected yet")}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          {t(
            "This is where Vantara will flag unusual quantities, codes a rate card has never seen, and days filed without documentation. It stays empty until it has something true to say.",
          )}
        </p>
      </div>
    </Rail>
  );
}

/** Only things that already exist and already work. */
function QuickActions({ t }: { t: (s: string) => string }) {
  const items = [
    { href: "/dailies/sheet", label: t("Create a daily sheet"), icon: FileText },
    { href: "/projects", label: t("Projects"), icon: MapPin },
    { href: "/invoicing", label: t("Invoicing"), icon: Coins },
  ];
  return (
    <Rail title={t("Quick actions")} icon={<ArrowRight className="size-3.5" />}>
      <div className="flex flex-col p-1.5">
        {items.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="focus-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <a.icon className="size-3.5 shrink-0 text-brand-bright" />
            {a.label}
          </Link>
        ))}
      </div>
    </Rail>
  );
}

/**
 * What actually happened to the selected day.
 *
 * Built from the day's own record — when it was filed, when somebody decided
 * it, who that was — and nothing else. There is no event log behind dailies,
 * so a longer timeline would have to be invented, and a short true one is
 * worth more than a full imaginary one. With nothing selected it says so.
 */
function ActivityPanel({ d, t }: { d: DailyReport | null; t: (s: string) => string }) {
  if (!d) {
    return (
      <Rail title={t("Activity")} icon={<ClipboardList className="size-3.5" />}>
        <p className="px-3 py-4 text-center text-[11.5px] text-muted-foreground">
          {t("Open a daily to see what has happened to it.")}
        </p>
      </Rail>
    );
  }

  const events: { label: string; when: string; who?: string; tone: Tone }[] = [];
  if (d.submittedAt) {
    events.push({ label: t("Filed by the crew"), when: formatWhen(d.submittedAt), tone: "info" });
  }
  if (d.reviewedAt) {
    events.push({
      label: d.status === "Approved" ? t("Approved") : d.status === "Denied" ? t("Sent back") : t("Reviewed"),
      when: formatWhen(d.reviewedAt),
      who: d.reviewedBy,
      tone: d.status === "Approved" ? "success" : d.status === "Denied" ? "critical" : "neutral",
    });
  }

  return (
    <Rail title={t("Activity")} icon={<ClipboardList className="size-3.5" />}>
      {events.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11.5px] text-muted-foreground">
          {t("Nothing has happened to this day yet.")}
        </p>
      ) : (
        <ol className="flex flex-col p-2.5">
          {events.map((e, i) => (
            <li key={e.label + i} className="flex gap-2.5 py-1.5">
              <span
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  e.tone === "success"
                    ? "bg-success"
                    : e.tone === "critical"
                      ? "bg-critical"
                      : "bg-brand-bright",
                )}
              />
              <span className="min-w-0">
                <span className="block text-[12px] text-foreground">{e.label}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {e.when}
                  {e.who ? ` · ${e.who}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Rail>
  );
}
