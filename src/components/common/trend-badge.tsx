import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatSigned } from "@/lib/format";
import type { Trend } from "@/lib/types";

/**
 * Direction and desirability are separate: production trending up is good,
 * projects-at-risk trending up is not. `invert` flips the colour without
 * flipping the arrow.
 */
export function TrendBadge({
  value,
  trend,
  invert = false,
  className,
}: {
  value: number | null;
  trend: Trend;
  invert?: boolean;
  className?: string;
}) {
  if (value === null) return null;

  const isFlat = trend === "flat" || value === 0;
  const isGood = isFlat ? false : invert ? trend === "down" : trend === "up";

  const Icon = isFlat ? Minus : trend === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        isFlat
          ? "bg-white/[0.06] text-muted-foreground"
          : isGood
            ? "bg-success/10 text-success"
            : "bg-critical/10 text-critical",
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      <span className="num">{formatSigned(value)}</span>
    </span>
  );
}
