"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import { formatFeet, formatNumber, formatSigned } from "@/lib/format";
import type { ProductionSummary } from "@/lib/types";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { TrendBadge } from "@/components/common/trend-badge";

const RANGES = ["7d", "30d", "90d"] as const;
type Range = (typeof RANGES)[number];

type TooltipPayload = {
  payload: { day: string; date: string; actual: number; target: number };
};

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const delta = point.actual - point.target;

  return (
    <div className="glass rounded-lg border border-foreground/[0.1] px-3 py-2 shadow-elev-3">
      <p className="text-[11px] font-medium text-foreground">
        {point.day} · {point.date}
      </p>
      <div className="mt-1.5 space-y-1">
        <p className="flex items-center gap-2 text-[11.5px]">
          <span className="size-1.5 rounded-full bg-brand" />
          <span className="text-muted-foreground">Actual</span>
          <span className="num ml-auto font-semibold text-foreground">
            {formatFeet(point.actual)}
          </span>
        </p>
        <p className="flex items-center gap-2 text-[11.5px]">
          <span className="size-1.5 rounded-full bg-foreground/25" />
          <span className="text-muted-foreground">Target</span>
          <span className="num ml-auto text-muted-foreground">{formatFeet(point.target)}</span>
        </p>
      </div>
      <p
        className={cn(
          "num mt-1.5 border-t border-foreground/[0.08] pt-1.5 text-[11px] font-semibold",
          delta >= 0 ? "text-success" : "text-critical",
        )}
      >
        {delta >= 0 ? "+" : "−"}
        {formatNumber(Math.abs(delta))} ft vs target
      </p>
    </div>
  );
}

export function ProductionChart({ summary }: { summary: ProductionSummary }) {
  const [range, setRange] = React.useState<Range>("7d");
  const maxCrew = Math.max(...summary.byCrew.map((c) => c.ft));
  const vsTarget = ((summary.today - summary.target) / summary.target) * 100;

  return (
    <Panel>
      <PanelHeader
        title="Daily production"
        description="Installed linear feet vs. plan"
        icon={<Activity className="size-3.5 text-brand-bright" />}
      >
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-foreground/[0.07] bg-foreground/[0.03] p-0.5">
          {RANGES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value)}
              className={cn(
                "focus-ring rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                range === value
                  ? "bg-foreground/[0.09] text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </PanelHeader>

      <PanelBody className="space-y-4">
        {/* Headline */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="eyebrow">Today</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-[24px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                {formatNumber(summary.today)}
              </span>
              <span className="text-[12px] text-muted-foreground">ft</span>
              <TrendBadge value={vsTarget} trend={vsTarget >= 0 ? "up" : "down"} />
            </div>
          </div>
          <div>
            <p className="eyebrow">This week</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-[15px] font-semibold text-foreground">
                {formatNumber(summary.weekTotal)}
              </span>
              <span className="num text-[11.5px] font-medium text-success">
                {formatSigned(summary.weekDelta)}
              </span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full bg-brand" /> Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full border-t border-dashed border-foreground/40" />{" "}
              Target
            </span>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[208px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={summary.series} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="vq-production-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2f80ff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2f80ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
                strokeDasharray="0"
              />
              <XAxis
                dataKey="day"
                stroke="rgba(255,255,255,0.28)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={6}
              />
              {/* Zero-based would squash a 12k–19k series into the top third.
                  Padding around the data instead uses the full plot height. */}
              <YAxis
                stroke="rgba(255,255,255,0.28)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={52}
                domain={[
                  (min: number) => Math.max(0, Math.floor((min * 0.88) / 1000) * 1000),
                  (max: number) => Math.ceil((max * 1.06) / 1000) * 1000,
                ]}
                tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "rgba(255,255,255,0.14)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="actual"
                stroke="#2f80ff"
                strokeWidth={2}
                fill="url(#vq-production-fill)"
                activeDot={{ r: 4, fill: "#2f80ff", stroke: "#0b0f14", strokeWidth: 2 }}
                animationDuration={900}
              />
              <Line
                type="monotone"
                dataKey="target"
                stroke="rgba(255,255,255,0.32)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                animationDuration={900}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Per-crew breakdown — the chart says "how much", this says "who" */}
        <div className="space-y-2 border-t border-border/70 pt-4">
          <p className="eyebrow">Today by crew</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {summary.byCrew.map((row) => (
              <div key={row.crew} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-[11.5px] text-muted-foreground">
                  {row.crew}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                  <div
                    className={cn("h-full rounded-full", toneStyles[row.tone].dot)}
                    style={{
                      width: `${(row.ft / maxCrew) * 100}%`,
                      transition: "width 900ms cubic-bezier(0.16,1,0.3,1)",
                    }}
                  />
                </div>
                <span className="num w-16 shrink-0 text-right text-[11.5px] font-medium text-foreground">
                  {formatNumber(row.ft)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}
