"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  MessageSquare,
  Search,
  ShieldAlert,
  Undo2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/common/panel";
import { StatStrip } from "@/components/common/page-shell";
import { BillingStatusChip } from "@/components/billing/status-chip";
import {
  STATUS_LABEL,
  STATUS_MEANING,
  STATUS_ORDER,
  type BillingStatus,
} from "@/lib/billing-status";
import {
  acceptDocumentation,
  markNotBillable,
  overrideHold,
  rejectDocumentation,
  requestDocumentation,
} from "@/app/billing/hold-actions";
import type { BillingReadinessRow } from "@/lib/types";

/**
 * The office's billing queue: what is built, and what is stopping it billing.
 *
 * The question this screen answers is the one that used to be answered by
 * somebody remembering. A daily is approved, the work is real, and the invoice
 * cannot go out because a photograph never arrived — and before this there were
 * two ways to deal with that, both wrong: bill it anyway, or delete the
 * production. The row stays, the footage stays, and the bill waits.
 *
 * Five columns of money, and all of them are the customer's. Nothing on this
 * screen is what a crew is owed; the two are different questions with different
 * rate cards, and a screen that mixed them would eventually pay somebody a
 * customer rate.
 */

/** Totals, where the cents are noise. */
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * A unit rate, to the cent.
 *
 * Never rounded. The totals above round because nobody argues about the cents
 * on a $13,090 figure, but a rate is quoted back — a card that reads $8.50
 * rendered as "$9" is a figure somebody will repeat to a customer, and it is
 * simply not the rate.
 */
const rateMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const FIELD =
  "focus-ring h-8 rounded-lg border border-border bg-transparent px-2 text-[12px] font-medium text-foreground outline-none focus:border-brand";

type GroupBy = "project" | "week" | "crew" | "customer" | "none";

const GROUP_LABEL: Record<GroupBy, string> = {
  project: "Group by job",
  week: "Group by billing week",
  crew: "Group by crew",
  customer: "Group by customer",
  none: "No grouping",
};

/** The one tab that is the reason this page exists. */
const HELD: BillingStatus[] = ["NEEDS_DOCUMENTATION", "CREW_RESPONDED"];

