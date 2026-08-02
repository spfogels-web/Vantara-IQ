"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import type { Tone } from "@/lib/types";

/**
 * Counts from 0 to `value` on mount using an eased rAF loop, then hands off to
 * the caller's formatter. Respects prefers-reduced-motion by jumping straight
 * to the final value.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 1100,
  className,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = React.useState(value);

  React.useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    let start: number | null = null;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      // easeOutExpo — fast arrival, long settle
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(value * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={cn("num", className)} suppressHydrationWarning>
      {format(Math.round(display))}
    </span>
  );
}

/** Horizontal proportion bar used in health, revenue and crew panels. */
export function Meter({
  value,
  tone = "info",
  className,
  delay = 0,
}: {
  /** 0–1 */
  value: number;
  tone?: Tone;
  className?: string;
  delay?: number;
}) {
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const timer = setTimeout(() => setWidth(value), 60 + delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full", toneStyles[tone].dot)}
        style={{
          width: `${Math.max(0, Math.min(1, width)) * 100}%`,
          transition: "width 1000ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}
