"use client";

import * as React from "react";
import {
  Ban,
  Check,
  ChevronRight,
  Clock,
  Coins,
  FileText,
  Search,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";
import { FAST_PAY_DAYS, FAST_PAY_FEE_PCT, STANDARD_TERMS_DAYS } from "@/lib/fast-pay";
import { Panel } from "@/components/common/panel";
import { PayAppActions } from "@/components/financials/pay-app-actions";
import type { SubInvoiceRow } from "@/data/queries";

/**
 * The pay register, and one statement opened beside it.
 *
 * Everything the office does to a crew's money happens on this screen: see what
 * is waiting, open it, check it against the dailies it was built from, and pay
 * it. The list on its own could never answer the question that actually gets
 * asked — "what is this figure made of" — so the breakdown sits next to the row
 * rather than behind a navigation.
 *
 * Nothing here is a crew's view of their own statement; that is /pay, and it is
 * built from a different query. This one is staff-gated at the accessor.
 *
 * On a phone the two panes become one: the list, and the statement over it.
 * A register is read on a laptop and a payment gets chased from a truck, so the
 * drawer has to be a screen of its own rather than a column squeezed to
 * nothing.
 */

type Tab = "all" | "pending" | "ready" | "paid" | "disputed";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending review" },
  { id: "ready", label: "Ready to pay" },
  { id: "paid", label: "Paid" },
  { id: "disputed", label: "Disputed" },
];

/** Which tab a statement belongs under, from its own state. */
function tabOf(s: SubInvoiceRow): Exclude<Tab, "all"> {
  if (s.status === "PAID") return "paid";
  if (s.status === "DISPUTED") return "disputed";
  if (s.status === "ISSUED" || s.status === "ACCEPTED") return "ready";
  return "pending";
}

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Pending review", cls: "bg-warning/15 text-warning ring-warning/25" },
  ISSUED: { label: "Ready to pay", cls: "bg-info/15 text-info ring-info/25" },
  ACCEPTED: { label: "Ready to pay", cls: "bg-success/15 text-success ring-success/25" },
  PAID: { label: "Paid", cls: "bg-success/15 text-success ring-success/25" },
  DISPUTED: { label: "Disputed", cls: "bg-critical/15 text-critical ring-critical/25" },
  VOID: { label: "Void", cls: "bg-foreground/[0.08] text-muted-foreground ring-foreground/10" },
};

