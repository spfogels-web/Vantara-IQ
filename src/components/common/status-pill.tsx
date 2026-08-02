import * as React from "react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import type { Tone } from "@/lib/types";

export function StatusPill({
  label,
  tone,
  dot = true,
  className,
}: {
  label: string;
  tone: Tone;
  dot?: boolean;
  className?: string;
}) {
  const s = toneStyles[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[3px] text-[11px] font-medium",
        s.bg,
        s.border,
        s.text,
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", s.dot)} /> : null}
      {label}
    </span>
  );
}

/** Pulsing dot for "live" states — used sparingly, only on active work. */
export function LiveDot({ tone = "success" }: { tone?: Tone }) {
  const s = toneStyles[tone];
  return (
    <span className="relative grid size-2 place-items-center">
      <span
        className={cn("absolute size-2 rounded-full opacity-60", s.dot)}
        style={{ animation: "pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite" }}
      />
      <span className={cn("relative size-1.5 rounded-full", s.dot)} />
    </span>
  );
}
