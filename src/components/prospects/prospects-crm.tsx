"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Search,
  User,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/common/panel";
import type { ProspectRow } from "@/data/prospects-crm";
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

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  SUBCONTRACTOR: Users,
  WORKER: User,
  PRIME: Building2,
};

type Tab = "ALL" | "SUBCONTRACTOR" | "WORKER" | "PRIME";
type Quick = "ALL" | "DUE" | "OVERDUE" | "AVAILABLE" | "READY" | "PRIME";

export function ProspectsCrm({
  rows,
  overview,
  owners,
  canManage,
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
  owners: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>("ALL");
  const [quick, setQuick] = React.useState<Quick>("ALL");
  const [query, setQuery] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const CLOSED = ["WON", "LOST", "DORMANT", "DO_NOT_USE"];

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = rows.filter((r) => {
      if (tab !== "ALL" && r.kind !== tab) return false;
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

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Active pipeline" value={overview.pipeline} hint="not closed out" active={quick === "ALL"} onClick={() => setQuick("ALL")} />
        <Kpi
          label="Follow-ups due"
          value={overview.followUpsDue}
          hint={overview.overdue > 0 ? `${overview.overdue} overdue` : "none overdue"}
          tone={overview.overdue > 0 ? "critical" : "warning"}
          active={quick === "DUE"}
          onClick={() => setQuick("DUE")}
        />
        <Kpi label="Available crews" value={overview.availableCrews} hint="can start now" tone="success" active={quick === "AVAILABLE"} onClick={() => setQuick("AVAILABLE")} />
        <Kpi label="Ready to onboard" value={overview.readyToOnboard} hint="prequal is in" tone="success" active={quick === "READY"} onClick={() => setQuick("READY")} />
        <Kpi label="Prime opportunities" value={overview.primeOpportunities} hint="live pursuits" active={quick === "PRIME"} onClick={() => setQuick("PRIME")} />
      </div>

      <Panel>
        <PanelHeader title="Prospects" count={shown.length} icon={<Users className="size-3.5 text-gold" />}>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Company, contact, market, equipment…"
              aria-label="Search prospects"
              className="focus-ring h-8 w-[220px] rounded-lg bg-foreground/[0.05] pl-7 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </label>
        </PanelHeader>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-2.5 py-2">
          {(
            [
              ["ALL", "All"],
              ["SUBCONTRACTOR", "Crews"],
              ["WORKER", "Workers"],
              ["PRIME", "Primes"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={cn(
                "focus-ring rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                tab === v ? "bg-brand text-white" : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
          {quick !== "ALL" || query ? (
            <button
              type="button"
              onClick={() => {
                setQuick("ALL");
                setQuery("");
              }}
              className="focus-ring ml-auto rounded-full px-2.5 py-1 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {shown.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <Users className="mx-auto size-7 text-muted-foreground/40" />
            <p className="mt-2 text-[13px] font-medium text-foreground">
              {rows.length === 0
                ? "No prospects yet"
                : quick === "OVERDUE" || quick === "DUE"
                  ? "You're caught up."
                  : quick === "AVAILABLE"
                    ? "No crews are currently marked available."
                    : "Nothing matches."}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
              {rows.length === 0
                ? "Start building your network of crews, workers and prime contractors."
                : "Try a different filter."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {shown.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "border-b border-border/50 last:border-0",
                  openId === r.id && "bg-foreground/[0.02]",
                )}
              >
                <RowItem
                  row={r}
                  open={openId === r.id}
                  onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                />
                {openId === r.id ? (
                  <Expanded row={r} owners={owners} canManage={canManage} onClose={() => setOpenId(null)} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
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

function RowItem({ row: r, open, onToggle }: { row: ProspectRow; open: boolean; onToggle: () => void }) {
  const Icon = KIND_ICON[r.kind] ?? Users;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "focus-ring group/row flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 text-left transition-colors",
        open ? "gold-rail" : "hover:bg-foreground/[0.03]",
        r.overdueDays > 0 && !open && "bg-critical/[0.03]",
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-muted-foreground">
        <Icon className="size-4" />
      </span>

      <span className="flex min-w-[190px] flex-1 flex-col gap-0.5">
        <span className="truncate text-[14.5px] font-semibold text-foreground">{r.name}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
          {r.contactName ? <span className="truncate text-brand">{r.contactName}</span> : null}
          {r.city || r.homeState ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {[r.city, r.homeState].filter(Boolean).join(", ")}
            </span>
          ) : null}
        </span>
      </span>

      <span className="hidden w-[120px] shrink-0 flex-col sm:flex">
        <span className={cn("w-fit rounded px-1.5 py-0.5 text-[10.5px] font-semibold", STAGE_TONE[r.stage] ?? "")}>
          {stageLabel(r.stage)}
        </span>
        <span className="mt-1 text-[10.5px] text-muted-foreground">{r.stageDays}d in stage</span>
      </span>

      <span className="hidden w-[104px] shrink-0 flex-col lg:flex">
        <span className="num text-[15px] font-semibold leading-none text-foreground">
          {r.availableCrews || r.crewSize || "—"}
        </span>
        <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {r.availability === "AVAILABLE_NOW" ? "Crews free" : "Crews"}
        </span>
      </span>

      <span className="hidden w-[110px] shrink-0 flex-col lg:flex">
        <span className="text-[12.5px] text-foreground/85">{r.lastContact || "—"}</span>
        <span className="mt-1 text-[10.5px] text-muted-foreground">
          {r.daysSinceContact == null ? "never contacted" : `${r.daysSinceContact}d ago`}
        </span>
      </span>

      <span className="flex w-[150px] shrink-0 flex-col gap-0.5">
        {r.overdueDays > 0 ? (
          <span className="flex items-center gap-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-critical">
            <AlertTriangle className="size-3" /> Overdue {r.overdueDays}d
          </span>
        ) : r.dueToday ? (
          <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-warning">Due today</span>
        ) : !r.nextStep ? (
          <span className="text-[11.5px] text-muted-foreground/70">No next step</span>
        ) : (
          <span className="truncate text-[12px] text-foreground/85">{r.nextStep}</span>
        )}
        {r.owner ? <span className="truncate text-[10.5px] text-muted-foreground">{r.owner}</span> : null}
      </span>

      <span className="flex w-[74px] shrink-0 flex-col">
        <span className="num gold-figure text-[15px] font-semibold leading-none">{r.score}</span>
        <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Score</span>
      </span>

      <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The open row: everything before you call them.
 * ------------------------------------------------------------------ */

function Expanded({
  row: r,
  owners,
  canManage,
  onClose,
}: {
  row: ProspectRow;
  owners: { id: string; name: string }[];
  canManage: boolean;
  onClose: () => void;
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
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
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
