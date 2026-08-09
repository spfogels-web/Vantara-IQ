"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, ShieldCheck, TriangleAlert, X, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatRate } from "@/lib/format";
import {
  FAST_PAY_DAYS,
  FAST_PAY_FEE_PCT,
  STANDARD_TERMS_DAYS,
  dueDateFromCutoff,
  fastPayQuote,
  type FastPayQuote,
} from "@/lib/fast-pay";
import type { SubInvoiceRow } from "@/data/queries";
import { acceptSubInvoice, disputeSubInvoice, electFastPay } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * What a crew is owed, and their answer to it.
 *
 * Every line is their own production at their own signed rate, itemised by day
 * and code, so the statement can be checked against the sheets they filed
 * rather than taken on trust. Nothing here mentions what the work was billed
 * for — that is the other side of the same job and none of their business.
 *
 * Accepting records who and exactly when. That timestamp is the point of the
 * whole screen: it is the difference between "we sent it" and "they agreed".
 */

const STATUS: Record<string, { label: string; cls: string }> = {
  ISSUED: { label: "Waiting on you", cls: "bg-warning/12 text-warning" },
  ACCEPTED: { label: "Accepted", cls: "bg-success/12 text-success" },
  DISPUTED: { label: "You raised a query", cls: "bg-critical/12 text-critical" },
  PAID: { label: "Paid", cls: "bg-success/12 text-success" },
  VOID: { label: "Void", cls: "bg-foreground/[0.06] text-muted-foreground line-through" },
};

