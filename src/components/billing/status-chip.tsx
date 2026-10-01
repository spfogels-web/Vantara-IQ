import * as React from "react";

import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_SHORT,
  STATUS_TONE,
  type BillingStatus,
} from "@/lib/billing-status";

/**
 * Where a quantity stands with the customer's bill, in one chip.
 *
 * The same component on the office queue and on a crew's phone, because the
 * distinction it draws — approved is not documented, documented is not billed —
 * is the same distinction for both. Two chips would be two vocabularies, and
 * the office and the field would end up describing the same foot differently
 * on the phone call where it matters.
 *
 * `short` is for a chip inside a table cell; the full label everywhere there is
 * room, since "Ready to bill — admin override" says something the word
 * "Override" only hints at.
 */
export function BillingStatusChip({
  status,
  short = false,
  className,
}: {
  status: BillingStatus;
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        STATUS_TONE[status],
        className,
      )}
      // The short form drops words a screen reader still needs.
      title={STATUS_LABEL[status]}
    >
      {short ? STATUS_SHORT[status] : STATUS_LABEL[status]}
    </span>
  );
}

/**
 * A quantity written as produced / held / billable, when they differ.
 *
 * Three numbers rather than one, and never collapsed. A daily that reported a
 * thousand feet reported a thousand feet; showing 600 because 400 is held would
 * make the sheet disagree with the crew who filled it in, and the argument that
 * follows is not one the office can win.
 */
export function QuantitySplit({
  produced,
  held,
  billable,
  unit,
  className,
}: {
  produced: number;
  held: number;
  billable: number;
  unit?: string;
  className?: string;
}) {
  const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const split = held > 0 || billable !== produced;

  return (
    <span className={cn("num inline-flex items-baseline gap-1.5", className)}>
      <span className="font-semibold text-foreground">
        {n(produced)}
        {unit ? <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span> : null}
      </span>
      {split ? (
        <span className="text-[11px] text-muted-foreground">
          {held > 0 ? <span className="text-critical">{n(held)} held</span> : null}
          {held > 0 && billable > 0 ? " · " : null}
          {billable > 0 ? <span>{n(billable)} billable</span> : null}
        </span>
      ) : null}
    </span>
  );
}