export function BillingReadinessView({ rows }: { rows: BillingReadinessRow[] }) {
  const [tab, setTab] = React.useState<"held" | BillingStatus | "all">("held");
  const [customer, setCustomer] = React.useState("");
  const [project, setProject] = React.useState("");
  const [market, setMarket] = React.useState("");
  const [crew, setCrew] = React.useState("");
  const [week, setWeek] = React.useState("");
  const [minAge, setMinAge] = React.useState(0);
  const [group, setGroup] = React.useState<GroupBy>("project");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);

  /** The values each filter actually has to offer, off the data itself. */
  const { customers, projects, markets, crews, weeks } = React.useMemo(() => {
    const uniq = (pick: (r: BillingReadinessRow) => string) =>
      [...new Set(rows.map(pick).filter(Boolean))].sort();
    return {
      customers: uniq((r) => r.customer),
      projects: uniq((r) => r.projectName),
      markets: uniq((r) => r.market),
      crews: uniq((r) => r.subcontractor),
      // Newest week first: the office works backwards from this Friday.
      weeks: uniq((r) => r.billingWeekEnd).reverse(),
    };
  }, [rows]);

  /** Counts on the tabs themselves, over everything except the status filter. */
  const scoped = React.useMemo(
    () =>
      rows.filter(
        (r) =>
          (!customer || r.customer === customer) &&
          (!project || r.projectName === project) &&
          (!market || r.market === market) &&
          (!crew || r.subcontractor === crew) &&
          (!week || r.billingWeekEnd === week) &&
          (!minAge || (r.ageDays ?? 0) >= minAge) &&
          (!q.trim() ||
            [r.code, r.projectName, r.projectNumber, r.customer, r.subcontractor, r.requirement]
              .join(" ")
              .toLowerCase()
              .includes(q.trim().toLowerCase())),
      ),
    [rows, customer, project, market, crew, week, minAge, q],
  );

  const shown = React.useMemo(() => {
    const byTab =
      tab === "all"
        ? scoped
        : tab === "held"
          ? scoped.filter((r) => HELD.includes(r.status))
          : scoped.filter((r) => r.status === tab);
    // Oldest request first inside a group: the thing that has been stuck
    // longest is the thing somebody should be chasing.
    return [...byTab].sort(
      (a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1) || b.workDate.localeCompare(a.workDate),
    );
  }, [scoped, tab]);

  const groups = React.useMemo(() => {
    if (group === "none") return [{ key: "", rows: shown }];
    const keyOf = (r: BillingReadinessRow) =>
      group === "project"
        ? `${r.projectName}${r.projectNumber ? ` · ${r.projectNumber}` : ""}`
        : group === "week"
          ? r.billingWeekEnd || "No billing week"
          : group === "crew"
            ? r.subcontractor || "Unattributed"
            : r.customer || "No customer";
    const map = new Map<string, BillingReadinessRow[]>();
    for (const r of shown) {
      const k = keyOf(r);
      const bucket = map.get(k);
      if (bucket) bucket.push(r);
      else map.set(k, [r]);
    }
    return [...map.entries()].map(([key, rs]) => ({ key, rows: rs }));
  }, [shown, group]);

  const sum = (rs: BillingReadinessRow[], pick: (r: BillingReadinessRow) => number) =>
    rs.reduce((n, r) => n + pick(r), 0);

  const heldRows = scoped.filter((r) => HELD.includes(r.status));
  const stats = [
    {
      label: "Approved but held",
      value: money(sum(heldRows, (r) => r.heldAmount)),
      hint: `${heldRows.length} code${heldRows.length === 1 ? "" : "s"} · ${qty(
        sum(heldRows, (r) => r.held),
      )} units`,
      tone: heldRows.length ? "text-critical" : undefined,
    },
    {
      label: "Waiting on the office",
      value: String(scoped.filter((r) => r.status === "CREW_RESPONDED").length),
      hint: "Crew says the documentation is in",
      tone: scoped.some((r) => r.status === "CREW_RESPONDED") ? "text-warning" : undefined,
    },
    {
      label: "Ready to bill",
      value: money(
        sum(
          scoped.filter((r) => r.status === "READY_TO_BILL" || r.status === "READY_OVERRIDE"),
          (r) => r.billableAmount,
        ),
      ),
      hint: "Nothing outstanding",
      tone: "text-success",
    },
    {
      label: "Staged",
      value: money(sum(scoped.filter((r) => r.status === "STAGED"), (r) => r.billed * (r.rate ?? 0))),
      hint: "On a draft invoice",
    },
    {
      label: "Billed",
      value: money(sum(scoped.filter((r) => r.status === "BILLED"), (r) => r.billed * (r.rate ?? 0))),
      hint: "The customer has it",
    },
  ];

  const tabs: { id: "held" | BillingStatus | "all"; label: string; count: number }[] = [
    { id: "held", label: "Approved but held", count: heldRows.length },
    ...STATUS_ORDER.filter((s) => !HELD.includes(s)).map((s) => ({
      id: s,
      label: STATUS_LABEL[s].replace(" — admin override", " (override)"),
      count: scoped.filter((r) => r.status === s).length,
    })),
    { id: "all" as const, label: "Everything", count: scoped.length },
  ];

  const open = shown.find((r) => `${r.dailyId}:${r.code}` === openId) ?? null;
  const filtered = customer || project || market || crew || week || minAge > 0 || q.trim();

  return (
    <div className="flex flex-col gap-4">
      <StatStrip stats={stats} />

      {/* Status first. Everything else narrows within it. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max items-center gap-1">
          {tabs.map((t) => (
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
                  t.count > 0 ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground/60",
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] p-2.5">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Code, job, crew…"
            aria-label="Search"
            className={cn(FIELD, "w-[180px] pl-7 font-normal")}
          />
        </label>
        <Filter value={customer} onChange={setCustomer} label="Customer" options={customers} />
        <Filter value={project} onChange={setProject} label="Job" options={projects} />
        <Filter value={market} onChange={setMarket} label="Market" options={markets} />
        <Filter value={crew} onChange={setCrew} label="Crew" options={crews} />
        <Filter value={week} onChange={setWeek} label="Billing week" options={weeks} />
        <select
          value={String(minAge)}
          onChange={(e) => setMinAge(Number(e.target.value))}
          aria-label="Age of request"
          className={FIELD}
        >
          <option value="0">Any age</option>
          <option value="3">Waiting 3+ days</option>
          <option value="7">Waiting 7+ days</option>
          <option value="14">Waiting 14+ days</option>
          <option value="30">Waiting 30+ days</option>
        </select>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as GroupBy)}
          aria-label="Grouping"
          className={cn(FIELD, "ml-auto")}
        >
          {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
            <option key={g} value={g}>
              {GROUP_LABEL[g]}
            </option>
          ))}
        </select>
        {filtered ? (
          <button
            type="button"
            onClick={() => {
              setCustomer("");
              setProject("");
              setMarket("");
              setCrew("");
              setWeek("");
              setMinAge(0);
              setQ("");
            }}
            className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" /> Clear
          </button>
        ) : null}
      </div>

      <p className="text-[12px] text-muted-foreground">
        {tab === "all" ? "Every approved unit code." : STATUS_MEANING[tab === "held" ? "NEEDS_DOCUMENTATION" : tab]}
      </p>

      <div className={cn("grid gap-4", open ? "lg:grid-cols-[minmax(0,1fr)_380px]" : "")}>
        <div className="flex min-w-0 flex-col gap-3">
          {groups.length === 0 || shown.length === 0 ? (
            <Panel>
              <div className="flex flex-col items-center gap-1.5 px-5 py-14 text-center">
                <Check className="size-5 text-success" />
                <p className="text-[13.5px] font-semibold text-foreground">Nothing here</p>
                <p className="max-w-sm text-[12.5px] text-muted-foreground">
                  {tab === "held"
                    ? "No approved production is waiting on documentation."
                    : "No codes match these filters."}
                </p>
              </div>
            </Panel>
          ) : (
            groups.map((g) => (
              <Group
                key={g.key || "all"}
                label={g.key}
                rows={g.rows}
                openId={openId}
                onOpen={setOpenId}
              />
            ))
          )}
        </div>

        {open ? (
          <div className="lg:sticky lg:top-4 lg:self-start">
            <ReviewDrawer row={open} onClose={() => setOpenId(null)} />
          </div>
        ) : null}
      </div>

      {/* Said plainly, because a bounded list that does not say it is bounded is
          a list somebody will trust for a question it cannot answer. */}
      <div className="border-t border-border/60 pt-3">
        <p className="text-[11.5px] text-muted-foreground">
          Approved production from the last 120 days, plus anything held from billing however old.
          Denied and unreviewed dailies are not here — they are not billable for an ordinary reason,
          and listing them would bury the days that genuinely are stuck.
        </p>
      </div>
    </div>
  );
}

