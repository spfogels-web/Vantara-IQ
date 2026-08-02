"use client";

import * as React from "react";
import { Activity, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatPercent, formatSigned } from "@/lib/format";
import type { HealthSummary } from "@/lib/types";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/common/panel";
import { HealthRing } from "@/components/common/health-ring";
import { Meter } from "@/components/common/metric";

export function ProjectHealth({ summary }: { summary: HealthSummary }) {
  return (
    <Panel>
      <PanelHeader
        title="Project health"
        description={`${summary.totalProjects} active projects`}
        icon={<Activity className="size-3.5" />}
        action="Reports"
        actionHref="/reports"
      />

      <PanelBody className="space-y-5">
        {/* Composite score */}
        <div className="flex items-center gap-4">
          {/* Value lives in the headline beside it — repeating it in the ring
              reads as a duplicate rather than a second reading. */}
          <HealthRing score={summary.score} size={72} stroke={5} showValue={false} />
          <div className="min-w-0">
            <p className="eyebrow">Portfolio score</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                {summary.score}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11.5px] font-semibold",
                  summary.delta >= 0 ? "text-success" : "text-critical",
                )}
              >
                {summary.delta >= 0 ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
                <span className="num">{formatSigned(summary.delta)}</span>
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              Schedule, budget, quality and safety, weighted by contract value.
            </p>
          </div>
        </div>

        {/* Distribution */}
        <div className="space-y-3">
          {summary.buckets.map((bucket, index) => {
            const tone = toneStyles[bucket.tone];
            return (
              <div key={bucket.label}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
                    <span className="truncate text-muted-foreground">{bucket.label}</span>
                  </span>
                  <span className="num shrink-0 font-semibold text-foreground">
                    {bucket.count}
                  </span>
                </div>
                <Meter
                  value={bucket.count / summary.totalProjects}
                  tone={bucket.tone}
                  delay={index * 90}
                />
              </div>
            );
          })}
        </div>
      </PanelBody>

      <PanelFooter className="justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">On-time</span>
          <span className="num font-semibold text-foreground">
            {formatPercent(summary.onTimeRate)}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Budget</span>
          <span
            className={cn(
              "num font-semibold",
              summary.budgetVariance <= 0 ? "text-success" : "text-critical",
            )}
          >
            {formatSigned(summary.budgetVariance * 100)}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-success" />
          <span className="num font-semibold text-foreground">{summary.safetyDays}</span>
          <span className="text-muted-foreground">days safe</span>
        </span>
      </PanelFooter>
    </Panel>
  );
}
