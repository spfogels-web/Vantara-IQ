"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { SubInvoiceRow } from "@/data/queries";
import {
  generateSubInvoices,
  issueSubInvoice,
  markSubInvoicePaid,
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
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const mine = invoices.filter((i) => i.subcontractorId === subcontractorId);
  const owed = mine
    .filter((i) => i.status === "ISSUED" || i.status === "ACCEPTED" || i.status === "DISPUTED")
    .reduce((s, i) => s + i.subtotal, 0);

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
                    {formatCurrency(inv.subtotal)}
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
                      onClick={() => void run(inv.id, () => markSubInvoicePaid(inv.id))}
                      className="focus-ring inline-flex h-7 items-center gap-1 rounded bg-success/15 px-2 text-[11.5px] font-semibold text-success hover:bg-success/25 disabled:opacity-40"
                    >
                      <Check className="size-3" /> Mark paid
                    </button>
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