function Filter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
}) {
  // A filter for a dimension the data does not have is a control that does
  // nothing. Two markets and one customer is the normal state of a small
  // contractor's week, and the selector would just take up the row.
  if (options.length < 2) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={FIELD}
    >
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Group({
  label,
  rows,
  openId,
  onOpen,
}: {
  label: string;
  rows: BillingReadinessRow[];
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const held = rows.reduce((n, r) => n + r.heldAmount, 0);

  return (
    <Panel>
      {label ? (
        <PanelHeader
          title={label}
          count={rows.length}
          icon={<FileText className="size-3.5 text-gold" />}
        >
          <div className="flex items-center gap-2">
            {held > 0 ? (
              <span className="num rounded bg-critical/15 px-1.5 py-0.5 text-[11px] font-semibold text-critical">
                {money(held)} held
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand" : "Collapse"}
              className="focus-ring grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
            >
              <ChevronDown className={cn("size-4 transition-transform", collapsed && "-rotate-90")} />
            </button>
          </div>
        </PanelHeader>
      ) : null}

      {collapsed ? null : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:px-5">Worked</th>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 text-right font-medium">Produced</th>
                <th className="px-4 py-2 text-right font-medium">Held</th>
                <th className="px-4 py-2 text-right font-medium">Billable</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Outstanding</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Held value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = `${r.dailyId}:${r.code}`;
                return (
                  <tr
                    key={id}
                    onClick={() => onOpen(openId === id ? null : id)}
                    className={cn(
                      "cursor-pointer border-b border-border/40 text-[12.5px] last:border-0 hover:bg-foreground/[0.03]",
                      openId === id && "bg-brand/[0.06]",
                    )}
                  >
                    <td className="px-4 py-2.5 sm:px-5">
                      <span className="num text-foreground">{r.workDate}</span>
                      {r.ageDays !== null && r.ageDays > 0 ? (
                        <span
                          className={cn(
                            "num ml-1.5 text-[11px]",
                            r.ageDays >= 7 ? "text-critical" : "text-muted-foreground",
                          )}
                        >
                          {r.ageDays}d
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="num rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[11.5px] font-semibold text-foreground ring-1 ring-inset ring-foreground/[0.06]">
                        {r.code}
                      </span>
                    </td>
                    <td className="num px-4 py-2.5 text-right font-medium text-foreground">
                      {qty(r.produced)}
                      {r.unit ? (
                        <span className="ml-0.5 text-[10px] text-muted-foreground">{r.unit}</span>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "num px-4 py-2.5 text-right font-medium",
                        r.held > 0 ? "text-critical" : "text-muted-foreground/50",
                      )}
                    >
                      {r.held > 0 ? qty(r.held) : "—"}
                    </td>
                    <td
                      className={cn(
                        "num px-4 py-2.5 text-right font-medium",
                        r.billable > 0 ? "text-success" : "text-muted-foreground/50",
                      )}
                    >
                      {r.billable > 0 ? qty(r.billable) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <BillingStatusChip status={r.status} short />
                    </td>
                    <td className="max-w-[240px] px-4 py-2.5">
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {r.status === "NEEDS_DOCUMENTATION" || r.status === "CREW_RESPONDED"
                          ? r.missing.join(", ") || r.requirement
                          : r.status === "READY_OVERRIDE"
                            ? `Waived: ${r.overrideReason}`
                            : r.invoices.map((i) => i.number).join(", ") || "—"}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "num px-4 py-2.5 text-right font-semibold sm:px-5",
                        r.heldAmount > 0 ? "text-critical" : "text-muted-foreground/50",
                      )}
                    >
                      {r.rate === null ? (
                        <span className="text-[11px] font-medium text-warning">no rate</span>
                      ) : r.heldAmount > 0 ? (
                        money(r.heldAmount)
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/**
 * One code, in full, with the things the office can do about it.
 *
 * Every action names who did it and, for an override, why. That is the whole
 * value of the record: a month later somebody has to be able to tell the
 * difference between documentation that was received and documentation that was
 * waived, and no amount of "ready to bill" on a screen will tell them.
 */
function ReviewDrawer({ row, onClose }: { row: BillingReadinessRow; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState<"none" | "request" | "reject" | "override" | "void">(
    "none",
  );
  const [note, setNote] = React.useState("");

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn().catch(() => ({ ok: false, error: "That didn't go through." }));
    setBusy(null);
    if (!res.ok) return setError(res.error ?? "That didn't go through.");
    setPanel("none");
    setNote("");
    router.refresh();
  }

  const held = row.status === "NEEDS_DOCUMENTATION" || row.status === "CREW_RESPONDED";
  const settled = row.status === "BILLED";

  return (
    <Panel>
      <PanelHeader title={`${row.code} — ${qty(row.produced)} ${row.unit || ""}`.trim()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-ring grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </PanelHeader>

      <div className="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
        <BillingStatusChip status={row.status} className="self-start" />
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {STATUS_MEANING[row.status]}
        </p>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/60 pt-3 text-[12px]">
          <Fact label="Job" value={row.projectName} href={row.projectId ? `/projects/${row.projectId}` : undefined} />
          <Fact label="Job number" value={row.projectNumber || "—"} />
          <Fact label="Customer" value={row.customer || "—"} />
          <Fact label="Market" value={row.market || "Unassigned"} />
          <Fact label="Crew" value={row.subcontractor || "—"} />
          <Fact label="Worked" value={row.workDate} />
          <Fact label="Bills to" value={row.billingWeekEnd || "—"} />
          <Fact label="Daily" value="Open sheet" href={`/dailies?sheet=${row.dailyId}`} />
        </dl>

        {/* Production, held and billable, never collapsed into one figure. */}
        <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
          <Cell label="Produced" value={qty(row.produced)} />
          <Cell label="Held" value={row.held > 0 ? qty(row.held) : "—"} tone={row.held > 0 ? "text-critical" : undefined} />
          <Cell
            label="Billable"
            value={row.billable > 0 ? qty(row.billable) : "—"}
            tone={row.billable > 0 ? "text-success" : undefined}
          />
        </div>

        {row.rate !== null ? (
          <p className="text-[11.5px] text-muted-foreground">
            Customer rate {rateMoney(row.rate)} · {money(row.billableAmount)} billable
            {row.heldAmount > 0 ? (
              <>
                {" · "}
                <span className="font-semibold text-critical">{money(row.heldAmount)} held</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-[11.5px] text-warning">
            No rate on the customer&apos;s card for this code, so it cannot be priced.
          </p>
        )}

        {/* What is outstanding, and the history of asking for it. */}
        {row.requirement ? (
          <div className="rounded-lg border border-border/70 bg-foreground/[0.02] p-3">
            <p className="eyebrow">Requirement</p>
            <p className="mt-0.5 text-[12.5px] font-medium text-foreground">{row.requirement}</p>
            {row.missing.length ? (
              <ul className="mt-1.5 flex flex-col gap-1">
                {row.missing.map((m) => (
                  <li key={m} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-critical" />
                    {m}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 flex flex-col gap-0.5 text-[11.5px] text-muted-foreground">
              {row.raisedBy ? (
                <span>
                  Asked by {row.raisedBy}
                  {row.raisedAt ? ` · ${row.raisedAt.slice(0, 10)}` : ""}
                  {row.ageDays !== null ? ` · ${row.ageDays} days ago` : ""}
                </span>
              ) : null}
              {row.respondedBy ? (
                <span className="text-warning">
                  {row.respondedBy} responded{row.respondedAt ? ` ${row.respondedAt.slice(0, 10)}` : ""}
                  {row.responseNote ? ` — “${row.responseNote}”` : ""}
                </span>
              ) : null}
              {row.resolutionNote ? <span>Office note: {row.resolutionNote}</span> : null}
              {row.overrideReason ? (
                <span className="text-gold">
                  Waived by {row.resolvedBy} — {row.overrideReason}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {row.invoices.length ? (
          <div className="border-t border-border/60 pt-3">
            <p className="eyebrow">On invoices</p>
            <ul className="mt-1 flex flex-col gap-1">
              {row.invoices.map((i, n) => (
                <li key={`${i.number}-${n}`} className="flex items-center justify-between text-[12px]">
                  <Link href="/invoicing" className="font-medium text-brand-bright hover:underline">
                    {i.number}
                  </Link>
                  <span className="num text-muted-foreground">
                    {qty(i.quantity)} · {i.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <p className="text-[12px] font-medium text-critical">{error}</p> : null}

        {/* Actions. A sent invoice is the customer's figure; it is not edited
            from here, and there is nothing to offer. */}
        {settled ? (
          <p className="border-t border-border/60 pt-3 text-[12px] text-muted-foreground">
            This is on an invoice the customer has. Correcting it takes a credit, not an edit.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
            {!held && row.status !== "NOT_BILLABLE" ? (
              <Act
                label="Request documentation"
                icon={<MessageSquare className="size-3.5" />}
                onClick={() => setPanel(panel === "request" ? "none" : "request")}
              />
            ) : null}
            {held ? (
              <>
                <Act
                  label="Accept"
                  icon={<Check className="size-3.5" />}
                  tone="success"
                  busy={busy === "accept"}
                  onClick={() => run("accept", () => acceptDocumentation({ holdId: row.holdId! }))}
                />
                <Act
                  label="Send back"
                  icon={<Undo2 className="size-3.5" />}
                  onClick={() => setPanel(panel === "reject" ? "none" : "reject")}
                />
                <Act
                  label="Override"
                  icon={<ShieldAlert className="size-3.5" />}
                  tone="warning"
                  onClick={() => setPanel(panel === "override" ? "none" : "override")}
                />
              </>
            ) : null}
            {row.status !== "NOT_BILLABLE" && row.billed === 0 ? (
              <Act
                label="Not billable"
                icon={<Ban className="size-3.5" />}
                onClick={() => setPanel(panel === "void" ? "none" : "void")}
              />
            ) : null}
          </div>
        )}

        {panel === "request" ? (
          <Ask
            title="What is missing?"
            hint="The crew sees this, so say what to send. Left blank, they get the standard list for this code."
            value={note}
            onChange={setNote}
            required={false}
            busy={busy === "request"}
            cta="Hold and ask"
            onSubmit={() =>
              run("request", () =>
                requestDocumentation({
                  dailyId: row.dailyId,
                  code: row.code,
                  missing: note.trim() ? note.split("\n").map((l) => l.trim()).filter(Boolean) : undefined,
                }),
              )
            }
          />
        ) : null}

        {panel === "reject" ? (
          <Ask
            title="What is still needed?"
            hint="This goes to the crew. “Not enough” sends them back to guess."
            value={note}
            onChange={setNote}
            busy={busy === "reject"}
            cta="Send back"
            onSubmit={() => run("reject", () => rejectDocumentation({ holdId: row.holdId!, reason: note }))}
          />
        ) : null}

        {panel === "override" ? (
          <Ask
            title="Why is this billing without the documentation?"
            hint="Kept on the record permanently, with your name. The requirement is not erased — the row will read “admin override”, never “ready to bill”."
            value={note}
            onChange={setNote}
            busy={busy === "override"}
            cta="Release for billing"
            tone="warning"
            onSubmit={() => run("override", () => overrideHold({ holdId: row.holdId!, reason: note }))}
          />
        ) : null}

        {panel === "void" ? (
          <Ask
            title="Why is this not billable to the customer?"
            hint="The production stays on the daily. It simply never goes on an invoice."
            value={note}
            onChange={setNote}
            busy={busy === "void"}
            cta="Mark not billable"
            onSubmit={() =>
              run("void", () => markNotBillable({ dailyId: row.dailyId, code: row.code, reason: note }))
            }
          />
        ) : null}
      </div>
    </Panel>
  );
}

function Fact({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-foreground">
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-brand-bright hover:underline">
            {value} <ArrowRight className="size-3" />
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-foreground/[0.02] px-2.5 py-2">
      <p className="eyebrow">{label}</p>
      <p className={cn("num mt-0.5 text-[15px] font-semibold text-foreground", tone)}>{value}</p>
    </div>
  );
}

function Act({
  label,
  icon,
  onClick,
  busy,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone?: "success" | "warning";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-60",
        tone === "success"
          ? "border-success/30 bg-success/10 text-success hover:bg-success/15"
          : tone === "warning"
            ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15"
            : "border-border text-foreground hover:bg-foreground/[0.05]",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function Ask({
  title,
  hint,
  value,
  onChange,
  onSubmit,
  cta,
  busy,
  required = true,
  tone,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  cta: string;
  busy?: boolean;
  required?: boolean;
  tone?: "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.03] p-3">
      <p className="text-[12.5px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="focus-ring mt-2 w-full rounded-lg border border-border bg-transparent px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-brand"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || (required && !value.trim())}
        className={cn(
          "focus-ring mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white disabled:opacity-50",
          tone === "warning" ? "bg-warning/90 hover:bg-warning" : "brand-gradient",
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
        {cta}
      </button>
    </div>
  );
}
