"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { healthTone, toneHex } from "@/lib/tone";

/**
 * Circular health score. The arc animates from 0 on mount via a
 * stroke-dashoffset transition, which reads as the value "settling" rather
 * than snapping into place.
 */
export function HealthRing({
  score,
  size = 40,
  stroke = 3.5,
  showValue = true,
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  showValue?: boolean;
  className?: string;
}) {
  const [progress, setProgress] = React.useState(0);
  const color = toneHex(healthTone(score));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const gradientId = React.useId();

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setProgress(score));
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Health score ${score} out of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.65" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-foreground/[0.07]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)",
            filter: `drop-shadow(0 0 5px ${color}55)`,
          }}
        />
      </svg>
      {showValue ? (
        <span
          className="num absolute inset-0 grid place-items-center text-[11px] font-semibold"
          style={{ color, fontSize: size >= 64 ? 18 : size >= 48 ? 13 : 11 }}
        >
          {score}
        </span>
      ) : null}
    </div>
  );
}
