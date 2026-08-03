"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Dependency-free sparkline. Recharts is overkill at this size and its
 * ResponsiveContainer costs a layout pass per card — this is a single path
 * plus a gradient fill, drawn in a fixed viewBox and scaled with CSS.
 */
export function Sparkline({
  data,
  color,
  className,
  height = 36,
  showLastDot = true,
  glow = false,
}: {
  data: number[];
  color: string;
  className?: string;
  height?: number;
  showLastDot?: boolean;
  /** Soft coloured glow under the line — used on the KPI cards. */
  glow?: boolean;
}) {
  const gradientId = React.useId();

  const { line, area, lastPoint } = React.useMemo(() => {
    const W = 100;
    const H = 32;
    const pad = 3;

    if (data.length < 2) {
      return { line: "", area: "", lastPoint: { x: 0, y: 0 } };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    // Flat series would divide by zero; pin them to the vertical centre.
    const span = max - min || 1;

    const points = data.map((value, i) => ({
      x: (i / (data.length - 1)) * W,
      y: pad + (1 - (value - min) / span) * (H - pad * 2),
    }));

    // Catmull-Rom-ish smoothing: pull each segment toward the midpoint so the
    // curve stays monotonic between samples instead of overshooting.
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      d += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    return {
      line: d,
      area: `${d} L ${W} ${H} L 0 ${H} Z`,
      lastPoint: points[points.length - 1],
    };
  }, [data]);

  if (!line) return null;

  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className={cn("w-full overflow-visible", className)}
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={glow ? { filter: `drop-shadow(0 1px 4px ${color}80)` } : undefined}
      />
      {showLastDot ? (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="2"
          fill={color}
          stroke="var(--background)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
