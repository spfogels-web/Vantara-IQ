"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Loader2, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { todayET } from "@/lib/format";
import { issueSubInvoice, recordSubPayment } from "@/app/actions";

/**
 * What the office can do to a pay statement, in the register it works from.
 *
 * The register used to be read-only with two buttons wired to nothing, so the
 * actual work — sending a statement, recording what was paid, producing the
 * letter — happened on a subcontractor's own page, one company at a time. The
 * money goes out in a batch on a Friday; the screen it goes out from should be
 * the one listing every crew.
 *
 * The order here is the order it happens in, and it matters:
 *
 *   accepted → arrange the transfer at the bank → record what moved →
 *   download the remittance → send it
 *
 * The remittance comes last on purpose. It is a letter saying a payment has
 * been made, and a crew holding one before the money is arranged has been told
 * they are being paid — which forecloses holding the cheque over craftsmanship,
 * a decision that is the office's to make right up until the transfer.
 */
export function PayAppActions({
  id,
  state,
  net,
  paid,
  fastPay,
}: {
  id: string;
  state: "DRAFT" | "ISSUED" | "ACCEPTED" | "DISPUTED" | "PAID" | "VOID";
  net: number;
  paid: boolean;
  fastPay: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [amount, setAmount] = React.useState(net.toFixed(2));
  const [paidOn, setPaidOn] = React.useState(todayET());
  const [method, setMethod] = React.useState<"ACH" | "WIRE">(fastPay ? "WIRE" : "ACH");
  const [reference, setReference] = React.useState("");

  async function send() {
    setBusy(true);
    setError(null);
    const res = await issueSubInvoice(id);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function record() {
    setBusy(true);
    setError(null);
    const res = await recordSubPayment({
      id,
      amount: Number.parseFloat(amount),
      paidOn,
      method,
      reference,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.warning) {
      setError(res.warning);
      window.setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 2500);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center justify-end gap-1.5">
        {state === "DRAFT" ? (
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Send to crew
          </button>
        ) : null}

        {state === "ISSUED" ? (
          <span className="text-[11.5px] text-muted-foreground">Waiting on the crew</span>
        ) : null}

        {state === "ACCEPTED" ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-success/15 px-2.5 text-[12px] font-semibold text-success hover:bg-success/25"
          >
            <Check className="size-3.5" /> Record payment
          </button>
        ) : null}

        {/* Available to the office from acceptance, because it is what goes out
            with the transfer. The crew's own copy appears only once a payment
            is recorded. */}
        {state === "ACCEPTED" || state === "PAID" ? (
          <a
            href={`/api/remittance/${id}`}
            title={
              paid
                ? "The remittance for this payment"
                : "Preview — the crew cannot see this until a payment is recorded"
            }
            className={cn(
              "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium",
              paid
                ? "border-border text-foreground hover:border-brand/60"
                : "border-dashed border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Download className="size-3.5" />
            {paid ? "Remittance" : "Preview"}
          </a>
        ) : null}

        {state === "DISPUTED" ? (
          <span className="text-[11.5px] text-critical">Disputed — settle it first</span>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-wrap items-end justify-end gap-2 rounded-lg border border-border bg-foreground/[0.03] p-2.5 text-left">
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
              className="h-8 w-40 rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand"
            />
          </Field>
          <button
            type="button"
            onClick={() => void record()}
            disabled={busy}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-[12px] font-semibold text-black disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Record
          </button>
        </div>
      ) : null}

      {error ? <span className="text-[11.5px] text-warning">{error}</span> : null}
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
