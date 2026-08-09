"use client";

import * as React from "react";
import { Check, Loader2, Lock, Plus, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatRate } from "@/lib/format";
import {
  addInvoiceLine,
  deleteInvoiceLine,
  getInvoiceLines,
  updateInvoiceLine,
  type InvoiceLineRow,
} from "@/app/actions";

/**
 * What is actually on the bill, and the chance to change it before it goes.
 *
 * Every line is priced from a signed rate card against a reported daily, and
 * most of the time that is exactly right. The times it is not — a quantity
 * miscounted in the field, a code that should not be billed this cycle, a
 * mobilisation the card does not carry — are the times somebody needs to open
 * the invoice and fix it, and the alternative to doing that here is doing it in
 * the accounting package afterwards, where this system never learns about it.
 *
 * Editable only while the invoice is a draft. Once it has been sent, the figure
 * is one the customer has seen, and quietly changing it is how two parties end
 * up holding different versions of the same invoice number.
 */
export function InvoiceLines({
  invoiceId,
  onChanged,
}: {
  invoiceId: string;
  /** Totals live on the parent row, so it has to re-read them after an edit. */
  onChanged: () => void;
}) {
  const [state, setState] = React.useState<{
    status: string;
    editable: boolean;
    lines: InvoiceLineRow[];
  } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await getInvoiceLines(invoiceId);
    setState(res);
  }, [invoiceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? "That didn't work.");
      return false;
    }
    await load();
    onChanged();
    return true;
  }

  if (!state) {
    return (
      <p className="flex items-center gap-1.5 py-2 text-[12px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading lines…
      </p>
    );
  }

  const total = state.lines.reduce((s, l) => s + l.amount, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Line items ({state.lines.length})
        </p>
        {state.editable ? (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-[11.5px] font-medium text-foreground hover:bg-foreground/[0.05]"
          >
            <Plus className="size-3" /> Add a line
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="size-3" /> Sent — the figures are fixed
          </span>
        )}
      </div>

      {error ? <p className="text-[11.5px] text-critical">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-border/60 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2.5 py-1.5 text-left font-medium">Date</th>
              <th className="px-2.5 py-1.5 text-left font-medium">Code</th>
              <th className="px-2.5 py-1.5 text-left font-medium">Description</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Qty</th>
              <th className="px-2.5 py-1.5 text-left font-medium">Unit</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Rate</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {state.lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2.5 py-6 text-center text-[12px] text-muted-foreground">
                  Nothing on this invoice.
                </td>
              </tr>
            ) : (
              state.lines.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  editable={state.editable}
                  busy={busy === l.id}
                  onSave={(patch) => run(l.id, () => updateInvoiceLine(l.id, patch))}
                  onDelete={() => run(l.id, () => deleteInvoiceLine(l.id))}
                />
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/60 bg-foreground/[0.02]">
              <td colSpan={6} className="px-2.5 py-2 text-right text-[11.5px] font-medium text-muted-foreground">
                Lines total
              </td>
              <td className="num px-2.5 py-2 text-right text-[13px] font-semibold text-foreground">
                {formatCurrency(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {adding && state.editable ? (
        <AddLine
          busy={busy === "add"}
          onCancel={() => setAdding(false)}
          onAdd={async (input) => {
            const ok = await run("add", () => addInvoiceLine(invoiceId, input));
            if (ok) setAdding(false);
          }}
        />
      ) : null}

      {state.editable ? (
        <p className="text-[11px] text-muted-foreground">
          Retainage and the amount due are recalculated as you edit. Removing a line that came from
          a daily puts that day&apos;s work back in the queue to be billed again.
        </p>
      ) : null}
    </div>
  );
}

/**
 * One line, edited in place.
 *
 * Held in local state until saved so a half-typed quantity never reaches the
 * server, and reset from the row whenever the saved values change underneath.
 */
function LineRow({
  line,
  editable,
  busy,
  onSave,
  onDelete,
}: {
  line: InvoiceLineRow;
  editable: boolean;
  busy: boolean;
  onSave: (patch: { description?: string; quantity?: number; rate?: number }) => void;
  onDelete: () => void;
}) {
  const [qty, setQty] = React.useState(String(line.quantity));
  const [rate, setRate] = React.useState(String(line.rate));
  const [desc, setDesc] = React.useState(line.description);
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    setQty(String(line.quantity));
    setRate(String(line.rate));
    setDesc(line.description);
  }, [line.quantity, line.rate, line.description]);

  const dirty =
    Number(qty) !== line.quantity || Number(rate) !== line.rate || desc !== line.description;
  const preview = (Number(qty) || 0) * (Number(rate) || 0);

  const cell =
    "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[12px] text-foreground hover:border-border/60 focus:border-brand/60 focus:outline-none";

  return (
    <tr className="border-b border-border/40 last:border-b-0">
      <td className="num px-2.5 py-1.5 text-[11.5px] text-muted-foreground">{line.workDate || "—"}</td>
      <td className="num px-2.5 py-1.5 text-[12px] font-medium text-foreground">
        {line.code}
        {/* A hand-added line has no daily behind it, and that should be visible
            on the bill rather than discovered when somebody goes looking. */}
        {!line.dailyId ? (
          <span className="ml-1 rounded bg-warning/15 px-1 py-px text-[9.5px] font-semibold text-warning">
            manual
          </span>
        ) : null}
      </td>
      <td className="px-2.5 py-1.5 text-[12px] text-muted-foreground">
        {editable ? (
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className={cell} />
        ) : (
          line.description || "—"
        )}
      </td>
      <td className="px-2.5 py-1.5 text-right">
        {editable ? (
          <input
            value={qty}
            inputMode="decimal"
            onChange={(e) => setQty(e.target.value)}
            className={cn(cell, "num text-right")}
          />
        ) : (
          <span className="num text-[12px] text-foreground">{line.quantity}</span>
        )}
      </td>
      <td className="px-2.5 py-1.5 text-[11.5px] text-muted-foreground">{line.unit || "—"}</td>
      <td className="px-2.5 py-1.5 text-right">
        {editable ? (
          <input
            value={rate}
            inputMode="decimal"
            onChange={(e) => setRate(e.target.value)}
            className={cn(cell, "num text-right")}
          />
        ) : (
          <span className="num text-[12px] text-muted-foreground">{formatRate(line.rate)}</span>
        )}
      </td>
      <td
        className={cn(
          "num px-2.5 py-1.5 text-right text-[12px]",
          dirty ? "font-semibold text-warning" : "text-foreground",
        )}
      >
        {formatCurrency(dirty ? preview : line.amount)}
      </td>
      <td className="px-1 py-1.5">
        {editable ? (
          <div className="flex items-center gap-0.5">
            {dirty ? (
              <button
                type="button"
                title="Save this line"
                disabled={busy}
                onClick={() =>
                  onSave({ description: desc, quantity: Number(qty) || 0, rate: Number(rate) || 0 })
                }
                className="focus-ring grid size-6 place-items-center rounded text-success hover:bg-success/15 disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3.5" />}
              </button>
            ) : null}
            {confirming ? (
              <>
                <button
                  type="button"
                  title="Remove this line"
                  disabled={busy}
                  onClick={onDelete}
                  className="focus-ring grid size-6 place-items-center rounded bg-critical text-white disabled:opacity-40"
                >
                  <Check className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </>
            ) : (
              <button
                type="button"
                title="Remove this line"
                onClick={() => setConfirming(true)}
                className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:bg-critical/15 hover:text-critical"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function AddLine({
  busy,
  onAdd,
  onCancel,
}: {
  busy: boolean;
  onAdd: (input: {
    code: string;
    description: string;
    unit: string;
    quantity: number;
    rate: number;
    workDate: string;
  }) => void;
  onCancel: () => void;
}) {
  const [f, setF] = React.useState({
    code: "",
    description: "",
    unit: "ea",
    quantity: "",
    rate: "",
    workDate: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const box =
    "w-full rounded-lg border border-border/70 bg-foreground/[0.03] px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-brand/60 focus:outline-none";

  return (
    <div className="rounded-lg border border-border/70 bg-foreground/[0.02] p-3">
      <p className="text-[11.5px] font-medium text-foreground">Add a line</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        This is not tied to a daily, so it will be marked manual on the invoice.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input value={f.workDate} onChange={set("workDate")} placeholder="2026-08-07" className={cn(box, "num")} />
        <input value={f.code} onChange={set("code")} placeholder="Code" className={cn(box, "num uppercase")} />
        <input value={f.description} onChange={set("description")} placeholder="Description" className={cn(box, "sm:col-span-2")} />
        <input value={f.quantity} onChange={set("quantity")} inputMode="decimal" placeholder="Qty" className={cn(box, "num")} />
        <input value={f.rate} onChange={set("rate")} inputMode="decimal" placeholder="Rate" className={cn(box, "num")} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !f.code.trim()}
          onClick={() =>
            onAdd({
              code: f.code,
              description: f.description,
              unit: f.unit,
              quantity: Number(f.quantity) || 0,
              rate: Number(f.rate) || 0,
              workDate: f.workDate,
            })
          }
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring h-8 rounded-lg px-2 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <span className="num text-[11.5px] text-muted-foreground">
          {formatCurrency((Number(f.quantity) || 0) * (Number(f.rate) || 0))}
        </span>
      </div>
    </div>
  );
}
