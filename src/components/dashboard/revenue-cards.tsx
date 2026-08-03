"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/icons";
import { toneStyles } from "@/lib/tone";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { RevenueSummary } from "@/lib/types";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/common/panel";
import { Meter } from "@/components/common/metric";

export function RevenueCards({ summary }: { summary: RevenueSummary }) {
  return (
    <Panel>
      <PanelHeader
        title="Revenue ready to bill"
        description={`${formatCompactCurrency(summary.total)} across the pipeline`}
        icon={<Wallet className="size-3.5 text-warning" />}
        action="Billing"
        actionHref="/billing"
      />

      <PanelBody className="grid gap-3 sm:grid-cols-2">
        {summary.buckets.map((bucket, index) => {
          const Icon = getIcon(bucket.icon);
          const tone = toneStyles[bucket.tone];

          return (
            <Link
              key={bucket.id}
              href={`/billing?bucket=${bucket.id}`}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-xl border p-3.5 transition-all duration-200",
                "border-foreground/[0.06] bg-foreground/[0.02] hover:-translate-y-px hover:border-foreground/[0.12] hover:bg-foreground/[0.04]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              )}
              style={{
                animation: "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
                animationDelay: `${index * 60}ms`,
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-60 transition-opacity group-hover:opacity-100"
                style={{
                  background: `radial-gradient(110% 100% at 0% 0%, ${tone.hex}1a, transparent 65%)`,
                }}
              />

              <div className="relative flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg border",
                    tone.bg,
                    tone.border,
                    tone.text,
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={2} />
                </span>
                <span className="num rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                  {bucket.count} {bucket.count === 1 ? "item" : "items"}
                </span>
              </div>

              <p className="relative mt-2.5 truncate text-[11.5px] font-medium text-muted-foreground">
                {bucket.label}
              </p>
              <p className="num relative mt-1 text-[19px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                {formatCurrency(bucket.amount)}
              </p>

              <div className="relative mt-3">
                <Meter value={bucket.share} tone={bucket.tone} delay={index * 80} />
              </div>

              <p className="relative mt-2 flex items-center gap-1 truncate text-[10.5px] text-muted-foreground">
                {bucket.caption}
                <ArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </p>
            </Link>
          );
        })}
      </PanelBody>

      <PanelFooter className="justify-between">
        <span>
          Collected this month{" "}
          <span className="num font-medium text-foreground">
            {formatCurrency(summary.collectedThisMonth)}
          </span>
        </span>
        <span>
          Avg. days to pay{" "}
          <span className="num font-medium text-foreground">{summary.avgDaysToPay}</span>
        </span>
      </PanelFooter>
    </Panel>
  );
}
