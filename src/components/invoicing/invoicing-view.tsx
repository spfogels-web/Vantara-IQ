"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2, Plus, Send, Trash2, Wallet, X } from "lucide-react";

import { InvoiceLines } from "@/components/invoicing/invoice-lines";
import { InvoiceCostPanel } from "@/components/invoicing/invoice-cost";

import { cn } from "@/lib/utils";
import { formatCurrency, formatRate } from "@/lib/format";
import type { ArTotals, InvoiceRow } from "@/data/queries";
import {
  deletePayment,
  generateInvoices,
  issueInvoice,
  recordPayment,
  voidInvoice,
} from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";

/**
 * The billing floor: what is staged, what is out, and what has come back.
 *
 * Every figure here is a stored invoice number or a recorded payment. Nothing
 * on this screen is estimated, and nothing is inferred from an invoice's age —
 * an invoice is paid when money covering it has been entered against it.
 */

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-foreground/[0.06] text-muted-foreground",
  SENT: "bg-info/12 text-info",
  PARTIAL: "bg-warning/12 text-warning",
  PAID: "bg-success/12 text-success",
  VOID: "bg-foreground/[0.06] text-muted-foreground line-through",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIAL: "Part paid",
  PAID: "Paid",
  VOID: "Void",
};

export function InvoicingView({
  invoices,
  ar,
  customers,
}: {
  invoices: InvoiceRow[];
  ar: ArTotals;
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [payingId, setPayingId] = React.useState<string | null>(null);

  const drafts = invoices.filter((i) => i.status === "DRAFT");
  const outstanding = invoices.filter(
    (i) => i.status !== "DRAFT" && i.status !== "VOID" && i.balance > 0.005,
  );
  const rest = invoices.filter((i) => !drafts.includes(i) && !outstanding.includes(i));

  async function generate(customerId: string) {
    setBusy(true);
    setNote(null);
    setError(null);
    const res = await generateInvoices(customerId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const bits = [
      `${res.filed} daily${res.filed === 1 ? "" : "s"} filed onto ${res.created} invoice${res.created === 1 ? "" : "s"}, ${res.lines} priced line${res.lines === 1 ? "" : "s"}`,
    ];
    // Say what was left out. A run that silently drops work reads as a
    // complete one, and the money never turns up missing until much later.
    if (res.skipped > 0) bits.push(`${res.skipped} could not be billed`);
    if (res.unpriced.length > 0) {
      bits.push(`no rate on the card for ${res.unpriced.join(", ")} — that work is not on any invoice`);
    }
    setNote(bits.join(". ") + ".");
    router.refresh();
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok && res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Staged (draft)" value={ar.draftValue} hint={`${ar.counts.draft} to send`} />
        <Stat
          label="Open AR"
          value={ar.openAr}
          hint={`${ar.counts.open} outstanding`}
          tone={ar.openAr > 0 ? "text-warning" : undefined}
        />
        <Stat
          label="Past due"
          value={ar.pastDue}
          hint={ar.counts.pastDue > 0 ? `${ar.counts.pastDue} overdue` : "none overdue"}
          tone={ar.pastDue > 0 ? "text-critical" : undefined}
        />
        <Stat label="Retainage held" value={ar.retainageHeld} hint="until release" />
        <Stat label="Collected" value={ar.collected} hint={`of ${formatCurrency(ar.invoiced)} invoiced`} />
      </div>

      <Panel>
        <PanelHeader
          title="Bill approved dailies"
          description="Approved work only, batched by week, priced at the card in force on the work date"
          icon={<Wallet className="size-3.5 text-warning" />}
        >
          {customers.map((c) => (
            <Button
              key={c.id}
              size="sm"
              disabled={busy}
              onClick={() => void generate(c.id)}
              className="h-8 gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {c.name}
            </Button>
          ))}
        </PanelHeader>
        {note || error ? (
          <PanelBody className="py-2.5">
            {error ? <p className="text-[12px] text-critical">{error}</p> : null}
            {note ? <p className="text-[12px] text-success">{note}</p> : null}
          </PanelBody>
        ) : null}
      </Panel>

      <InvoiceTable
        title="Ready to send"
        description="Drafts you can still regenerate — nothing here has been seen by the customer"
        rows={drafts}
        busy={busy}
        payingId={payingId}
        setPayingId={setPayingId}
        onIssue={(id) => void run(() => issueInvoice(id))}
        onVoid={(id, reason) => void run(() => voidInvoice(id, reason))}
        onPaid={() => router.refresh()}
        onDeletePayment={(id) => void run(() => deletePayment(id))}
      />

      <InvoiceTable
        title="Outstanding"
        description="Sent and not yet covered by payments"
        rows={outstanding}
        busy={busy}
        payingId={payingId}
        setPayingId={setPayingId}
        onIssue={(id) => void run(() => issueInvoice(id))}
        onVoid={(id, reason) => void run(() => voidInvoice(id, reason))}
        onPaid={() => router.refresh()}
        onDeletePayment={(id) => void run(() => deletePayment(id))}
      />

      {rest.length > 0 ? (
        <InvoiceTable
          title="Settled and void"
          description="Closed out — kept on the record rather than deleted"
          rows={rest}
          busy={busy}
          payingId={payingId}
          setPayingId={setPayingId}
          onIssue={(id) => void run(() => issueInvoice(id))}
          onVoid={(id, reason) => void run(() => voidInvoice(id, reason))}
          onPaid={() => router.refresh()}
          onDeletePayment={(id) => void run(() => deletePayment(id))}
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: string;
}) {
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

function InvoiceTable({
  title,
  description,
  rows,
  busy,
  payingId,
  setPayingId,
  onIssue,
  onVoid,
  onPaid,
  onDeletePayment,
}: {
  title: string;
  description: string;
  rows: InvoiceRow[];
  busy: boolean;
  payingId: string | null;
  setPayingId: (id: string | null) => void;
  onIssue: (id: string) => void;
  onVoid: (id: string, reason: string) => void;
  onPaid: () => void;
  onDeletePayment: (id: string) => void;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <Panel>
      <PanelHeader title={title} description={description} count={rows.length} />
      {rows.length === 0 ? (
        <PanelBody className="py-7 text-center text-[12.5px] text-muted-foreground">
          Nothing here.
        </PanelBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium sm:px-5">Invoice</th>
                <th className="px-3 py-2.5 font-medium">Project</th>
                <th className="px-3 py-2.5 font-medium">Week</th>
                <th className="px-3 py-2.5 font-medium">Due</th>
                <th className="px-3 py-2.5 text-right font-medium">Billed</th>
                <th className="px-3 py-2.5 text-right font-medium">Retainage</th>
                <th className="px-3 py-2.5 text-right font-medium">Due now</th>
                <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <React.Fragment key={inv.id}>
                  <tr className="border-b border-border/40 hover:bg-foreground/[0.02]">
                    <td className="px-4 py-2.5 sm:px-5">
                      <button
                        type="button"
                        onClick={() => setOpenId(openId === inv.id ? null : inv.id)}
                        className="focus-ring num inline-flex items-center gap-1 rounded text-[12.5px] font-semibold text-brand-bright hover:underline"
                      >
                        {/* The row expands, and nothing said so — a caret and a
                            label are the difference between a feature that
                            exists and one anybody finds. */}
                        <ChevronRight
                          className={cn(
                            "size-3.5 transition-transform",
                            openId === inv.id && "rotate-90",
                          )}
                        />
                        {inv.number}
                      </button>
                      <p className="text-[11px] text-muted-foreground">
                        {inv.dailyCount} dail{inv.dailyCount === 1 ? "y" : "ies"} · {inv.lineCount} lines
                      </p>
                      <button
                        type="button"
                        onClick={() => setOpenId(openId === inv.id ? null : inv.id)}
                        className="focus-ring rounded text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {openId === inv.id ? "Hide details" : "Review, edit & see margin"}
                      </button>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-[12px] text-muted-foreground">
                      {inv.project || "—"}
                    </td>
                    <td className="num px-3 py-2.5 text-[11.5px] text-muted-foreground">
                      {inv.periodStart} – {inv.periodEnd}
                    </td>
                    <td className="num px-3 py-2.5 text-[11.5px]">
                      <span className={inv.pastDue ? "font-medium text-critical" : "text-muted-foreground"}>
                        {inv.dueAt ?? "—"}
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-[12.5px] text-foreground">
                      {formatCurrency(inv.subtotal)}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-[12px] text-muted-foreground">
                      {inv.retainageHeld > 0 ? `−${formatCurrency(inv.retainageHeld)}` : "—"}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-[12.5px] font-semibold text-foreground">
                      {formatCurrency(inv.amountDue)}
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-2.5 text-right text-[12.5px] font-medium",
                        inv.balance > 0.005
                          ? inv.pastDue
                            ? "text-critical"
                            : "text-warning"
                          : "text-success",
                      )}
                    >
                      {inv.status === "VOID" ? "—" : formatCurrency(inv.balance)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          STATUS_STYLE[inv.status] ?? STATUS_STYLE.DRAFT,
                        )}
                      >
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {inv.status === "DRAFT" ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onIssue(inv.id)}
                            title="Send this invoice"
                            className="focus-ring mr-1 inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
                          >
                            <Send className="size-3" /> Send
                          </button>
                          <VoidButton busy={busy} onVoid={(r) => onVoid(inv.id, r)} />
                        </>
                      ) : inv.status !== "VOID" && inv.balance > 0.005 ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPayingId(payingId === inv.id ? null : inv.id)}
                          className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
                        >
                          <Check className="size-3" /> Record payment
                        </button>
                      ) : null}
                    </td>
                  </tr>

                  {payingId === inv.id ? (
                    <tr className="border-b border-border/40 bg-foreground/[0.02]">
                      <td colSpan={10} className="px-4 py-3 sm:px-5">
                        <PaymentForm
                          invoice={inv}
                          onDone={() => {
                            setPayingId(null);
                            onPaid();
                          }}
                          onCancel={() => setPayingId(null)}
                        />
                      </td>
                    </tr>
                  ) : null}

                  {openId === inv.id ? (
                    <tr className="border-b border-border/40 bg-foreground/[0.02]">
                      <td colSpan={10} className="px-4 py-3 sm:px-5">
                        {/* What is on the bill comes before what has been paid
                            against it — this panel is opened to check the work,
                            and the payments are the answer to a later question. */}
                        <div className="mb-4">
                          <InvoiceLines invoiceId={inv.id} onChanged={onPaid} />
                        </div>

                        {/* What the same work costs us, directly under what we
                            charged for it — the two figures only mean
                            something next to each other. */}
                        <div className="mb-4 border-t border-border/50 pt-3">
                          <InvoiceCostPanel invoiceId={inv.id} />
                        </div>

                        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                          Payments received
                        </p>
                        {inv.payments.length === 0 ? (
                          <p className="text-[12px] text-muted-foreground">
                            Nothing received against this invoice yet.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {inv.payments.map((p) => (
                              <li
                                key={p.id}
                                className="flex flex-wrap items-center gap-3 rounded border border-border/60 px-2.5 py-1.5 text-[12px]"
                              >
                                <span className="num font-semibold text-success">
                                  {formatCurrency(p.amount)}
                                </span>
                                <span className="num text-muted-foreground">{p.receivedOn}</span>
                                {p.method ? <span className="text-muted-foreground">{p.method}</span> : null}
                                {p.reference ? (
                                  <span className="num text-muted-foreground/80">#{p.reference}</span>
                                ) : null}
                                {p.note ? (
                                  <span className="text-muted-foreground/80">{p.note}</span>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => onDeletePayment(p.id)}
                                  title="Remove this payment"
                                  className="focus-ring ml-auto grid size-6 place-items-center rounded text-muted-foreground hover:text-critical disabled:opacity-40"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** A void has to carry a reason, so the gap in the numbering is explainable. */
function VoidButton({ busy, onVoid }: { busy: boolean; onVoid: (reason: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  if (!open) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] text-muted-foreground hover:border-critical/40 hover:text-critical disabled:opacity-40"
      >
        Void
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={reason}
        autoFocus
        placeholder="Reason"
        onChange={(e) => setReason(e.target.value)}
        className="w-36 rounded border border-border/70 bg-foreground/[0.04] px-1.5 py-0.5 text-[11.5px] text-foreground outline-none focus:border-brand/60"
      />
      <button
        type="button"
        disabled={busy || !reason.trim()}
        onClick={() => onVoid(reason)}
        className="focus-ring grid size-6 place-items-center rounded text-critical hover:bg-foreground/[0.06] disabled:opacity-40"
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:bg-foreground/[0.06]"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

/**
 * Enter money that landed.
 *
 * The amount defaults to the outstanding balance because that is the common
 * case, and the date defaults to nothing — the bank's date is the one that
 * matters, and pre-filling today invites recording the wrong one.
 */
function PaymentForm({
  invoice,
  onDone,
  onCancel,
}: {
  invoice: InvoiceRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = React.useState(invoice.balance.toFixed(2));
  const [receivedOn, setReceivedOn] = React.useState("");
  const [method, setMethod] = React.useState("ACH");
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await recordPayment(invoice.id, {
      amount: Number(amount),
      receivedOn,
      method,
      reference,
    });
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.error);
  }

  const short = Number(amount) > 0 && Number(amount) < invoice.balance - 0.005;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Field label="Amount">
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="num w-28 rounded border border-border/70 bg-foreground/[0.04] px-2 py-1 text-right text-[12.5px] text-foreground outline-none focus:border-brand/60"
        />
      </Field>
      <Field label="Received on">
        <input
          type="date"
          value={receivedOn}
          onChange={(e) => setReceivedOn(e.target.value)}
          className="num rounded border border-border/70 bg-foreground/[0.04] px-2 py-1 text-[12.5px] text-foreground outline-none focus:border-brand/60"
        />
      </Field>
      <Field label="Method">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="rounded border border-border/70 bg-foreground/[0.04] px-2 py-1 text-[12.5px] text-foreground outline-none focus:border-brand/60"
        >
          <option>ACH</option>
          <option>Check</option>
          <option>Wire</option>
          <option>Card</option>
          <option>Other</option>
        </select>
      </Field>
      <Field label="Reference">
        <input
          value={reference}
          placeholder="Check / trace no."
          onChange={(e) => setReference(e.target.value)}
          className="num w-36 rounded border border-border/70 bg-foreground/[0.04] px-2 py-1 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand/60"
        />
      </Field>
      <button
        type="submit"
        disabled={busy}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Record
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="focus-ring inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
      {/* A short payment is normal, not an error — but it should be visible
          before it's recorded, not discovered later in the balance column. */}
      {short ? (
        <span className="text-[11.5px] text-warning">
          {formatRate(invoice.balance - Number(amount))} will stay outstanding.
        </span>
      ) : null}
      {error ? <span className="text-[11.5px] text-critical">{error}</span> : null}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
