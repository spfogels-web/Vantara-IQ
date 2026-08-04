import Link from "next/link";
import { AlertTriangle, Coins, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { ProjectValuation } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * What the job is worth, priced off the material list.
 *
 * Three numbers a CEO actually asks for: what the customer owes us at contract
 * rates, what the crew costs at theirs, and the gross between them. All of it
 * from the plan, so it lands the day the material list does rather than after
 * the first invoice.
 *
 * The coverage line is not decoration. A gross figure priced from 19 of 59
 * codes is not a conservative estimate — it is wrong, and it is wrong in the
 * direction that makes a bad job look acceptable. So the totals never appear
 * without saying how much of the list they cover, and unpriced codes are named
 * rather than counted.
 */
export function ProjectValue({ v }: { v: ProjectValuation }) {
  const noMaterials = v.plannedCodes === 0;

  return (
    <Panel>
      <PanelHeader
        title="What this job is worth"
        description="Material list priced at contract rates — gross, before overhead and deductions"
        icon={<Coins className="size-3.5" />}
      />

      {noMaterials ? (
        <PanelBody>
          <Empty>
            No material list approved for this project yet. Upload one and approve the
            rows, and this prices itself.
          </Empty>
        </PanelBody>
      ) : !v.hasCustomerRates ? (
        <PanelBody>
          <Empty>
            No customer rate card loaded, so there is nothing to price against.{" "}
            <Link href="/rate-import" className="text-brand-bright hover:underline">
              Import the rate sheet
            </Link>{" "}
            and push it to the customer.
          </Empty>
        </PanelBody>
      ) : (
        <>
          <PanelBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              label="Gross revenue"
              value={formatCompactCurrency(v.revenue.total)}
              hint="At customer rates"
            />
            <Tile
              label="Subcontractor cost"
              value={v.subCost ? formatCompactCurrency(v.subCost.total) : "—"}
              hint={
                v.subCost
                  ? `At ${v.subName}'s rates`
                  : v.subName
                    ? "No rate card loaded"
                    : "No single crew assigned"
              }
            />
            <Tile
              label="Gross margin"
              value={v.grossMargin !== null ? formatCompactCurrency(v.grossMargin) : "—"}
              tone={
                v.grossMargin === null
                  ? undefined
                  : v.grossMargin > 0
                    ? "text-success"
                    : "text-critical"
              }
              hint="Before deductions"
            />
            <Tile
              label="Margin %"
              value={v.grossMarginPct !== null ? formatPercent(v.grossMarginPct) : "—"}
              tone={
                v.grossMarginPct === null
                  ? undefined
                  : v.grossMarginPct >= 0.25
                    ? "text-success"
                    : v.grossMarginPct > 0
                      ? "text-warning"
                      : "text-critical"
              }
              hint={v.subCost ? undefined : "Needs a sub rate card"}
            />
          </PanelBody>

          {/* Billed to date, on the same two rate cards. Separated from the
              plan because they answer different questions: what the job is
              worth, and how much of it we have earned. */}
          <div className="border-t border-border/70 px-4 py-3 sm:px-5">
            <p className="eyebrow mb-2.5">Billed to date</p>
            {v.billed.dailies === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No dailies filed on this project yet — nothing has been earned against the plan.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile
                  label="Customer billing"
                  value={formatCompactCurrency(v.billed.revenue.total)}
                  hint={`From ${v.billed.dailies} ${v.billed.dailies === 1 ? "daily" : "dailies"}`}
                />
                <Tile
                  label="Subcontractor pay"
                  value={v.billed.subCost ? formatCompactCurrency(v.billed.subCost.total) : "—"}
                  hint={v.billed.subCost ? "At their own rates" : "No sub rate card loaded"}
                />
                <Tile
                  label="Gross profit"
                  value={
                    v.billed.grossMargin !== null
                      ? formatCompactCurrency(v.billed.grossMargin)
                      : "—"
                  }
                  tone={
                    v.billed.grossMargin === null
                      ? undefined
                      : v.billed.grossMargin > 0
                        ? "text-success"
                        : "text-critical"
                  }
                />
                <Tile
                  label="Earned of plan"
                  value={
                    v.revenue.total > 0
                      ? formatPercent(v.billed.revenue.total / v.revenue.total)
                      : "—"
                  }
                  hint="Billing ÷ contract value"
                />
              </div>
            )}
          </div>

          <Coverage result={v.revenue} label="customer rate card" />
          {v.subCost ? <Coverage result={v.subCost} label={`${v.subName}'s rate card`} /> : null}
        </>
      )}
    </Panel>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-foreground/[0.02] px-3.5 py-3">
      <p className="eyebrow">{label}</p>
      <p className={cn("num mt-1 text-[20px] font-semibold tracking-tight text-foreground", tone)}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * How much of the material list carried a rate. Anything short of everything
 * gets the codes listed — "12 unpriced" is a statistic, the actual codes are
 * something you can go and fix.
 */
function Coverage({ result, label }: { result: PricingResultLike; label: string }) {
  if (result.totalCodes === 0) return null;

  if (result.complete) {
    return (
      <p className="border-t border-border/70 px-4 py-2.5 text-[11.5px] text-muted-foreground sm:px-5">
        Every one of the <span className="num text-foreground">{result.totalCodes}</span> codes on
        the material list is priced on the {label}.
      </p>
    );
  }

  return (
    <div className="border-t border-warning/25 bg-warning/[0.06] px-4 py-3 sm:px-5">
      <p className="flex items-start gap-2 text-[12px] text-foreground">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <span>
          Priced <span className="num font-medium">{result.pricedCodes}</span> of{" "}
          <span className="num font-medium">{result.totalCodes}</span> codes against the {label}.
          The totals above exclude the rest, so the real figure is higher.
        </span>
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5 pl-5">
        {result.unpriced.slice(0, 14).map((u) => (
          <li
            key={u.code}
            title={`${u.description || u.code} · ${formatNumber(u.quantity)} planned`}
            className="num rounded border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground"
          >
            {u.code}
          </li>
        ))}
        {result.unpriced.length > 14 ? (
          <li className="px-1 py-0.5 text-[10.5px] text-muted-foreground">
            +{result.unpriced.length - 14} more
          </li>
        ) : null}
      </ul>
    </div>
  );
}

type PricingResultLike = {
  unpriced: { code: string; description: string; quantity: number }[];
  pricedCodes: number;
  totalCodes: number;
  complete: boolean;
};

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-border/70 px-3.5 py-4 text-[12.5px] text-muted-foreground">
      <TrendingUp className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
      <p>{children}</p>
    </div>
  );
}
