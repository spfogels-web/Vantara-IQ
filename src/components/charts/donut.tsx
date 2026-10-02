"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * One donut, drawn the same way everywhere.
 *
 * Built once rather than per panel because the things that make a donut
 * readable are easy to get subtly wrong and tedious to get right twice: the
 * gap between segments, the order the slices go round in, what happens when a
 * slice is a rounding error, and what the middle says.
 *
 * ## What it will not do
 *
 * It takes a fixed series order from the caller and never cycles a colour. Two
 * slices that mean different things never share a hue, and a slice does not
 * change colour because a filter removed the one before it — colour follows the
 * thing, not its rank.
 *
 * Identity is never colour alone. Every slice is in the legend with its own
 * figure beside it, so the chart still reads in grayscale, in print, and to
 * somebody who cannot separate the two greens.
 *
 * ## The gap
 *
 * Segments are separated by a real gap cut out of the ring rather than a stroke
 * drawn over the join. A stroke in the surface colour looks identical on this
 * background and wrong on any other, and these panels are rendered on three
 * different surfaces across the themes this app ships.
 */

export type DonutSlice = {
  /** Stable key — also what the legend and the tooltip say. */
  label: string;
  value: number;
  /** A CSS colour, normally a var() so it re-themes. See tone.ts. */
  color: string;
  /** Shown under the label in the legend, when there is something to add. */
  hint?: string;
};

const TAU = Math.PI * 2;

/** Where a point on the ring lands, with 12 o'clock as zero. */
function at(cx: number, cy: number, r: number, turn: number) {
  const a = turn * TAU - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** One segment as a filled ring wedge, with its ends cut square. */
function wedge(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  from: number,
  to: number,
): string {
  const big = to - from > 0.5 ? 1 : 0;
  const o1 = at(cx, cy, rOuter, from);
  const o2 = at(cx, cy, rOuter, to);
  const i2 = at(cx, cy, rInner, to);
  const i1 = at(cx, cy, rInner, from);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${big} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${rInner} ${rInner} 0 ${big} 0 ${i1.x} ${i1.y}`,
    "Z",
  ].join(" ");
}

export function Donut({
  slices,
  total,
  centreLabel,
  centreValue,
  size = 148,
  thickness = 18,
  className,
  legend = true,
}: {
  slices: DonutSlice[];
  /** The denominator. Defaults to the sum, which is what a share usually means. */
  total?: number;
  centreLabel?: string;
  /** Overrides the computed total in the middle — a count, usually. */
  centreValue?: string;
  size?: number;
  thickness?: number;
  className?: string;
  legend?: boolean;
}) {
  const [hover, setHover] = React.useState<string | null>(null);

  const real = slices.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const sum = real.reduce((n, s) => n + s.value, 0);
  const denom = total && total > 0 ? total : sum;

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  const rInner = rOuter - thickness;

  /**
   * The gap, in turns, scaled so it stays 2px of arc whatever the radius.
   *
   * Dropped entirely when one slice is the whole ring: a gap there is a notch
   * cut in a complete circle for no reason, and it reads as missing data.
   */
  const gap = real.length > 1 ? 2 / (TAU * rOuter) : 0;

  let cursor = 0;
  const drawn = real.map((s) => {
    const share = denom > 0 ? s.value / denom : 0;
    const from = cursor;
    const to = cursor + share;
    cursor = to;
    return { ...s, share, from, to };
  });

  const dimmed = (label: string) => hover !== null && hover !== label;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-3", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={
            drawn.length
              ? drawn.map((s) => `${s.label}: ${s.value}`).join(", ")
              : "Nothing to show yet"
          }
        >
          {/* The track, so an empty or part-filled ring still reads as a ring
              rather than as a chart that failed to load. */}
          <circle
            cx={cx}
            cy={cy}
            r={(rOuter + rInner) / 2}
            fill="none"
            stroke="currentColor"
            strokeWidth={thickness}
            className="text-foreground/[0.06]"
          />
          {drawn.map((s) => {
            const from = s.from + (gap > 0 ? gap / 2 : 0);
            const to = Math.max(from, s.to - (gap > 0 ? gap / 2 : 0));
            const tip = (
              <title>{`${s.label}: ${s.value.toLocaleString("en-US")}${
                denom > 0 ? ` (${Math.round(s.share * 100)}%)` : ""
              }`}</title>
            );

            /**
             * A slice that is the whole circle is drawn as a circle.
             *
             * An arc whose start and end are the same point is degenerate — SVG
             * draws nothing at all — so one category holding 100% rendered as an
             * empty grey track. It looked exactly like a panel whose data had
             * failed to load, on the one reading where the data is unambiguous.
             */
            if (to - from >= 0.999) {
              return (
                <circle
                  key={s.label}
                  cx={cx}
                  cy={cy}
                  r={(rOuter + rInner) / 2}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  opacity={dimmed(s.label) ? 0.35 : 1}
                  className="transition-opacity"
                  onMouseEnter={() => setHover(s.label)}
                  onMouseLeave={() => setHover(null)}
                >
                  {tip}
                </circle>
              );
            }

            return (
              <path
                key={s.label}
                d={wedge(cx, cy, rOuter, rInner, from, to)}
                fill={s.color}
                opacity={dimmed(s.label) ? 0.35 : 1}
                className="transition-opacity"
                onMouseEnter={() => setHover(s.label)}
                onMouseLeave={() => setHover(null)}
              >
                {tip}
              </path>
            );
          })}
        </svg>

        {/* The middle answers the question the panel is titled with. Text takes
            text tokens, never a series colour — the ring carries identity. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="num text-[20px] font-semibold leading-none tracking-[-0.02em] text-foreground">
            {centreValue ?? (denom > 0 ? denom.toLocaleString("en-US") : "—")}
          </span>
          {centreLabel ? (
            <span className="mt-0.5 max-w-[70%] text-[9.5px] leading-tight text-muted-foreground">
              {centreLabel}
            </span>
          ) : null}
        </div>
      </div>

      {legend ? (
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
          {slices.map((s) => {
            const share = denom > 0 ? s.value / denom : 0;
            return (
              <li
                key={s.label}
                onMouseEnter={() => setHover(s.label)}
                onMouseLeave={() => setHover(null)}
                className={cn(
                  "flex items-center gap-2 text-[11.5px] transition-opacity",
                  dimmed(s.label) && "opacity-50",
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: s.color }}
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {s.label}
                  {s.hint ? (
                    <span className="ml-1 text-muted-foreground/60">{s.hint}</span>
                  ) : null}
                </span>
                <span className="num shrink-0 font-medium text-foreground">
                  {s.value.toLocaleString("en-US")}
                </span>
                <span className="num w-9 shrink-0 text-right text-muted-foreground/70">
                  {denom > 0 ? `${Math.round(share * 100)}%` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
