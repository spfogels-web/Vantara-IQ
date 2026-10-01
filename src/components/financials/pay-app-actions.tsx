"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Loader2, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, todayET } from "@/lib/format";
import { FAST_PAY_DAYS, FAST_PAY_FEE_PCT } from "@/lib/fast-pay";
import { electFastPay, issueSubInvoice, recordSubPayment } from "@/app/actions";

/**
 * What the office can do to a pay statement, in the register it works from.
 *
 * The order here is the order it happens in:
 *
 *   approve for payment → arrange the transfer at the bank → record what moved
 *   → download the remittance → email it
 *
 * There is no "send to crew" any more and no waiting on them. One login serves
 * a whole company and it is a foreman using it from a truck, so a statement
 * sitting in ISSUED waiting for somebody to press accept was not protecting
 * their figures — it was holding up their money. The office approves what it is
 * going to pay, the same way it approves the daily underneath it. A crew can
 * still dispute, and a dispute still stops a payment.
 *
 * Fast pay sits here for the same reason. Every crew is on NET 21; the ones who
 * want NET 10 ask for it on the phone, so the button that costs them the fee is
 * on this side of the screen, and it says what it will cost before it is
 * pressed.
 */
export function PayAppActions({
  id,
  state,
  net,
  payable,
  paid,
  fastPay,
  canElectFast,
}: {
  id: string;
  state: "DRAFT" | "ISSUED" | "ACCEPTED" | "DISPUTED" | "PAID" | "VOID";
  /** What lands in their account as things stand. */
  net: number;
  /** Gross less retainage — what the fee would be taken from. */
  payable: number;
  paid: boolean;
  fastPay: boolean;
  canElectFast: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmFast, setConfirmFast] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [amount, setAmount] = React.useState(net.toFixed(2));
  const [paidOn, setPaidOn] = React.useState(todayET());
  const [method, setMethod] = React.useState<"ACH" | "WIRE">(fastPay ? "WIRE" : "ACH");
  const [reference, setReference] = React.useState("");

  // The amount box follows the statement: electing fast pay changes what goes
  // out, and a prefilled figure from before the fee would be paid by mistake.
  React.useEffect(() => {
    setAmount(net.toFixed(2));
    setMethod(fastPay ? "WIRE" : "ACH");
  }, [net, fastPay]);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn().catch(() => ({ ok: false, error: "That didn't go through." }));
    setBusy(null);
    if (!res.ok) return setError(res.error ?? "That didn't go through.");
    setConfirmFast(false);
    router.refresh();
    return res;
  }

  async function record() {
    setBusy("record");
    setError(null);
    const res = await recordSubPayment({
      id,
      amount: Number.parseFloat(amount),
      paidOn,
      method,
      reference,
    });
    setBusy(null);
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

  /** What fast pay would cost on this statement, worked out the way it is charged. */
  const fee = Math.round(payable * (FAST_PAY_FEE_PCT / 100) * 100) / 100;
  const afterFee = Math.round((payable - fee) * 100) / 100;

  const payableNow = state === "ISSUED" || state === "ACCEPTED";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {state === "DRAFT" ? (
          <button
            type="button"
            onClick={() => void run("approve", () => issueSubInvoice(id))}
            disabled={busy !== null}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {busy === "approve" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Approve for payment
          </button>
        ) : null}

        {/* NET 10 on request. Shown while it can still be elected, and never
            once the money has gone — a fee added after the fact is a fee on
            something already received. */}
        {canElectFast && !fastPay && state !== "PAID" && state !== "VOID" ? (
          <button
            type="button"
            onClick={() => setConfirmFast((v) => !v)}
            disabled={busy !== null}
            title={`NET ${FAST_PAY_DAYS} by wire, less ${FAST_PAY_FEE_PCT}%`}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2.5 text-[12px] font-semibold text-gold hover:bg-gold/20 disabled:opacity-40"
          >
            <Zap className="size-3.5" /> NET {FAST_PAY_DAYS}
          </button>
        ) : null}

        {/* Already on fast pay. Deliberately not shaped like the button beside
            it on other rows — a state and an action that look alike is how
            somebody clicks the one they thought was the other. */}
        {fastPay ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gold/80">
            <Zap className="size-3" /> On NET {FAST_PAY_DAYS}, by wire
          </span>
        ) : null}

        {payableNow ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={busy !== null}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-success/15 px-2.5 text-[12px] font-semibold text-success hover:bg-success/25 disabled:opacity-40"
          >
            <Check className="size-3.5" /> Record payment
          </button>
        ) : null}

        {/* Available from approval, because the office emails it. Labelled
            Preview until a payment is recorded: it is a letter saying money has
            been sent, and it should not say that before the money has. */}
        {state !== "DRAFT" && state !== "VOID" ? (
          <a
            href={`/api/remittance/${id}`}
            title={
              paid
                ? "The remittance for this payment — download and email it to the crew"
                : "Preview — this says a payment has been made, so send it once one has"
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

      {/* The fee in money before it is charged, not a percentage to work out. */}
      {confirmFast ? (
        <div className="flex flex-col items-end gap-1.5 rounded-lg border border-gold/35 bg-gold/[0.07] p-2.5 text-right">
          <p className="text-[12px] text-foreground">
            Move this crew to NET {FAST_PAY_DAYS} by wire?
          </p>
          <p className="num text-[12px] text-muted-foreground">
            {formatCurrency(payable)} &minus; {formatCurrency(fee)} fee ({FAST_PAY_FEE_PCT}%) ={" "}
            <span className="font-semibold text-foreground">{formatCurrency(afterFee)}</span>
          </p>
          <p className="max-w-[260px] text-[11px] leading-relaxed text-muted-foreground">
            It costs them the fee and cannot be undone, so do it on their say-so. Your name goes on
            the record.
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void run("fast", () => electFastPay(id))}
              disabled={busy !== null}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-gold px-3 text-[12px] font-semibold text-black disabled:opacity-40"
            >
              {busy === "fast" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Zap className="size-3.5" />
              )}
              They asked for it
            </button>
            <button
              type="button"
              onClick={() => setConfirmFast(false)}
              className="focus-ring h-8 rounded-lg px-2 text-[12px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

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
            disabled={busy !== null}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-[12px] font-semibold text-black disabled:opacity-40"
          >
            {busy === "record" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
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
