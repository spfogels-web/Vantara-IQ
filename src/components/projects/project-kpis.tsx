/**
 * What the job is worth, in four figures.
 *
 * Every number here comes from the valuation the server already computed — the
 * same `getProjectValuation` the old page used, reading the customer and crew
 * rate cards through Customer → Market → Rate Card. Nothing is recalculated
 * here and nothing is derived in the browser: a margin that disagreed with the
 * rates panel further down the page would be worse than no margin at all.
 *
 * Where a rate is missing the figure is not shown as a zero. A job with three
 * unpriced codes has an unknown revenue, not a smaller one, and the card says
 * which it is — see `PricingResult.complete`.
 */
import { BarChart3, Coins, Layers, PieChart } from "lucide-react";

import type { ProjectValuation } from "@/data/queries";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProjectKpis({ v }: { v: ProjectValuation }) {
  const revenue = v.revenue.complete ? formatCompactCurrency(v.revenue.total) : null;
  const cost = v.subCost?.complete ? formatCompactCurrency(v.subCost.total) : null;

  /**
   * A margin is only as good as the two figures under it.
   *
   * `grossMargin` comes back as 0 on a job with no rates at all, which read as
   * "$0 margin" sitting between two dashes — a job that looks like it breaks
   * even rather than one nobody has priced. If either side is unknown, so is
   * the difference.
   */
  const priced = v.revenue.complete && Boolean(v.subCost?.complete);
  const margin = priced && v.grossMargin != null ? formatCompactCurrency(v.grossMargin) : null;
  const marginPct = priced && v.grossMarginPct != null ? formatPercent(v.grossMarginPct) : null;

  /** What is missing, said once, rather than a caveat under every card. */
  const unpriced = v.revenue.totalCodes - v.revenue.pricedCodes;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi
          icon={<BarChart3 className="size-4" />}
          label="Gross revenue"
          value={revenue}
          note="At customer rates"
          accent="green"
          tone="neutral"
        />
        <Kpi
          icon={<Coins className="size-4" />}
          label="Subcontractor cost"
          value={cost}
          note={
            v.subCostSource === "crew"
              ? v.subName
                ? `At ${v.subName}'s rates`
                : "At the crew's rates"
              : v.subCostSource === "planned"
                ? "At the job's budgeted rates"
                : "No crew rates on file"
          }
          accent="indigo"
          tone="neutral"
        />
        <Kpi
          icon={<Layers className="size-4" />}
          label="Gross margin"
          value={margin}
          note="Before deductions"
          accent="cyan"
          tone={margin != null && (v.grossMargin ?? 0) > 0 ? "positive" : "neutral"}
        />
        <Kpi
          icon={<PieChart className="size-4" />}
          label="Margin %"
          value={marginPct}
          accent="violet"
          note={v.unratedCrews.length ? `Excludes ${v.unratedCrews.length} unrated` : "Of revenue"}
          tone={
            marginPct == null
              ? "neutral"
              : (v.grossMarginPct ?? 0) >= 0.25
                ? "positive"
                : (v.grossMarginPct ?? 0) > 0
                  ? "caution"
                  : "critical"
          }
        />
      </div>

      {unpriced > 0 ? (
        <p className="mt-1.5 text-[11.5px] text-caution">
          {unpriced} {unpriced === 1 ? "code has" : "codes have"} no customer rate, so these
          totals are incomplete.
        </p>
      ) : null}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  note,
  accent,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  /** Null where a rate is missing — shown as unknown, never as zero. */
  value: string | null;
  note: string;
  /**
   * The card's own colour, fixed per figure rather than derived from whether
   * the number is good news.
   *
   * Tone still colours the number itself, so an unpriced job reads as unknown.
   * But the icons stay recognisable: colouring them by tone meant all four
   * turned the same grey the moment a rate was missing, which is exactly when
   * somebody most needs to tell revenue from margin at a glance.
   */
  accent: "green" | "indigo" | "cyan" | "violet";
  tone: "neutral" | "positive" | "caution" | "critical";
}) {
  return (
    <div
      style={{ ["--accent" as string]: `var(--vq-${accent})` }}
      className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg border",
            "text-[var(--accent)]",
            "border-[color-mix(in_oklab,var(--accent)_32%,transparent)]",
            "bg-[color-mix(in_oklab,var(--accent)_13%,transparent)]",
          )}
        >
          {icon}
        </span>
        <span className="eyebrow truncate text-[10.5px]">{label}</span>
      </div>
      <p
        className={cn(
          "num mt-2 text-[22px] font-bold tracking-[-0.02em]",
          value == null
            ? "text-muted-foreground/60"
            : tone === "positive"
              ? "text-success"
              : tone === "critical"
                ? "text-critical"
                : "text-foreground",
        )}
      >
        {value ?? "—"}
      </p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{note}</p>
    </div>
  );
}
