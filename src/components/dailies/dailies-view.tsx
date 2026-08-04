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
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import type { DailyReport, DailyStatus } from "@/lib/types";
import { formatCurrency, formatFeet, formatNumber, formatWhen } from "@/lib/format";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { reopenDailyReview, reviewDaily } from "@/app/actions";

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
}: {
  dailies: DailyReport[];
  initialId?: string;
  /** dailyId -> { sheetId, projectId }, for dailies that came from a Globe sheet. */
  sheetByDaily?: Record<string, { sheetId: string; projectId: string }>;
  /** Who is signed in — recorded on the approval or denial. */
  reviewerName?: string;
}) {
  const [items, setItems] = React.useState(dailies);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All");
  const [selectedId, setSelectedId] = React.useState(
    initialId && dailies.some((d) => d.id === initialId) ? initialId : dailies[0]?.id ?? null,
  );

  const filtered = filter === "All" ? items : items.filter((d) => d.status === filter);
  const selected = items.find((d) => d.id === selectedId) ?? filtered[0] ?? null;

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
            icon={<ClipboardList className="size-3.5" />}
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
                      active ? "bg-foreground/[0.055]" : "hover:bg-foreground/[0.03]",
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
}: {
  daily: DailyReport;
  onSetStatus: (id: string, status: DailyStatus, tone: DailyReport["tone"]) => void;
  sheet?: { sheetId: string; projectId: string };
  reviewerName?: string;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const decided = d.status === "Approved" || d.status === "Denied";

  // A different daily selected means a different decision — never carry a
  // half-typed reason across.
  React.useEffect(() => {
    setNote("");
    setError(null);
  }, [d.id]);

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
      <Panel>
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
            </div>
            <div className="text-right">
              <p className="eyebrow">Billable</p>
              <p className="num text-[20px] font-semibold tracking-[-0.02em] text-foreground">
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
        <Panel>
          <PanelBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">Globe billing sheet</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                The filled-in form and the day&apos;s redlined map, as submitted.
              </p>
            </div>
            <Link
              href={`/dailies/sheet/${sheet.projectId}?sheet=${sheet.sheetId}`}
              className="focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-bright"
            >
              <FileText className="size-4" /> Open billing sheet
            </Link>
          </PanelBody>
        </Panel>
      ) : null}

      {/* Line items — the digital daily */}
      <Panel>
        <PanelHeader title="Line items" count={d.lineItems.length} icon={<MapPin className="size-3.5" />} />
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
            explanation sends the crew back to guess what to fix. */}
        <div className="mt-auto flex flex-col gap-2 border-t border-border/70 px-4 py-3 sm:px-5">
          {decided ? (
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => void reopen()}
                disabled={busy}
                className="h-9 shrink-0 gap-1.5 rounded-lg text-[12.5px] font-medium"
              >
                Reopen review
              </Button>
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
              <div className="flex flex-wrap items-center justify-end gap-2">
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
