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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[3px] text-[11px]",
        s.text,
        className,
      )}
      style={{
        // Fill and border strength are vibe knobs: barely-there on chill,
        // solid and loud on vibrant. The hue itself still comes from the tone.
        backgroundColor: `color-mix(in srgb, ${s.cssVar} var(--vibe-pill-bg), transparent)`,
        borderColor: `color-mix(in srgb, ${s.cssVar} var(--vibe-pill-border), transparent)`,
        fontWeight: "var(--vibe-pill-weight)" as React.CSSProperties["fontWeight"],
      }}
    >
      {dot ? (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: s.cssVar,
            boxShadow: `0 0 6px color-mix(in srgb, ${s.cssVar} var(--vibe-meter-glow), transparent)`,
          }}
        />
      ) : null}
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
