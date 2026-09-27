"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Loader2,
  Plus,
  Search,
  X,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Panel } from "@/components/common/panel";
import type { ProspectRow } from "@/data/prospects-crm";
import type { Prospect } from "@/lib/types";
import { ProspectForm } from "@/components/prospects/prospect-form";
import {
  addNote,
  convertToSubcontractor,
  logCall,
  messageProspect,
  reactivate,
  setAvailability,
  setFollowUp,
  setStage,
} from "@/app/prospects/crm-actions";

/**
 * The pipeline as rows that open where they sit.
 *
 * It was a narrow list beside a permanent detail panel, so most of the screen
 * showed one company while the list you scan got a third of it. The collapsed
 * row answers "who deserves my attention"; the open one answers "everything I
 * need before I ring them", without going anywhere.
 */

const STAGES = [
  ["NEW", "New"],
  ["CONTACTED", "Contacted"],
  ["QUALIFYING", "Qualifying"],
  ["IN_DISCUSSION", "In discussion"],
  ["NEGOTIATING", "Negotiating"],
  ["READY_TO_ONBOARD", "Ready to onboard"],
  ["WON", "Won"],
  ["LOST", "Lost"],
  ["DORMANT", "Dormant"],
  ["DO_NOT_USE", "Do not use"],
] as const;

const PRIME_STAGES = [
  ["NEW", "New lead"],
  ["CONTACTED", "Contacted"],
  ["VENDOR_REGISTRATION", "Vendor registration"],
  ["PREQUALIFIED", "Prequalified"],
  ["IN_DISCUSSION", "Opportunity"],
  ["BID_SUBMITTED", "Bid submitted"],
  ["NEGOTIATING", "Negotiating"],
  ["WON", "Awarded"],
  ["LOST", "Lost"],
  ["DORMANT", "Dormant"],
] as const;

const CLOSE_REASONS = [
  "Rates too high",
  "No availability",
  "No response",
  "Equipment mismatch",
  "Bad reference",
  "Insurance issue",
  "Chose a competitor",
  "Project cancelled",
  "Not interested",
  "Timing",
  "Other",
];

const AVAIL = [
  ["AVAILABLE_NOW", "Available now"],
  ["AVAILABLE_SOON", "Available soon"],
  ["LIMITED", "Limited capacity"],
  ["COMMITTED", "Committed"],
  ["UNAVAILABLE", "Unavailable"],
  ["UNKNOWN", "Unknown"],
] as const;

const stageLabel = (s: string) =>
  [...STAGES, ...PRIME_STAGES].find(([v]) => v === s)?.[1] ??
  s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

const STAGE_TONE: Record<string, string> = {
  NEW: "bg-foreground/[0.08] text-muted-foreground",
  CONTACTED: "bg-brand/15 text-brand-bright",
  QUALIFYING: "bg-brand/15 text-brand-bright",
  VENDOR_REGISTRATION: "bg-brand/15 text-brand-bright",
  PREQUALIFIED: "bg-brand/15 text-brand-bright",
  IN_DISCUSSION: "bg-warning/15 text-warning",
  NEGOTIATING: "bg-warning/15 text-warning",
  BID_SUBMITTED: "bg-warning/15 text-warning",
  READY_TO_ONBOARD: "bg-success/15 text-success",
  WON: "bg-success/15 text-success",
  LOST: "bg-critical/15 text-critical",
  DORMANT: "bg-foreground/[0.06] text-muted-foreground",
  DO_NOT_USE: "bg-critical/18 text-critical",
};

/** Stages that mean the pursuit is over, one way or another. */
const CLOSED = ["WON", "LOST", "DORMANT", "DO_NOT_USE"];

type Tab = "ALL" | "SUBCONTRACTOR" | "WORKER" | "PRIME";
type Quick = "ALL" | "PIPELINE" | "DUE" | "OVERDUE" | "AVAILABLE" | "READY" | "PRIME" | "CLOSED";

