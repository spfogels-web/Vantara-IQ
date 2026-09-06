"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  Loader2,
  Send,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, todayET } from "@/lib/format";
import type { SubInvoiceRow } from "@/data/queries";
import {
  generateSubInvoices,
  issueSubInvoice,
  markSubInvoicePaid,
  recordSubPayment,
  reopenSubInvoice,
} from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * What we owe one crew, and where each statement stands.
 *
 * Fortitude sends; the crew answers. Accepting is theirs alone — an office that
 * can accept on a crew's behalf turns the timestamp into paperwork, and the
 * timestamp is the only reason to ask.
 */

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-foreground/[0.06] text-muted-foreground" },
  ISSUED: { label: "With the crew", cls: "bg-info/12 text-info" },
  ACCEPTED: { label: "Accepted", cls: "bg-success/12 text-success" },
  DISPUTED: { label: "Queried", cls: "bg-critical/12 text-critical" },
  PAID: { label: "Paid", cls: "bg-success/12 text-success" },
  VOID: { label: "Void", cls: "bg-foreground/[0.06] text-muted-foreground line-through" },
};

export function SubPayPanel({
  subcontractorId,
  invoices,
}: {
  subcontractorId: string;
  invoices: SubInvoiceRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  /** Which statement's payment is being keyed in. */
  const [paying, setPaying] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const mine = invoices.filter((i) => i.subcontractorId === subcontractorId);
  const owed = mine
    .filter((i) => i.status === "ISSUED" || i.status === "ACCEPTED" || i.status === "DISPUTED")
    .reduce((s, i) => s + i.net, 0);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    setNote(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok && res.error) setError(res.error);
    else router.refresh();
  }

  async function catchUp() {
    setBusy("gen");
    setError(null);
    setNote(null);
    const res = await generateSubInvoices(subcontractorId);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const bits = [`${res.filed} daily${res.filed === 1 ? "" : "s"} onto ${res.created} statement${res.created === 1 ? "" : "s"}`];
    if (res.unpriced.length) {
      bits.push(`no rate for ${res.unpriced.join(", ")} — that work is unpaid`);
    }
    setNote(bits.join(". ") + ".");
    router.refresh();
  }

  return (
    <Panel>
      <PanelHeader
        title="Pay statements"
        description="What we owe this crew, priced at their signed card. They accept or query it."
        count={mine.length}
        icon={<Wallet className="size-3.5" />}
      >
        <button
          type="button"
          onClick={() => void catchUp()}
          disabled={Boolean(busy)}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
        >
          {busy === "gen" ? <Loader2 className="size-3.5 animate-spin" /> : null} Catch up
        </button>
      </PanelHeader>

      {note || error ? (
        <PanelBody className="py-2">
          {error ? <p className="text-[12px] text-critical">{error}</p> : null}
          {note ? <p className="text-[12px] text-success">{note}</p> : null}
        </PanelBody>
      ) : null}

      {mine.length === 0 ? (
        <PanelBody className="py-7 text-center text-[12.5px] text-muted-foreground">
          Nothing yet. A statement opens for each week their approved dailies cover.
        </PanelBody>
      ) : (
        <>
          {owed > 0 ? (
            <p className="border-b border-border/70 px-3 py-2 text-[11.5px] text-muted-foreground">
              <span className="num font-semibold text-foreground">{formatCurrency(owed)}</span> owed
              and not yet paid.
            </p>
          ) : null}
          <ul className="divide-y divide-border/40">
            {mine.map((inv) => {
              const st = STATUS[inv.status] ?? STATUS.DRAFT;
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <span className="num text-[12.5px] font-semibold text-foreground">{inv.number}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", st.cls)}>
                    {st.label}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {inv.project || "—"} · {inv.periodStart}–{inv.periodEnd} · {inv.dailyCount} dailies
                  </span>
                  <span className="num ml-auto text-[13px] font-semibold text-foreground">
                    {formatCurrency(inv.net)}
                  </span>

                  {inv.status === "DRAFT" ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void run(inv.id, () => issueSubInvoice(inv.id))}
                      className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
                    >
                      <Send className="size-3" /> Send to crew
                    </button>
                  ) : null}

                  {inv.status === "ACCEPTED" ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => setPaying(paying === inv.id ? null : inv.id)}
                      className="focus-ring inline-flex h-7 items-center gap-1 rounded bg-success/15 px-2 text-[11.5px] font-semibold text-success hover:bg-success/25 disabled:opacity-40"
                    >
                      <Check className="size-3" /> Record payment
                    </button>
                  ) : null}

                  {/* The remittance to send with the transfer. Offered from the
                      moment the crew agrees the figures, because it is often
                      produced before the ACH is keyed rather than after. */}
                  {inv.status === "ACCEPTED" || inv.status === "PAID" ? (
                    <a
                      href={`/api/remittance/${inv.id}`}
                      className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] font-medium text-foreground hover:border-brand/60"
                    >
                      <Download className="size-3" /> Remittance
                    </a>
                  ) : null}

                  {paying === inv.id ? (
                    <RecordPayment
                      invoiceId={inv.id}
                      owed={inv.net}
                      method={inv.fastPay ? "WIRE" : "ACH"}
                      onDone={() => {
                        setPaying(null);
                        router.refresh();
                      }}
                    />
                  ) : null}

                  {inv.status === "DISPUTED" ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void run(inv.id, () =>
                          reopenSubInvoice(inv.id, "Reopened to correct the dailies behind it."),
                        )
                      }
                      className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
                    >
                      Reopen
                    </button>
                  ) : null}

                  {inv.fastPay ? (
                    <span className="num flex w-full items-center gap-1.5 text-[11px] text-brand">
                      <Zap className="size-3 shrink-0" />
                      Fast pay · pay by WIRE by {inv.dueDate || "—"} ·{" "}
                      {formatCurrency(inv.subtotal)} less {inv.fastPayFeePct}% ({formatCurrency(inv.fee)})
                    </span>
                  ) : inv.dueDate ? (
                    <span className="num flex w-full items-center gap-1.5 text-[11px] text-muted-foreground">
                      NET {inv.termsDays} by ACH · due {inv.dueDate}
                    </span>
                  ) : null}

                  {/* The record of their answer, where the office can see it. */}
                  {inv.acceptedAt ? (
                    <span className="flex w-full items-center gap-1.5 text-[11px] text-success">
                      <ShieldCheck className="size-3" />
                      Accepted by {inv.acceptedBy || "the crew"} on {inv.acceptedAt}
                    </span>
                  ) : null}
                  {inv.status === "DISPUTED" ? (
                    <span className="flex w-full items-start gap-1.5 text-[11px] text-critical">
                      <TriangleAlert className="mt-px size-3 shrink-0" />
                      {inv.disputedBy || "The crew"} on {inv.disputedAt}: {inv.disputeNote}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}


/**
 * The detail of a payment, keyed as it is sent.
 *
 * Four fields and no more: how much left, the day it left, which rail, and the
 * bank's reference. That last one is the only thing that settles an argument —
 * a crew who cannot find the money rings up and reads their statement number,
 * and somebody has to be able to answer with a trace.
 *
 * The amount is prefilled with what is owed but stays editable, because short
 * payments and corrections happen and a form that refuses them just means the
 * real figure never gets written down.
 */
function RecordPayment({
  invoiceId,
  owed,
  method: initialMethod,
  onDone,
}: {
  invoiceId: string;
  owed: number;
  method: "ACH" | "WIRE";
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState(owed.toFixed(2));
  const [paidOn, setPaidOn] = React.useState(todayET());
  const [method, setMethod] = React.useState(initialMethod);
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await recordSubPayment({
      id: invoiceId,
      amount: Number.parseFloat(amount),
      paidOn,
      method,
      reference,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.warning) {
      // Recorded, but the figure does not match what was owed. Said out loud
      // rather than filed quietly — a short payment is real, a typo is not.
      setError(res.warning);
      window.setTimeout(onDone, 2500);
      return;
    }
    onDone();
  }

  return (
    <div className="mt-2 flex w-full flex-wrap items-end gap-2 rounded-lg border border-border bg-foreground/[0.03] p-2.5">
      <Field label="Amount sent">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="num h-8 w-28 rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none focus:border-brand"
        />
      </Field>
      <Field label="Date it moved">
        <input
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          className="num h-8 rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none focus:border-brand"
        />
      </Field>
      <Field label="Method">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as "ACH" | "WIRE")}
          className="h-8 rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none focus:border-brand"
        >
          <option value="ACH">ACH</option>
          <option value="WIRE">Wire</option>
        </select>
      </Field>
      <Field label="Trace / confirmation">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="From the bank"
          className="h-8 w-44 rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand"
        />
      </Field>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-[12px] font-semibold text-black disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Record
      </button>

      {error ? <span className="w-full text-[11.5px] text-warning">{error}</span> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
