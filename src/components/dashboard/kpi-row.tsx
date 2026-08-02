"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/icons";
import { toneStyles } from "@/lib/tone";
import { formatKpi } from "@/lib/format";
import type { Kpi } from "@/lib/types";
import { AnimatedNumber } from "@/components/common/metric";
import { Sparkline } from "@/components/common/sparkline";
import { TrendBadge } from "@/components/common/trend-badge";

/** KPIs where a rising number is bad news. */
const INVERTED = new Set(["projects-at-risk", "dailies-waiting"]);

function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const Icon = getIcon(kpi.icon);
  const tone = toneStyles[kpi.tone];

  return (
    <Link
      href={kpi.href}
      className={cn(
        "surface surface-interactive group relative flex min-w-0 flex-col overflow-hidden p-4",
        "hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
      )}
      style={{
        animation: "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        animationDelay: `${index * 45}ms`,
      }}
    >
      {/* Accent wash — barely there, but it stops six cards reading as one slab */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-[0.55] transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(120% 100% at 0% 0%, ${tone.hex}1f, transparent 60%)`,
        }}
      />

      <div className="relative flex items-start justify-between gap-2">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg border",
            tone.bg,
            tone.border,
            tone.text,
          )}
        >
          <Icon className="size-[15px]" strokeWidth={2} />
        </span>
        <TrendBadge value={kpi.delta} trend={kpi.trend} invert={INVERTED.has(kpi.id)} />
      </div>

      {/* Two lines, reserved height. Clamping instead of truncating keeps
          "Revenue ready to bill" readable in a 2-up mobile grid, and the fixed
          min-height keeps every value on the same baseline. */}
      <p className="eyebrow relative mt-3 line-clamp-2 min-h-[2.1em] leading-[1.05]">
        {kpi.label}
      </p>

      <p className="relative mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground">
        <AnimatedNumber value={kpi.value} format={(v) => formatKpi(v, kpi.format)} />
      </p>

      <p className="relative mt-1.5 truncate text-[11.5px] text-muted-foreground">
        {kpi.deltaLabel}
      </p>

      {/* Sparkline bleeds into the card's bottom corners */}
      <div className="relative -mx-4 -mb-4 mt-3.5 opacity-80 transition-opacity duration-300 group-hover:opacity-100">
        <Sparkline data={kpi.series} color={tone.hex} height={34} />
      </div>
    </Link>
  );
}

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {kpis.map((kpi, index) => (
        <KpiCard key={kpi.id} kpi={kpi} index={index} />
      ))}
    </div>
  );
}