export function ProspectsCrm({
  rows,
  overview,
  canManage,
  editable,
  knownStates,
  knownMarkets,
}: {
  rows: ProspectRow[];
  overview: {
    pipeline: number;
    followUpsDue: number;
    overdue: number;
    availableCrews: number;
    readyToOnboard: number;
    primeOpportunities: number;
  };
  canManage: boolean;
  /** Full records, for the add/edit form. Staff only. */
  editable: Prospect[];
  knownStates: string[];
  knownMarkets: string[];
}) {
  const [tab, setTab] = React.useState<Tab>("ALL");
  const [quick, setQuick] = React.useState<Quick>("ALL");
  const [query, setQuery] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  /** null = closed. { p: null } = adding. { p } = editing that one. */
  const [form, setForm] = React.useState<{ p: Prospect | null } | null>(null);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = rows.filter((r) => {
      if (tab !== "ALL" && r.kind !== tab) return false;
      if (quick === "PIPELINE" && CLOSED.includes(r.stage)) return false;
      if (quick === "CLOSED" && !CLOSED.includes(r.stage)) return false;
      if (quick === "DUE" && !(r.dueToday || r.overdueDays > 0)) return false;
      if (quick === "OVERDUE" && r.overdueDays === 0) return false;
      if (quick === "AVAILABLE" && r.availability !== "AVAILABLE_NOW") return false;
      if (quick === "READY" && r.stage !== "READY_TO_ONBOARD") return false;
      if (quick === "PRIME" && (r.kind !== "PRIME" || CLOSED.includes(r.stage))) return false;
      if (
        q &&
        ![r.name, r.contactName, r.city, r.homeState, r.owner, r.source, r.nextStep, ...r.states, ...r.markets, ...r.trades]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });

    // Actionable first. Alphabetical is a filing cabinet; this is a work list.
    const rank = (r: ProspectRow) =>
      r.overdueDays > 0 ? 0 : r.dueToday ? 1 : !CLOSED.includes(r.stage) && !r.nextStep ? 2 : CLOSED.includes(r.stage) ? 4 : 3;
    return [...kept].sort(
      (a, b) => rank(a) - rank(b) || b.overdueDays - a.overdueDays || b.score - a.score,
    );
  }, [rows, tab, quick, query]);

  // Which prospect the right-hand pane is showing. Defaults to the first in
  // the list rather than nothing: an empty half of the screen teaches nobody
  // anything, and the top row is the one the sort put there because it needs
  // attention.
  const selected = React.useMemo(
    () => shown.find((r) => r.id === openId) ?? shown[0] ?? null,
    [shown, openId],
  );

  const counts = React.useMemo(
    () => ({
      ALL: rows.length,
      WORKER: rows.filter((r) => r.kind === "WORKER").length,
      SUBCONTRACTOR: rows.filter((r) => r.kind === "SUBCONTRACTOR").length,
      PRIME: rows.filter((r) => r.kind === "PRIME").length,
    }),
    [rows],
  );

  const notAFit = rows.filter((r) => CLOSED.includes(r.stage)).length;
  const pct = (n: number) => (rows.length === 0 ? "—" : `${Math.round((n / rows.length) * 100)}% of total`);

  return (
    <div className="flex flex-col gap-3">
      {/* Five counts, and each one narrows the list below it. A number that
          cannot be pressed is a number somebody has to go and find. */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Total prospects"
          value={rows.length}
          hint="All types"
          active={quick === "ALL"}
          onClick={() => setQuick("ALL")}
        />
        <Kpi
          label="Active pipeline"
          value={overview.pipeline}
          hint={pct(overview.pipeline)}
          tone="success"
          active={quick === "PIPELINE"}
          onClick={() => setQuick("PIPELINE")}
        />
        <Kpi
          label="Follow-ups due"
          value={overview.followUpsDue}
          hint={overview.overdue > 0 ? `${overview.overdue} overdue` : "within 7 days"}
          tone={overview.overdue > 0 ? "critical" : "warning"}
          active={quick === "DUE"}
          onClick={() => setQuick("DUE")}
        />
        <Kpi
          label="Ready to onboard"
          value={overview.readyToOnboard}
          hint="met requirements"
          tone="success"
          active={quick === "READY"}
          onClick={() => setQuick("READY")}
        />
        <Kpi
          label="Not a fit"
          value={notAFit}
          hint="closed / archived"
          active={quick === "CLOSED"}
          onClick={() => setQuick("CLOSED")}
        />
      </div>

      {/* The list and the one that is open, side by side. A pipeline is read
          by comparing rows and worked one at a time, and the old layout made
          you choose: opening a prospect pushed every other one off screen. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <Panel className="min-w-0">
          <div className="flex flex-col gap-2.5 border-b border-border/70 p-2.5 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              {(
                [
                  ["ALL", "All"],
                  ["WORKER", "Workers"],
                  ["SUBCONTRACTOR", "Crews"],
                  ["PRIME", "Primes"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTab(v)}
                  aria-pressed={tab === v}
                  className={cn(
                    "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors",
                    tab === v
                      ? "border-brand/60 bg-brand/[0.12] text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  <span className="num text-[11.5px] text-muted-foreground">({counts[v]})</span>
                </button>
              ))}
            </div>

            <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 ring-1 ring-inset ring-foreground/[0.06] focus-within:ring-brand/40 lg:w-[260px]">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Company, contact, market, equipment…"
                aria-label="Search prospects"
                className="w-full min-w-0 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="focus-ring shrink-0 rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </label>

            {canManage ? (
              <button
                type="button"
                onClick={() => setForm({ p: null })}
                className="focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-bright"
              >
                <Plus className="size-3.5" /> New prospect
              </button>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <div className="px-3 py-12 text-center">
              <Users className="mx-auto size-5 text-muted-foreground/50" />
              <p className="mt-2 text-[12.5px] font-medium text-foreground">
                {rows.length === 0 ? "No prospects yet" : "No matches"}
              </p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {rows.length === 0
                  ? "Add a crew, a worker or a prime you are chasing."
                  : "Nothing here matches that."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-border/70">
                    {[
                      ["Company / contact", ""],
                      ["Lives in", "w-[150px]"],
                      ["Type", "w-[92px]"],
                      ["Status", "w-[116px]"],
                      ["Next action", "w-[118px]"],
                      ["Score", "w-[72px] text-right"],
                    ].map(([label, cls]) => (
                      <th
                        key={label}
                        scope="col"
                        className={cn(
                          "px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground",
                          cls,
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <ProspectRowCells
                      key={r.id}
                      row={r}
                      selected={selected?.id === r.id}
                      onSelect={() => setOpenId(r.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {shown.length > 0 ? (
            <p className="border-t border-border/70 px-3 py-2.5 text-[12px] text-muted-foreground">
              Showing {shown.length} of {rows.length}{" "}
              {rows.length === 1 ? "prospect" : "prospects"}
            </p>
          ) : null}
        </Panel>

        {/* The one being worked. Sticky on a wide screen so it stays beside
            the list while somebody scrolls it. */}
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          {selected ? (
            <Panel className="min-w-0 overflow-hidden">
              <Expanded
                row={selected}
                canManage={canManage}
                onEdit={() => {
                  const full = editable.find((e) => e.id === selected.id);
                  if (full) setForm({ p: full });
                }}
              />
            </Panel>
          ) : null}
        </div>
      </div>

      {form ? (
        <ProspectForm
          prospect={form.p}
          knownStates={knownStates}
          knownMarkets={knownMarkets}
          onClose={() => setForm(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * One prospect, as a row you can compare down a column.
 *
 * Where they live gets a column of its own. It is the fact that decides
 * whether a job is in their back yard or a motel away, and it was previously
 * only visible once the row was opened.
 */
function ProspectRowCells({
  row: r,
  selected,
  onSelect,
}: {
  row: ProspectRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const scoreTone =
    r.score >= 80
      ? "text-success"
      : r.score >= 55
        ? "text-gold"
        : r.score > 0
          ? "text-warning"
          : "text-muted-foreground";

  return (
    <tr
      onClick={onSelect}
      aria-selected={selected}
      className={cn(
        "cursor-pointer border-b border-border/50 transition-colors",
        selected ? "bg-brand/[0.07]" : "hover:bg-foreground/[0.03]",
      )}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
            {initials(r.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-foreground">{r.name}</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              {r.contactName || "no contact named"}
            </span>
          </span>
        </div>
      </td>

      <td className="px-3 py-2.5">
        <span className="block truncate text-[12.5px] text-foreground">
          {[r.city, r.homeState].filter(Boolean).join(", ") || "—"}
        </span>
        {/* Their back yard, and how far past it they will go. */}
        {r.homeState && r.states.filter((s) => s !== r.homeState).length > 0 ? (
          <span className="block truncate text-[11px] text-muted-foreground">
            + {r.states.filter((s) => s !== r.homeState).join(", ")}
          </span>
        ) : null}
      </td>

      <td className="px-3 py-2.5">
        <span className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {r.kind === "SUBCONTRACTOR" ? "Crew" : r.kind === "PRIME" ? "Prime" : "Worker"}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold",
            STAGE_TONE[r.stage] ?? "bg-foreground/[0.08] text-muted-foreground",
          )}
        >
          {stageLabel(r.stage)}
        </span>
      </td>

      <td className="px-3 py-2.5">
        {r.overdueDays > 0 ? (
          <span className="text-[12px] font-semibold text-critical">
            {r.overdueDays}d overdue
          </span>
        ) : r.nextStepDue ? (
          <span className="num text-[12px] text-foreground">{r.nextStepDue}</span>
        ) : (
          <span className="text-[12px] text-muted-foreground">nothing set</span>
        )}
      </td>

      <td className="px-3 py-2.5 text-right">
        <span className={cn("num text-[13.5px] font-semibold", scoreTone)}>{r.score}</span>
      </td>
    </tr>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "warning" | "critical" | "success";
  active?: boolean;
  onClick: () => void;
}) {
  const hot = value > 0 && tone;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-ring rounded-xl border px-3 py-2.5 text-left transition-colors",
        active ? "border-brand/60 bg-brand/[0.1]" : "border-border/70 bg-foreground/[0.02] hover:border-brand/40",
      )}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num mt-0.5 text-[21px] font-bold tracking-[-0.02em]",
          hot === "critical" ? "text-critical" : hot === "warning" ? "text-warning" : hot === "success" ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[10.5px] text-muted-foreground">{hint}</p> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The collapsed row: who deserves attention.
 * ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ *
 * The open row: everything before you call them.
 * ------------------------------------------------------------------ */

function Expanded({
  row: r,
  canManage,
  onEdit,
}: {
  row: ProspectRow;
  canManage: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [panel, setPanel] = React.useState<"none" | "followup" | "call" | "avail" | "close" | "convert">("none");

  const isPrime = r.kind === "PRIME";
  const stages = isPrime ? PRIME_STAGES : STAGES;
  const closed = ["WON", "LOST", "DORMANT", "DO_NOT_USE"].includes(r.stage);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return setError(res.error ?? "That didn't go through.");
    setPanel("none");
    setNote("");
    router.refresh();
  }

  return (
    <div className="border-t border-border/60 bg-background/40 px-3 py-3">
      {r.flags.length > 0 ? (
        <div className="mb-3 rounded-lg border border-warning/35 bg-warning/[0.06] px-3 py-2">
          <ul className="flex flex-col gap-0.5">
            {r.flags.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-[12px] text-warning">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Who they are. */}
        <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Who they are</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
            <dt className="text-muted-foreground">Contact</dt>
            <dd className="truncate font-medium text-foreground">
              {r.contactName || "—"}
              {r.contactRole ? <span className="text-muted-foreground"> · {r.contactRole}</span> : null}
            </dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd className="truncate">
              {r.phone ? (
                <a href={`tel:${r.phone}`} className="font-medium text-brand hover:underline">
                  {r.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate">
              {r.email ? (
                <a href={`mailto:${r.email}`} className="font-medium text-brand hover:underline">
                  {r.email}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="truncate text-foreground">{r.source || "—"}</dd>
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="truncate text-foreground">{r.owner || "unassigned"}</dd>
          </dl>
        </div>

        {/* Where and what. */}
        <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
          {/* Where they actually live, first and on its own.
              A crew's home town is the single most useful fact about where
              they can work cheaply: it is the difference between a job in
              their own back yard and one they need a motel for, and the list
              of states they will travel to says nothing about it. */}
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Where they live
          </p>
          <p className="mt-2 text-[13px] font-semibold text-foreground">
            {r.city || r.homeState ? (
              [r.city, r.homeState].filter(Boolean).join(", ")
            ) : (
              <span className="font-normal text-muted-foreground">No home town on file</span>
            )}
          </p>
          {r.homeState ? (
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Back yard: {r.homeState}
              {/* Everything beyond home is travel. Derived from the states
                  they listed minus the one they live in — not a new field
                  and not a guess about how far they will go. */}
              {r.states.filter((s) => s !== r.homeState).length > 0
                ? ` · travels to ${r.states.filter((s) => s !== r.homeState).join(", ")}`
                : " · no travel states listed"}
            </p>
          ) : null}

          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Where they work
          </p>
          <p className="mt-2 text-[12.5px] text-foreground">
            {r.states.length ? r.states.join(", ") : <span className="text-muted-foreground">No states recorded</span>}
          </p>
          {r.markets.length ? (
            <p className="mt-1 text-[12px] text-muted-foreground">{r.markets.join(" · ")}</p>
          ) : null}

          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            What they do
          </p>
          <p className="mt-1.5 flex flex-wrap gap-1">
            {r.trades.length ? (
              r.trades.map((t) => (
                <span key={t} className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[11px] text-foreground">
                  {t}
                </span>
              ))
            ) : (
              <span className="text-[12px] text-muted-foreground">No trades recorded</span>
            )}
          </p>

          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            <span>{r.equipmentCount} equipment</span>
            <span>{r.rateCount} rates</span>
            <span>{r.contactCount} contacts</span>
            <span>{r.qualificationPct}% prequal</span>
          </p>
        </div>

        {/* Why the score is the score. Never a black box. */}
        <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
          <p className="flex items-baseline gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Fit score</span>
            <span className="num gold-figure text-[18px] font-bold leading-none">{r.score}</span>
            <span className="text-[11.5px] text-muted-foreground">/ 100 · {r.scoreBand}</span>
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {r.scoreReasons.map((s) => (
              <li key={s.label} className="text-[11.5px]">
                <span className="flex items-baseline gap-2">
                  <span className="w-[86px] shrink-0 text-muted-foreground">{s.label}</span>
                  <span className="num w-[42px] shrink-0 font-medium text-foreground">
                    {s.got}/{s.of}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground/80">{s.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* What to do about them. */}
      {canManage ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <select
            value={r.stage}
            onChange={(e) => {
              const next = e.target.value;
              if (["LOST", "DORMANT", "DO_NOT_USE"].includes(next)) return setPanel("close");
              void run("stage", () => setStage({ id: r.id, stage: next }));
            }}
            aria-label="Stage"
            className="focus-ring h-8 rounded-lg border border-border bg-transparent px-2 text-[12px] font-medium text-foreground outline-none focus:border-brand"
          >
            {stages.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>

          <Action label="Edit details" onClick={onEdit} />
          <Action label="Note" onClick={() => setPanel(panel === "none" ? "followup" : "none")} hidden />
          <Action label="Follow-up" onClick={() => setPanel(panel === "followup" ? "none" : "followup")} />
          <Action label="Log call" onClick={() => setPanel(panel === "call" ? "none" : "call")} />
          <Action label="Availability" onClick={() => setPanel(panel === "avail" ? "none" : "avail")} />
          <Action
            label="Message"
            busy={busy === "msg"}
            onClick={async () => {
              setBusy("msg");
              const res = await messageProspect(r.id);
              setBusy(null);
              if (res.ok) router.push(`/messages?c=${res.conversationId}`);
              else setError(res.error);
            }}
          />
          {r.convertedSubcontractorId ? (
            <Link
              href="/subcontractors"
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-success/40 px-2.5 text-[12px] font-medium text-success"
            >
              <Check className="size-3.5" /> View subcontractor
            </Link>
          ) : r.kind === "SUBCONTRACTOR" && !closed ? (
            <Action label="Move to subcontractors" tone="solid" onClick={() => setPanel("convert")} />
          ) : null}
          {closed ? (
            <Action label="Reactivate" busy={busy === "react"} onClick={() => void run("react", () => reactivate(r.id))} />
          ) : null}
        </div>
      ) : null}

      {/* A note is always one line away. */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={1}
          placeholder="Add a note — what was said, what they need, what you promised."
          className="focus-ring max-h-24 min-h-9 flex-1 resize-y rounded-lg border border-border bg-transparent px-2.5 py-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand"
        />
        <button
          type="button"
          disabled={!note.trim() || busy === "note"}
          onClick={() => void run("note", () => addNote(r.id, note))}
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
        >
          {busy === "note" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Note
        </button>
      </div>

      {panel !== "none" ? (
        <SubPanel
          panel={panel}
          row={r}
          busy={busy}
          onCancel={() => setPanel("none")}
          onRun={run}
        />
      ) : null}

      {error ? <p className="mt-2 text-[12px] text-critical">{error}</p> : null}
    </div>
  );
}

function Action({
  label,
  onClick,
  tone,
  busy,
  hidden,
}: {
  label: string;
  onClick: () => void;
  tone?: "solid";
  busy?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors disabled:opacity-40",
        tone === "solid"
          ? "bg-brand text-white hover:bg-brand-bright"
          : "border border-border text-foreground hover:border-brand/60",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {label}
    </button>
  );
}

function SubPanel({
  panel,
  row: r,
  busy,
  onCancel,
  onRun,
}: {
  panel: string;
  row: ProspectRow;
  busy: string | null;
  onCancel: () => void;
  onRun: (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const [action, setAction] = React.useState("Call them");
  const [due, setDue] = React.useState("");
  const [outcome, setOutcome] = React.useState("Connected");
  const [minutes, setMinutes] = React.useState("");
  const [status, setStatus] = React.useState("AVAILABLE_NOW");
  const [crews, setCrews] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [text, setText] = React.useState("");

  const field =
    "h-8 rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand";

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-foreground/[0.03] p-2.5">
      {panel === "followup" ? (
        <>
          <Field label="Next action">
            <select value={action} onChange={(e) => setAction(e.target.value)} className={cn(field, "w-[180px]")}>
              {["Call them", "Text them", "Email them", "Send the rate sheet", "Send the agreement", "Request COI", "Request equipment list", "Request references", "Verify availability", "Vendor registration", "Follow up"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          <Field label="By">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(field, "num")} />
          </Field>
          <Go
            label="Set follow-up"
            busy={busy === "fu"}
            onClick={() => void onRun("fu", () => setFollowUp({ id: r.id, action, due }))}
          />
        </>
      ) : null}

      {panel === "call" ? (
        <>
          <Field label="Outcome">
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={cn(field, "w-[150px]")}>
              {["Connected", "Voicemail", "No answer", "Follow-up needed", "Not interested"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Minutes">
            <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" className={cn(field, "num w-[70px]")} />
          </Field>
          <Field label="Notes">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What was said" className={cn(field, "w-[220px]")} />
          </Field>
          <Go
            label="Log the call"
            busy={busy === "call"}
            onClick={() =>
              void onRun("call", () =>
                logCall({ id: r.id, direction: "outbound", minutes: Number(minutes) || undefined, outcome, notes: text }),
              )
            }
          />
        </>
      ) : null}

      {panel === "avail" ? (
        <>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={cn(field, "w-[160px]")}>
              {AVAIL.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Crews free">
            <input value={crews} onChange={(e) => setCrews(e.target.value)} inputMode="numeric" className={cn(field, "num w-[70px]")} />
          </Field>
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(field, "num")} />
          </Field>
          <Go
            label="Record it"
            busy={busy === "avail"}
            onClick={() =>
              void onRun("avail", () =>
                setAvailability({ id: r.id, status, crews: Number(crews) || 0, fromDate: from }),
              )
            }
          />
        </>
      ) : null}

      {panel === "close" ? (
        <>
          <Field label="Why">
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={cn(field, "w-[190px]")}>
              <option value="">Pick a reason…</option>
              {CLOSE_REASONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Note">
            <input value={text} onChange={(e) => setText(e.target.value)} className={cn(field, "w-[220px]")} />
          </Field>
          <Go
            label="Mark lost"
            busy={busy === "close"}
            disabled={!reason}
            onClick={() => void onRun("close", () => setStage({ id: r.id, stage: "LOST", reason, note: text }))}
          />
          <Go
            label="Mark dormant"
            busy={busy === "close"}
            disabled={!reason}
            onClick={() => void onRun("close", () => setStage({ id: r.id, stage: "DORMANT", reason, note: text }))}
          />
        </>
      ) : null}

      {panel === "convert" ? (
        <>
          <p className="w-full text-[12.5px] text-muted-foreground">
            Company, contacts, equipment, rates and this whole history carry across. The
            prospect stays as the record of how it started. If a subcontractor with this
            name already exists you will be asked before anything is created.
          </p>
          <Go
            label="Move to subcontractors"
            busy={busy === "conv"}
            onClick={() => void onRun("conv", () => convertToSubcontractor(r.id))}
          />
        </>
      ) : null}

      <button type="button" onClick={onCancel} className="focus-ring h-8 rounded-lg px-2 text-[12px] text-muted-foreground hover:text-foreground">
        Cancel
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Go({
  label,
  onClick,
  busy,
  disabled,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      {label}
    </button>
  );
}
