import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Skeletons mirror the real component's box model — same heights, same gaps,
 * same column counts — so content swaps in without the layout jumping. The
 * sweep animation lives in globals.css (`.skeleton`).
 */
function Bar({ className }: { className?: string }) {
  return <div className={cn("skeleton h-3 rounded-md", className)} />;
}

function PanelChrome({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface flex min-w-0 flex-col overflow-hidden", className)}>
      <header className="flex items-center gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="skeleton size-7 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Bar className="w-32" />
          <Bar className="h-2 w-24 opacity-70" />
        </div>
        <Bar className="h-2.5 w-14 opacity-70" />
      </header>
      {children}
    </section>
  );
}

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="surface flex flex-col overflow-hidden p-4">
          <div className="flex items-start justify-between">
            <div className="skeleton size-8 rounded-lg" />
            <Bar className="h-4 w-11 rounded" />
          </div>
          <Bar className="mt-3 h-2 w-20" />
          <Bar className="mt-2.5 h-5 w-24" />
          <Bar className="mt-2 h-2 w-16 opacity-70" />
          <div className="skeleton -mx-4 -mb-4 mt-4 h-[34px] rounded-none" />
        </div>
      ))}
    </div>
  );
}

export function ProjectHealthSkeleton() {
  return (
    <PanelChrome>
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="skeleton size-[72px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bar className="h-2 w-24" />
            <Bar className="h-5 w-20" />
            <Bar className="h-2 w-full max-w-[220px] opacity-70" />
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <div className="flex justify-between">
                <Bar className="h-2.5 w-28" />
                <Bar className="h-2.5 w-5" />
              </div>
              <div className="skeleton h-1.5 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-5">
        <Bar className="h-2.5 w-16" />
        <Bar className="h-2.5 w-16" />
        <Bar className="h-2.5 w-20" />
      </div>
    </PanelChrome>
  );
}

export function AiBriefSkeleton() {
  return (
    <PanelChrome>
      <div className="space-y-1 p-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex gap-3 px-3 py-2.5">
            <div className="skeleton mt-0.5 size-7 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className={index === 0 ? "w-full" : "w-[85%]"} />
              <div className="flex gap-1.5">
                <Bar className="h-4 w-20 rounded" />
                <Bar className="h-4 w-16 rounded opacity-70" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </PanelChrome>
  );
}

export function ProjectsTableSkeleton() {
  return (
    <PanelChrome>
      <div className="hidden px-5 py-2 sm:flex sm:gap-6">
        {["w-16", "w-12", "w-16", "w-20", "w-16", "w-12"].map((width, index) => (
          <Bar key={index} className={cn("h-2", width)} />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-t border-border/60 px-4 py-3.5 sm:px-5"
        >
          <div className="min-w-0 flex-[2] space-y-1.5">
            <Bar className="w-40" />
            <Bar className="h-2 w-28 opacity-70" />
          </div>
          <Bar className="hidden h-5 w-24 rounded-full sm:block" />
          <div className="hidden flex-1 space-y-1.5 md:block">
            <Bar className="h-2 w-16" />
            <div className="skeleton h-1.5 w-[110px] rounded-full" />
          </div>
          <div className="hidden flex-1 space-y-1.5 lg:block">
            <Bar className="h-2 w-20" />
            <div className="skeleton h-1 w-[92px] rounded-full" />
          </div>
          <Bar className="hidden h-2.5 w-20 lg:block" />
          <div className="skeleton size-9 shrink-0 rounded-full" />
        </div>
      ))}
    </PanelChrome>
  );
}

export function ProductionChartSkeleton() {
  return (
    <PanelChrome>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex gap-6">
          <div className="space-y-2">
            <Bar className="h-2 w-12" />
            <Bar className="h-5 w-28" />
          </div>
          <div className="space-y-2">
            <Bar className="h-2 w-16" />
            <Bar className="h-4 w-20" />
          </div>
        </div>
        <div className="skeleton h-[208px] rounded-lg" />
        <div className="grid gap-x-6 gap-y-2 border-t border-border/70 pt-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Bar className="h-2 w-12 shrink-0" />
              <div className="skeleton h-1.5 flex-1 rounded-full" />
              <Bar className="h-2 w-10 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </PanelChrome>
  );
}

export function RevenueCardsSkeleton() {
  return (
    <PanelChrome>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"
          >
            <div className="flex items-start justify-between">
              <div className="skeleton size-7 rounded-lg" />
              <Bar className="h-4 w-14 rounded-md" />
            </div>
            <Bar className="mt-3 h-2 w-24" />
            <Bar className="mt-2 h-4 w-28" />
            <div className="skeleton mt-3 h-1.5 rounded-full" />
            <Bar className="mt-2.5 h-2 w-32 opacity-70" />
          </div>
        ))}
      </div>
    </PanelChrome>
  );
}

export function ListPanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <PanelChrome>
      <div className="p-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-2.5 py-2.5">
            <div className="skeleton size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Bar className="w-[70%]" />
              <Bar className="h-2 w-[45%] opacity-70" />
            </div>
            <Bar className="h-2.5 w-9 shrink-0" />
          </div>
        ))}
      </div>
    </PanelChrome>
  );
}