export function PayStatements({ invoices }: { invoices: SubInvoiceRow[] }) {
  const waiting = invoices.filter((i) => i.status === "ISSUED");
  const settled = invoices.filter((i) => i.status !== "ISSUED");

  const owed = invoices
    .filter((i) => i.status === "ISSUED" || i.status === "ACCEPTED")
    .reduce((s, i) => s + i.subtotal, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Awaiting your approval" value={waiting.reduce((s, i) => s + i.subtotal, 0)} hint={`${waiting.length} statement${waiting.length === 1 ? "" : "s"}`} tone={waiting.length ? "text-warning" : undefined} />
        {/* Settled figures are what actually lands, not what the work came to
            — on a fast-pay statement those are different numbers, and the one
            worth showing is the one that hits the account. */}
        <Stat label="Approved, not yet paid" value={invoices.filter((i) => i.status === "ACCEPTED").reduce((s, i) => s + i.net, 0)} hint="agreed with Fortitude" />
        <Stat label="Paid" value={invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.net, 0)} hint="settled" />
      </div>

      {waiting.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Waiting on you"
            description="Check each line against your sheets, then accept or tell us what's wrong"
            count={waiting.length}
            icon={<TriangleAlert className="size-3.5 text-warning" />}
          />
          <ul className="divide-y divide-border/40">
            {waiting.map((inv) => (
              <StatementRow key={inv.id} invoice={inv} actionable />
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title={waiting.length > 0 ? "Everything else" : "Your statements"}
          description="Priced from your approved dailies at your signed rates"
          count={settled.length}
          icon={<FileText className="size-3.5" />}
        />
        {settled.length === 0 ? (
          <PanelBody className="py-10 text-center">
            <FileText className="mx-auto size-6 text-muted-foreground/40" />
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {invoices.length === 0
                ? "No statements yet. One is prepared for each week your approved dailies cover, and appears here when Fortitude sends it."
                : "Nothing settled yet."}
            </p>
            {owed > 0 ? null : null}
          </PanelBody>
        ) : (
          <ul className="divide-y divide-border/40">
            {settled.map((inv) => (
              <StatementRow key={inv.id} invoice={inv} actionable={false} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-foreground/[0.02] px-3 py-2.5">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 text-[18px] font-semibold tracking-[-0.02em] text-foreground", tone)}>
        {value > 0 ? formatCurrency(value) : "—"}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StatementRow({ invoice: inv, actionable }: { invoice: SubInvoiceRow; actionable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(actionable);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [disputing, setDisputing] = React.useState(false);
  const [note, setNote] = React.useState("");
  /** Which way they are taking this statement. Standard until they say so. */
  const [fast, setFast] = React.useState(false);

  const st = STATUS[inv.status] ?? STATUS.ISSUED;

  // What fast pay would cost on this statement, quoted live from the same
  // rules the server freezes onto the record when it is elected.
  const quote = fastPayQuote(inv.subtotal);

  // Both dates counted from the Friday that closed the week, so the choice is
  // between two calendar dates rather than two abstractions.
  const standardDue = dueDateFromCutoff(inv.periodEnd, STANDARD_TERMS_DAYS);
  const fastDue = dueDateFromCutoff(inv.periodEnd, FAST_PAY_DAYS);

  async function accept() {
    setBusy("accept");
    setError(null);
    const res = await acceptSubInvoice(inv.id, fast);
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function takeFastPay() {
    setBusy("fast");
    setError(null);
    const res = await electFastPay(inv.id);
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function dispute() {
    if (!note.trim()) return;
    setBusy("dispute");
    setError(null);
    const res = await disputeSubInvoice(inv.id, note);
    setBusy(null);
    if (res.ok) {
      setDisputing(false);
      router.refresh();
    } else setError(res.error);
  }

  // Group by day, because that is how a crew remembers the week.
  const byDay = React.useMemo(() => {
    const m = new Map<string, typeof inv.lines>();
    for (const l of inv.lines) m.set(l.workDate, [...(m.get(l.workDate) ?? []), l]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [inv]);

  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="focus-ring num rounded text-[13px] font-semibold text-brand-bright hover:underline"
        >
          {inv.number}
        </button>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", st.cls)}>{st.label}</span>
        <span className="text-[12px] text-muted-foreground">
          {inv.project || "—"} · {inv.periodStart} to {inv.periodEnd}
        </span>
        <span className="num ml-auto text-[15px] font-semibold text-foreground">
          {formatCurrency(inv.subtotal)}
        </span>
      </div>

      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {inv.dailyCount} dail{inv.dailyCount === 1 ? "y" : "ies"} · {inv.lines.length} line
        {inv.lines.length === 1 ? "" : "s"}
        {inv.issuedAt ? ` · sent ${inv.issuedAt}` : ""}
      </p>

      {/* The record of their answer, once given. */}
      {inv.acceptedAt ? (
        <p className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-success/25 bg-success/[0.05] px-2.5 py-1.5 text-[11.5px] text-success">
          <ShieldCheck className="size-3.5 shrink-0" />
          Accepted by {inv.acceptedBy || "the crew"} on {inv.acceptedAt}
        </p>
      ) : null}

      {/* Once elected, the terms are the record — what was taken off, what is
          left, when it lands and how. Every figure it was agreed on. */}
      {inv.fastPay ? (
        <div className="mt-1.5 rounded-lg border border-brand/30 bg-brand/[0.06] px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-brand">
            <Zap className="size-3.5 shrink-0" />
            Fast pay · NET {inv.termsDays} by wire
          </p>
          <p className="num mt-0.5 text-[11.5px] text-muted-foreground">
            {formatCurrency(inv.subtotal)} less {inv.fastPayFeePct}% ({formatCurrency(inv.fee)}) ={" "}
            <span className="font-semibold text-foreground">{formatCurrency(inv.net)}</span>
            {inv.dueDate ? ` · due ${inv.dueDate}` : ""}
          </p>
          {inv.fastPayElectedAt ? (
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">
              Elected by {inv.fastPayElectedBy || "the crew"} on {inv.fastPayElectedAt}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Accepted on standard terms, but the money is not out yet — they can
          still trade the fee for the shorter wait. */}
      {!inv.fastPay && inv.canElectFastPay && !actionable ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-medium text-foreground">Need it sooner?</p>
            <p className="num text-[11px] text-muted-foreground">
              Fast pay lands {formatCurrency(quote.net)} within {FAST_PAY_DAYS} days by wire, after
              the {FAST_PAY_FEE_PCT}% fee of {formatCurrency(quote.fee)}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void takeFastPay()}
            disabled={Boolean(busy)}
            className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {busy === "fast" ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            Take fast pay
          </button>
        </div>
      ) : null}
      {inv.status === "DISPUTED" ? (
        <p className="mt-1.5 rounded-lg border border-critical/25 bg-critical/[0.05] px-2.5 py-1.5 text-[11.5px] text-critical">
          Query raised {inv.disputedAt} by {inv.disputedBy || "the crew"}: {inv.disputeNote}
        </p>
      ) : null}
      {inv.resolutionNote ? (
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          <span className="font-medium">Fortitude:</span> {inv.resolutionNote}
        </p>
      ) : null}

      {open ? (
        <div className="mt-2.5 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-border/60 bg-foreground/[0.02] text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Work</th>
                <th className="px-3 py-2 text-right font-medium">Quantity</th>
                <th className="px-3 py-2 text-right font-medium">Your rate</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map(([day, lines]) =>
                lines.map((l, i) => (
                  <tr key={l.id} className="border-b border-border/30 last:border-0">
                    <td className="num px-3 py-1.5 text-[11.5px] text-muted-foreground">
                      {i === 0 ? day : ""}
                    </td>
                    <td className="num px-3 py-1.5 text-[12px] font-semibold uppercase text-brand-bright">
                      {l.code}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-1.5 text-[12px] text-muted-foreground">
                      {l.description}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-[12px] text-foreground">
                      {formatNumber(l.quantity)} {l.unit}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-[12px] text-muted-foreground">
                      {formatRate(l.rate)}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-[12.5px] font-medium text-foreground">
                      {formatCurrency(l.amount)}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/60 bg-foreground/[0.02]">
                <td colSpan={5} className="px-3 py-2 text-right text-[12px] font-medium text-muted-foreground">
                  {inv.fastPay ? "Work total" : "Total owed to you"}
                </td>
                <td className="num px-3 py-2 text-right text-[14px] font-semibold text-foreground">
                  {formatCurrency(inv.subtotal)}
                </td>
              </tr>
              {/* The fee is shown as its own line rather than folded into the
                  total, so what was taken off is on the statement itself and
                  not only in a banner above it. */}
              {inv.fastPay ? (
                <>
                  <tr className="bg-foreground/[0.02]">
                    <td colSpan={5} className="px-3 py-1.5 text-right text-[12px] text-muted-foreground">
                      Fast pay fee ({inv.fastPayFeePct}%)
                    </td>
                    <td className="num px-3 py-1.5 text-right text-[12.5px] text-muted-foreground">
                      −{formatCurrency(inv.fee)}
                    </td>
                  </tr>
                  <tr className="border-t border-border/60 bg-brand/[0.05]">
                    <td colSpan={5} className="px-3 py-2 text-right text-[12px] font-medium text-brand">
                      You receive · NET {inv.termsDays} by wire
                    </td>
                    <td className="num px-3 py-2 text-right text-[14px] font-semibold text-foreground">
                      {formatCurrency(inv.net)}
                    </td>
                  </tr>
                </>
              ) : null}
            </tfoot>
          </table>
        </div>
      ) : null}

      {error ? <p className="mt-1.5 text-[11.5px] text-critical">{error}</p> : null}

      {actionable && !disputing && !inv.fastPay ? (
        <FastPayChoice
          fast={fast}
          onChange={setFast}
          gross={inv.subtotal}
          quote={quote}
          standardDue={standardDue}
          fastDue={fastDue}
        />
      ) : null}

      {actionable ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {!disputing ? (
            <>
              <button
                type="button"
                onClick={() => void accept()}
                disabled={Boolean(busy)}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-4 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Accept {formatCurrency(fast ? quote.net : inv.subtotal)}
              </button>
              <button
                type="button"
                onClick={() => setDisputing(true)}
                disabled={Boolean(busy)}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] font-medium text-muted-foreground hover:border-critical/40 hover:text-critical disabled:opacity-40"
              >
                <X className="size-3.5" /> Something&apos;s wrong
              </button>
              <span className="text-[11px] text-muted-foreground">
                Accepting records your name and the time
                {fast ? ", and locks in fast pay" : ""}.
              </span>
            </>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <textarea
                value={note}
                autoFocus
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Which day, which code, and what it should be — the more specific, the faster it gets fixed."
                className="w-full rounded-lg border border-border/70 bg-foreground/[0.03] px-2.5 py-2 text-[12.5px] text-foreground outline-none focus:border-brand/60"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void dispute()}
                  disabled={Boolean(busy) || !note.trim()}
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-critical px-3.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  {busy === "dispute" ? <Loader2 className="size-3.5 animate-spin" /> : null} Send to Fortitude
                </button>
                <button
                  type="button"
                  onClick={() => setDisputing(false)}
                  className="focus-ring inline-flex h-9 items-center rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * How they want this one paid.
 *
 * Both options are priced in full before anything is pressed — the whole point
 * of the choice is the difference between two numbers, and a crew should not
 * have to work out four percent of their own statement to see it. The wire is
 * stated rather than offered: it is what clears inside ten days, so there is no
 * ACH option to pick and no promise being made that the rail cannot keep.
 */
function FastPayChoice({
  fast,
  onChange,
  gross,
  quote,
  standardDue,
  fastDue,
}: {
  fast: boolean;
  onChange: (v: boolean) => void;
  gross: number;
  quote: FastPayQuote;
  standardDue: string;
  fastDue: string;
}) {
  return (
    <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      <PayOption
        selected={!fast}
        onSelect={() => onChange(false)}
        title={`Standard · NET ${STANDARD_TERMS_DAYS}`}
        amount={gross}
        amountNote="the full amount"
        detail={
          standardDue
            ? `Paid by ${standardDue} to the account on file. Nothing comes off.`
            : `Paid within ${STANDARD_TERMS_DAYS} days of the Friday cutoff. Nothing comes off.`
        }
      />
      <PayOption
        selected={fast}
        onSelect={() => onChange(true)}
        title={`Fast pay · NET ${quote.days}`}
        amount={quote.net}
        amountNote={`after a ${quote.feePct}% fee of ${formatCurrency(quote.fee)}`}
        detail={
          fastDue
            ? `Paid by ${fastDue} by wire. Wire only — it is what clears that fast.`
            : `Paid within ${quote.days} days of the Friday cutoff, by wire only.`
        }
        accent
      />
    </div>
  );
}

function PayOption({
  selected,
  onSelect,
  title,
  amount,
  amountNote,
  detail,
  accent,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  amount: number;
  amountNote: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "focus-ring rounded-lg border px-2.5 py-2 text-left transition",
        selected
          ? accent
            ? "border-brand/50 bg-brand/[0.08]"
            : "border-success/50 bg-success/[0.06]"
          : "border-border/70 hover:bg-foreground/[0.03]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "grid size-3.5 shrink-0 place-items-center rounded-full border",
            selected
              ? accent
                ? "border-brand bg-brand"
                : "border-success bg-success"
              : "border-muted-foreground/50",
          )}
        >
          {selected ? <Check className="size-2.5 text-white" /> : null}
        </span>
        <span
          className={cn(
            "text-[12px] font-semibold",
            selected ? (accent ? "text-brand" : "text-success") : "text-foreground",
          )}
        >
          {accent ? <Zap className="mr-0.5 inline size-3" /> : null}
          {title}
        </span>
      </div>
      <p className="num mt-1 text-[15px] font-semibold text-foreground">
        {formatCurrency(amount)}
      </p>
      <p className="text-[10.5px] text-muted-foreground">{amountNote}</p>
      <p className="mt-1 text-[10.5px] leading-tight text-muted-foreground">{detail}</p>
    </button>
  );
}
