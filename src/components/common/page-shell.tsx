import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The chrome every interior module shares: the same max-width gutter as the
 * Operations Center, a titled header with an optional eyebrow and a slot for
 * page-level actions. Keeping it here means a new tab is a data query plus a
 * body — the frame never gets re-typed.
 */
export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-gradient sm:text-[26px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      <div className="mt-5">{children}</div>
    </div>
  );
}

/** A row of headline stats used at the top of most module pages. */
export function StatStrip({
  stats,
  className,
}: {
  stats: { label: string; value: string; hint?: string; tone?: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        className,
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="surface px-4 py-3.5">
          <p className="eyebrow">{s.label}</p>
          <p className={cn("num mt-1 text-[20px] font-semibold tracking-[-0.02em]", s.tone)}>
            {s.value}
          </p>
          {s.hint ? (
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{s.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
