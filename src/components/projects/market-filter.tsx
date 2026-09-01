"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { MARKETS, type MarketId } from "@/lib/markets";
import { useT } from "@/components/layout/language-provider";

/**
 * Which market's jobs to show.
 *
 * A row of chips rather than a dropdown: there are four choices including All,
 * they each carry a count, and the counts are the point — "Alabama 0" is worth
 * seeing without opening anything.
 *
 * Every market is offered even at a count of zero. A market that vanishes when
 * empty is a market somebody assumes they imagined, and Alabama is about to
 * have jobs in it.
 *
 * The choice lives in the URL rather than in component state, so the page stays
 * server-rendered, a filtered view can be sent to somebody, and going back does
 * what going back should.
 */

export type MarketCounts = Record<string, number>;

type Choice = MarketId | "all" | "unassigned";

export function MarketFilter({
  counts,
  value,
  unassigned,
}: {
  counts: MarketCounts;
  value: Choice;
  /** Jobs nobody has placed yet. */
  unassigned: number;
}) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();

  function onChange(next: Choice) {
    const q = new URLSearchParams(params.toString());
    // "all" is the default, so it stays out of the URL rather than sitting
    // there as ?market=all.
    if (next === "all") q.delete("market");
    else q.set("market", next);
    const qs = q.toString();
    router.push(qs ? `/projects?${qs}` : "/projects", { scroll: false });
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0) + unassigned;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <MapPin className="size-3.5 text-gold" />
        {t("Market")}
      </span>

      <Chip active={value === "all"} onClick={() => onChange("all")} label={t("All markets")} count={total} />

      {MARKETS.map((m) => (
        <Chip
          key={m.id}
          active={value === m.id}
          onClick={() => onChange(m.id)}
          label={t(m.label)}
          // The prime is what separates two of these, so it rides along.
          hint={m.hint}
          count={counts[m.id] ?? 0}
        />
      ))}

      {/* Only when there is something to fix. A permanent "Unassigned 0" is
          noise; one that appears the day a job arrives without a market is a
          prompt. */}
      {unassigned > 0 ? (
        <Chip
          active={value === "unassigned"}
          onClick={() => onChange("unassigned")}
          label={t("Unassigned")}
          count={unassigned}
          warn
        />
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  hint,
  count,
  warn,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  count: number;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-gold/50 bg-gold/[0.13] text-foreground"
          : warn
            ? "border-warning/35 bg-warning/[0.06] text-muted-foreground hover:text-foreground"
            : "border-border bg-foreground/[0.03] text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "num rounded-full px-1.5 text-[10px] font-semibold leading-[1.35]",
          active ? "bg-gold/25 text-foreground" : "bg-foreground/[0.08] text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
