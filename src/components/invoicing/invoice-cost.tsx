"use client";

import * as React from "react";
import Link from "next/link";
import { HardHat, Loader2, TriangleAlert, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getInvoiceCost, type InvoiceCost } from "@/app/actions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Sent to crew",
  ACCEPTED: "Accepted",
  DISPUTED: "Disputed",
  PAID: "Paid",
  VOID: "Void",
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-foreground/[0.06] text-muted-foreground",
  ISSUED: "bg-warning/12 text-warning",
  ACCEPTED: "bg-success/12 text-success",
  DISPUTED: "bg-critical/12 text-critical",
  PAID: "bg-success/12 text-success",
  VOID: "bg-foreground/[0.06] text-muted-foreground line-through",
};

/**
 * The other side of the same job: what this invoice pays out.
 *
 * Both sides are built from the same reported day, so the crews shown here are
 * the ones whose dailies are on this invoice — not everybody who happened to
 * work that week. That matters when a pay period and a billing period do not
 * line up, which is most weeks.
 *
 * A day nobody has priced yet is listed rather than treated as free. The
 * margin on a job with uncosted days is not a margin, it is a number that will
 * fall when the crew invoices, and saying so is the whole point of this panel.
 */
export function InvoiceCostPanel({ invoiceId }: { invoiceId: string }) {
  const [cost, setCost] = React.useState<InvoiceCost | null>(null);

  React.useEffect(() => {
    let live = true;
    void getInvoiceCost(invoiceId).then((c) => {
      if (live) setCost(c);
    });
    return () => {
      live = false;
    };
  }, [invoiceId]);

  if (!cost) {
    return (
      <p className="flex items-center gap-1.5 py-2 text-[12px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Working out what this costs…
      </p>
    );
  }

  const noneAtAll = cost.crews.length === 0 && cost.uncosted.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        What we pay out on this invoice
      </p>

      {noneAtAll ? (
        <p className="text-[12px] text-muted-foreground">
          Nothing on this invoice came from a daily, so there is no crew cost against it.
        </p>
      ) : (
        <>
          {cost.crews.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {cost.crews.map((c) => (
                <li
                  key={c.subInvoiceId}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-foreground/[0.02] px-2.5 py-2"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand">
                    <HardHat className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-foreground">{c.company}</p>
                    <p className="num text-[11px] text-muted-foreground">
                      {c.number} · {c.dailyCount} dail{c.dailyCount === 1 ? "y" : "ies"}
                    </p>
                  </div>
                  {c.fastPay ? (
                    <span className="inline-flex items-center gap-1 rounded bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                      <Zap className="size-2.5" /> Fast pay {c.fastPayFeePct}%
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                      STATUS_STYLE[c.status] ?? STATUS_STYLE.DRAFT,
                    )}
                  >
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  <span className="num w-24 text-right text-[12.5px] font-semibold text-foreground">
                    {formatCurrency(c.cost)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Never folded into the margin. A day nobody has priced is a cost
              that has not arrived yet, not a cost of nothing. */}
          {cost.uncosted.length > 0 ? (
            <div className="rounded-lg border border-warning/30 bg-warning/[0.05] px-2.5 py-2">
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-warning">
                <TriangleAlert className="size-3.5" />
                {cost.uncosted.length} dail{cost.uncosted.length === 1 ? "y" : "ies"} on this invoice
                {cost.uncosted.length === 1 ? " has" : " have"} no crew cost yet
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {cost.uncosted.map((u) => (
                  <li key={u.dailyId} className="num text-[11px] text-muted-foreground">
                    {u.workDate || "no date"} · {u.crew} · billed {formatCurrency(u.revenue)} —{" "}
                    <span className="font-sans">{u.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">
                The margin below will fall once these are priced.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <Figure label="Billed to customer" value={cost.revenue} />
            <Figure label="Paid to crews" value={cost.cost} negative />
            <Figure
              label={cost.complete ? "Gross margin" : "Margin so far"}
              value={cost.margin}
              tone={cost.margin > 0 ? "text-success" : cost.margin < 0 ? "text-critical" : undefined}
              hint={cost.marginPct !== null ? formatPercent(cost.marginPct) : undefined}
              provisional={!cost.complete}
            />
          </div>

          <Link
            href="/subcontractors"
            className="focus-ring self-start rounded text-[11.5px] text-brand-bright hover:underline"
          >
            Open the crews&apos; statements →
          </Link>
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
  negative,
  provisional,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: string;
  negative?: boolean;
  provisional?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-foreground/[0.02] px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 text-[15px] font-semibold text-foreground", tone)}>
        {negative && value > 0 ? "−" : ""}
        {formatCurrency(value)}
        {provisional ? <span className="ml-1 text-[10px] font-normal text-warning">so far</span> : null}
      </p>
      {hint ? <p className="num text-[10.5px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