/** "J&P Cable LLC." → "JC". Two letters, so the badge stays a badge. */
function initials(company: string): string {
  return (
    company
      .replace(/[^A-Za-z ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "SC"
  );
}

/** "2026-09-05" → "Sep 5". Empty stays empty. */
function day(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function period(s: SubInvoiceRow): string {
  if (!s.periodStart && !s.periodEnd) return "—";
  const year = (s.periodEnd || s.periodStart).slice(0, 4);
  return `${day(s.periodStart)} – ${day(s.periodEnd)}, ${year}`;
}

export function PayApplicationsView({ statements }: { statements: SubInvoiceRow[] }) {
  const [tab, setTab] = React.useState<Tab>("all");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const counts = React.useMemo(() => {
    const c: Record<Tab, number> = { all: statements.length, pending: 0, ready: 0, paid: 0, disputed: 0 };
    for (const s of statements) c[tabOf(s)]++;
    return c;
  }, [statements]);

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return statements.filter((s) => {
      if (tab !== "all" && tabOf(s) !== tab) return false;
      if (!needle) return true;
      return [s.number, s.company, s.project, s.projectNumber]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [statements, tab, q]);

  const open = statements.find((s) => s.id === openId) ?? null;

  const sum = (rows: SubInvoiceRow[], pick: (s: SubInvoiceRow) => number) =>
    rows.reduce((n, s) => n + pick(s), 0);

  const pending = statements.filter((s) => tabOf(s) === "pending");
  const ready = statements.filter((s) => tabOf(s) === "ready");
  const paid = statements.filter((s) => tabOf(s) === "paid");

  return (
    <div className="flex flex-col gap-4">
      {/* The four figures somebody opens this page to see. Each one filters the
          list rather than sitting there as decoration. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Pending review"
          value={formatCurrency(sum(pending, (s) => s.net))}
          hint={`${pending.length} pay application${pending.length === 1 ? "" : "s"}`}
          icon={<Clock className="size-4" />}
          tone="text-warning"
          ring="ring-warning/25 bg-warning/10"
          active={tab === "pending"}
          onClick={() => setTab(tab === "pending" ? "all" : "pending")}
        />
        <Kpi
          label="Ready to pay"
          value={formatCurrency(sum(ready, (s) => s.net))}
          hint={`${ready.length} waiting on the bank`}
          icon={<FileText className="size-4" />}
          tone="text-info"
          ring="ring-info/25 bg-info/10"
          active={tab === "ready"}
          onClick={() => setTab(tab === "ready" ? "all" : "ready")}
        />
        <Kpi
          label="Paid"
          value={formatCurrency(sum(paid, (s) => s.net))}
          hint={`${paid.length} settled`}
          icon={<Check className="size-4" />}
          tone="text-success"
          ring="ring-success/25 bg-success/10"
          active={tab === "paid"}
          onClick={() => setTab(tab === "paid" ? "all" : "paid")}
        />
        <Kpi
          label="Retainage held"
          value={formatCurrency(sum(statements, (s) => s.retainage))}
          hint="Across every statement"
          icon={<Coins className="size-4" />}
          tone="text-gold"
          ring="ring-gold/25 bg-gold/10"
        />
      </div>

      {/* Tabs and search. Scrolls sideways on a phone rather than wrapping into
          three rows of chips. */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="-mx-1 overflow-x-auto px-1 lg:flex-1">
          <div className="flex min-w-max items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  tab === t.id
                    ? "bg-foreground/[0.08] text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "num rounded px-1 text-[10.5px] font-semibold",
                    counts[t.id] > 0
                      ? "bg-foreground/[0.08] text-foreground"
                      : "text-muted-foreground/60",
                  )}
                >
                  {counts[t.id]}
                </span>
              </button>
            ))}
          </div>
        </div>
        <label className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pay applications…"
            aria-label="Search pay applications"
            className="focus-ring h-9 w-full rounded-lg border border-border bg-transparent pl-8 pr-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand"
          />
        </label>
      </div>

      <div className={cn("grid gap-4", open ? "xl:grid-cols-[minmax(0,1fr)_430px]" : "")}>
        <Panel className="min-w-0">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-5 py-14 text-center">
              <Check className="size-5 text-success" />
              <p className="text-[13.5px] font-semibold text-foreground">Nothing here</p>
              <p className="max-w-sm text-[12.5px] text-muted-foreground">
                {tab === "all"
                  ? "No pay statements yet. They build themselves as dailies are approved."
                  : "No statements in this state."}
              </p>
            </div>
          ) : (
            <>
              {/* The table, from md up. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium sm:px-5">Pay application</th>
                      <th className="px-3 py-2.5 font-medium">Subcontractor / project</th>
                      <th className="px-3 py-2.5 font-medium">Period</th>
                      <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 text-right font-medium sm:px-5" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((s) => {
                      const st = STATUS[s.status] ?? STATUS.VOID;
                      return (
                        <tr
                          key={s.id}
                          onClick={() => setOpenId(openId === s.id ? null : s.id)}
                          className={cn(
                            "cursor-pointer border-b border-border/40 last:border-0 hover:bg-foreground/[0.03]",
                            openId === s.id && "bg-brand/[0.07] ring-1 ring-inset ring-brand/30",
                          )}
                        >
                          <td className="px-4 py-3 sm:px-5">
                            <span className="num block text-[12.5px] font-semibold text-foreground">
                              {s.number}
                            </span>
                            <span className="text-[11.5px] text-muted-foreground">
                              {s.dailyCount} dail{s.dailyCount === 1 ? "y" : "ies"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-2">
                              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand/15 text-[10.5px] font-bold text-brand-bright ring-1 ring-inset ring-brand/25">
                                {initials(s.company)}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-[12.5px] font-medium text-foreground">
                                  {s.company}
                                </span>
                                <span className="block truncate text-[11.5px] text-muted-foreground">
                                  {s.project || "—"}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="num px-3 py-3 text-[11.5px] text-muted-foreground">
                            {period(s)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="num block text-[12.5px] font-semibold text-foreground">
                              {formatCurrency(s.subtotal)}
                            </span>
                            <span className="num block text-[11px] text-muted-foreground">
                              Retainage: {formatCurrency(s.retainage)}
                            </span>
                            <span className="num block text-[11px] text-muted-foreground">
                              Net: {formatCurrency(s.net)}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset",
                                st.cls,
                              )}
                            >
                              {st.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              <SubLine s={s} />
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right sm:px-5">
                            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-bright">
                              View <ChevronRight className="size-3.5" />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cards below md. The same rows, stacked, because six columns on a
                  phone is six columns nobody can read. */}
              <ul className="divide-y divide-border/40 md:hidden">
                {shown.map((s) => {
                  const st = STATUS[s.status] ?? STATUS.VOID;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(s.id)}
                        className="focus-ring flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-foreground/[0.03]"
                      >
                        <span className="flex items-center gap-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand/15 text-[10.5px] font-bold text-brand-bright ring-1 ring-inset ring-brand/25">
                            {initials(s.company)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-foreground">
                              {s.company}
                            </span>
                            <span className="num block truncate text-[11px] text-muted-foreground">
                              {s.number} · {s.dailyCount} dail{s.dailyCount === 1 ? "y" : "ies"}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                              st.cls,
                            )}
                          >
                            {st.label}
                          </span>
                        </span>
                        <span className="flex items-end justify-between gap-2">
                          <span className="num text-[11.5px] text-muted-foreground">
                            {period(s)}
                          </span>
                          <span className="text-right">
                            <span className="num block text-[13px] font-semibold text-foreground">
                              {formatCurrency(s.net)}
                            </span>
                            <span className="num block text-[10.5px] text-muted-foreground">
                              net of {formatCurrency(s.retainage)} retainage
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>

        {/* The statement itself. A column beside the list on a wide screen, and
            a screen of its own below that. */}
        {open ? (
          <>
            <div className="hidden xl:block">
              <div className="sticky top-4">
                <StatementDetail s={open} onClose={() => setOpenId(null)} />
              </div>
            </div>
            <div className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-3 backdrop-blur-sm xl:hidden">
              <StatementDetail s={open} onClose={() => setOpenId(null)} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** The one line under a status that says what actually happened. */
function SubLine({ s }: { s: SubInvoiceRow }) {
  if (s.status === "DISPUTED") return <>{s.disputeNote ? `“${s.disputeNote}”` : "Raised by the crew"}</>;
  if (s.status === "PAID") return <>Paid{s.dueDate ? "" : ""}</>;
  if (s.acceptedAt) return <>Accepted {s.acceptedAt.slice(0, 10)}</>;
  if (s.issuedAt) return <>Approved {s.issuedAt}</>;
  return <>Built from approved dailies</>;
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
  ring,
  active,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: string;
  ring: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2.5">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset", ring, tone)}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="eyebrow block">{label}</span>
          <span className={cn("num block text-[19px] font-semibold tracking-[-0.02em]", tone)}>
            {value}
          </span>
        </span>
      </span>
      <span className="mt-1 block truncate text-[11.5px] text-muted-foreground">{hint}</span>
    </>
  );

  if (!onClick) return <div className="surface px-4 py-3.5">{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "surface focus-ring px-4 py-3.5 text-left transition-colors hover:bg-foreground/[0.03]",
        active && "ring-1 ring-inset ring-brand/40",
      )}
    >
      {body}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * One statement, in full.
 * ------------------------------------------------------------------ */

type DetailTab = "overview" | "dailies" | "earnings";

function StatementDetail({ s, onClose }: { s: SubInvoiceRow; onClose: () => void }) {
  const [tab, setTab] = React.useState<DetailTab>("overview");
  const st = STATUS[s.status] ?? STATUS.VOID;

  /**
   * The dailies behind the figure, rebuilt from the lines.
   *
   * The statement does not store which days it covers — its lines carry the
   * daily they came from, which is the same fact without a second copy of it
   * that could disagree.
   */
  const dailies = React.useMemo(() => {
    const by = new Map<
      string,
      { dailyId: string; workDate: string; locations: Set<string>; ft: number; each: number; value: number }
    >();
    for (const l of s.lines) {
      const key = l.dailyId || l.workDate || l.id;
      const held = by.get(key) ?? {
        dailyId: l.dailyId,
        workDate: l.workDate,
        locations: new Set<string>(),
        ft: 0,
        each: 0,
        value: 0,
      };
      if (l.location) held.locations.add(l.location);
      if ((l.unit || "").toLowerCase().startsWith("ft")) held.ft += l.quantity;
      else held.each += l.quantity;
      held.value += l.amount;
      by.set(key, held);
    }
    return [...by.values()].sort((a, b) => a.workDate.localeCompare(b.workDate));
  }, [s.lines]);

  /** The same lines rolled up by code, which is how a total is checked. */
  const byCode = React.useMemo(() => {
    const by = new Map<string, { code: string; description: string; unit: string; quantity: number; rate: number; amount: number }>();
    for (const l of s.lines) {
      const held = by.get(l.code);
      if (held) {
        held.quantity += l.quantity;
        held.amount += l.amount;
      } else {
        by.set(l.code, {
          code: l.code,
          description: l.description,
          unit: l.unit,
          quantity: l.quantity,
          rate: l.rate,
          amount: l.amount,
        });
      }
    }
    return [...by.values()].sort((a, b) => b.amount - a.amount);
  }, [s.lines]);

  return (
    <Panel className="max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div className="flex items-start gap-2 border-b border-border/70 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-ring mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-[14px] font-semibold text-foreground">{s.number}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset",
                st.cls,
              )}
            >
              {st.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {s.company} · {s.project || "—"}
            {s.projectNumber ? <span className="num"> {s.projectNumber}</span> : null} · {period(s)}
          </p>
        </div>
      </div>

      {/* What it comes to, before anything is argued about.
          Two across, not four: the drawer is 430px on a laptop and four tiles
          in it truncated every label to "GROSS AM…", which is a figure nobody
          can name. */}
      <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:px-5">
        <Tile label="Gross" value={formatCurrency(s.subtotal)} />
        <Tile
          label={`Retainage ${+(s.retainagePct * 100).toFixed(2)}%`}
          value={formatCurrency(s.retainage)}
        />
        <Tile label="Net payable" value={formatCurrency(s.net)} tone="text-gold" />
        <Tile
          label={`${s.dailyCount === 1 ? "Daily" : "Dailies"} included`}
          value={String(s.dailyCount)}
        />
      </div>

      <Stepper status={s.status} paid={s.status === "PAID"} />

      <div className="flex items-center gap-1 border-b border-border/70 px-4 sm:px-5">
        {([
          ["overview", "Overview"],
          ["dailies", `Dailies ${dailies.length}`],
          ["earnings", "Earnings"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "focus-ring -mb-px border-b-2 px-2 py-2 text-[12px] font-medium transition-colors",
              tab === id
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
        {tab === "dailies" ? (
          dailies.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No lines on this statement yet.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Date</th>
                  <th className="py-1.5 pr-2 font-medium">Location</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Production</th>
                  <th className="py-1.5 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {dailies.map((d) => (
                  <tr key={d.dailyId || d.workDate} className="border-b border-border/30 last:border-0">
                    <td className="num py-1.5 pr-2 text-[11.5px] text-foreground">{d.workDate}</td>
                    <td className="max-w-[140px] truncate py-1.5 pr-2 text-[11.5px] text-muted-foreground">
                      {[...d.locations].join(", ") || "—"}
                    </td>
                    <td className="num py-1.5 pr-2 text-right text-[11.5px] text-foreground">
                      {d.ft > 0 ? `${formatNumber(d.ft)} ft` : ""}
                      {d.ft > 0 && d.each > 0 ? " + " : ""}
                      {d.each > 0 ? `${formatNumber(d.each)} ea` : ""}
                    </td>
                    <td className="num py-1.5 text-right text-[11.5px] font-medium text-foreground">
                      {formatCurrency(d.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}

        {tab === "earnings" ? (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Code</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Rate (we pay)</th>
                  <th className="py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {byCode.map((l) => (
                  <tr key={l.code} className="border-b border-border/30 last:border-0">
                    <td className="py-1.5 pr-2">
                      <span className="num block text-[11.5px] font-semibold text-foreground">
                        {l.code}
                      </span>
                      <span className="block max-w-[150px] truncate text-[10.5px] text-muted-foreground">
                        {l.description}
                      </span>
                    </td>
                    <td className="num py-1.5 pr-2 text-right text-[11.5px] text-foreground">
                      {formatNumber(l.quantity)} {l.unit}
                    </td>
                    <td className="num py-1.5 pr-2 text-right text-[11.5px] text-muted-foreground">
                      {formatCurrency(l.rate)}
                    </td>
                    <td className="num py-1.5 text-right text-[11.5px] font-medium text-foreground">
                      {formatCurrency(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="flex flex-col gap-1 border-t border-border/60 pt-2 text-[12px]">
              <Row label="Total gross" value={formatCurrency(s.subtotal)} />
              <Row
                label={`Retainage (${+(s.retainagePct * 100).toFixed(2)}%)`}
                value={`-${formatCurrency(s.retainage)}`}
              />
              {s.fee > 0 ? (
                <Row
                  label={`Fast pay fee (${s.fastPayFeePct}%)`}
                  value={`-${formatCurrency(s.fee)}`}
                />
              ) : null}
              <Row label="Net payable" value={formatCurrency(s.net)} strong />
            </dl>
          </>
        ) : null}

        {tab === "overview" ? (
          <>
            {/* The two ways this settles, with what each one costs. Our own
                figures — the house fee, not whatever a mockup said. */}
            <p className="eyebrow">Payment option</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Option
                picked={!s.fastPay}
                title="Standard"
                terms={`Net ${STANDARD_TERMS_DAYS}`}
                detail={s.dueDate ? `Due ${s.dueDate}` : "Due from the week's cutoff"}
                amount={formatCurrency(s.fastPay ? s.payable : s.net)}
              />
              <Option
                picked={s.fastPay}
                title="Fast pay"
                terms={`Net ${FAST_PAY_DAYS} by wire`}
                detail={
                  s.fastPay
                    ? `${s.fastPayFeePct}% fee — ${formatCurrency(s.fee)}`
                    : `${FAST_PAY_FEE_PCT}% fee — ${formatCurrency(
                        Math.round(s.payable * (FAST_PAY_FEE_PCT / 100) * 100) / 100,
                      )}`
                }
                amount={formatCurrency(
                  s.fastPay
                    ? s.net
                    : Math.round(
                        (s.payable - Math.round(s.payable * (FAST_PAY_FEE_PCT / 100) * 100) / 100) * 100,
                      ) / 100,
                )}
                tone="gold"
              />
            </div>
            {s.fastPay && s.fastPayElectedBy ? (
              <p className="text-[11px] text-muted-foreground">
                Fast pay taken by {s.fastPayElectedBy}
                {s.fastPayElectedAt ? ` on ${s.fastPayElectedAt.slice(0, 10)}` : ""}.
              </p>
            ) : null}

            {s.status === "DISPUTED" ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-critical/30 bg-critical/[0.07] px-2.5 py-2 text-[12px] text-foreground">
                <Ban className="mt-0.5 size-3.5 shrink-0 text-critical" />
                <span>
                  {s.disputedBy || "The crew"} raised a query
                  {s.disputedAt ? ` on ${s.disputedAt.slice(0, 10)}` : ""}
                  {s.disputeNote ? `: “${s.disputeNote}”` : "."} Settle it before paying.
                </span>
              </p>
            ) : null}
          </>
        ) : null}

        {/* Unchanged. Approving, recording what moved and the remittance all
            still happen here, exactly as they did before this screen was
            redrawn. */}
        <div className="border-t border-border/60 pt-3">
          <PayAppActions
            id={s.id}
            state={s.status as "DRAFT" | "ISSUED" | "ACCEPTED" | "DISPUTED" | "PAID" | "VOID"}
            net={s.net}
            payable={s.payable}
            paid={s.status === "PAID"}
            fastPay={s.fastPay}
            canElectFast={s.canElectFastPay}
          />
        </div>
      </div>
    </Panel>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-foreground/[0.02] px-2.5 py-2">
      <p className="eyebrow">{label}</p>
      <p className={cn("num mt-0.5 text-[15px] font-semibold text-foreground", tone)}>{value}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn("text-muted-foreground", strong && "font-semibold text-foreground")}>
        {label}
      </dt>
      <dd className={cn("num text-foreground", strong && "text-[13px] font-semibold")}>{value}</dd>
    </div>
  );
}

function Option({
  picked,
  title,
  terms,
  detail,
  amount,
  tone,
}: {
  picked: boolean;
  title: string;
  terms: string;
  detail: string;
  amount: string;
  tone?: "gold";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        picked
          ? tone === "gold"
            ? "border-gold/40 bg-gold/[0.07]"
            : "border-brand/40 bg-brand/[0.07]"
          : "border-border/70 bg-foreground/[0.02]",
      )}
    >
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
        <span
          className={cn(
            "grid size-3.5 place-items-center rounded-full ring-1 ring-inset",
            picked ? "bg-brand ring-brand" : "ring-border",
          )}
        >
          {picked ? <Check className="size-2.5 text-white" /> : null}
        </span>
        {title}
      </p>
      <p className="num mt-0.5 text-[11px] text-muted-foreground">{terms}</p>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
      <p className="num mt-1 text-[13px] font-semibold text-foreground">{amount}</p>
    </div>
  );
}

/**
 * Where this statement has got to.
 *
 * Four steps, and the second one is the office's: a statement is approved for
 * payment here rather than waiting on a crew to press accept. See
 * issueSubInvoice.
 */
function Stepper({ status, paid }: { status: string; paid: boolean }) {
  const steps = ["Dailies approved", "Approved for payment", "Scheduled", "Paid"];
  const at = paid ? 3 : status === "ISSUED" || status === "ACCEPTED" ? 2 : status === "DRAFT" ? 1 : 1;

  return (
    <div className="flex items-center gap-1 border-b border-border/70 px-4 py-3 sm:px-5">
      {steps.map((label, i) => {
        const done = i < at;
        const here = i === at;
        return (
          <React.Fragment key={label}>
            <div className="flex min-w-0 flex-col items-center gap-1">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ring-1 ring-inset",
                  done
                    ? "bg-success/15 text-success ring-success/30"
                    : here
                      ? "bg-warning/15 text-warning ring-warning/30"
                      : "bg-foreground/[0.04] text-muted-foreground ring-border",
                )}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "max-w-[72px] text-center text-[9.5px] leading-tight",
                  here ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <span
                className={cn("mb-4 h-px min-w-3 flex-1", done ? "bg-success/40" : "bg-border")}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}
