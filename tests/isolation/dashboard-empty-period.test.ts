/**
 * What the dashboard shows on a week when nothing happened.
 *
 * The Operations Center is the page everybody opens first, and an empty period
 * is not an exotic case — it is Monday morning, a new contractor's first week,
 * and any stretch where nothing has a daily pace set against it. Every figure
 * on it is a ratio of something to something else, and the denominators are all
 * counts that are legitimately zero.
 *
 * One of them was not guarded, and the dashboard rendered a red `NaN%` badge
 * beside a perfectly correct "0 ft".
 *
 * The rule these pin down: no NaN, no Infinity, and no percentage that claims a
 * comparison nobody can make.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { percentAgainstPlan, formatSigned } from "@/lib/format";

const CHART = readFileSync("src/components/dashboard/production-chart.tsx", "utf8");
const QUERIES = readFileSync("src/data/queries.ts", "utf8");
const TYPES = readFileSync("src/lib/types.ts", "utf8");
const DONUTS = readFileSync("src/components/dashboard/ops-donuts.tsx", "utf8");

/**
 * Just the dailies ring.
 *
 * The locate ring in the same file reuses most of the same status tokens for
 * its own states, which is correct — green means clear to dig there and
 * approved here, and both are the good outcome. Scoping to one chart keeps the
 * no-token-twice rule about one chart, which is where it applies.
 */
const DAILIES_RING = (() => {
  const from = DONUTS.indexOf("export function DailiesDonut");
  const to = DONUTS.indexOf("export function LocatesDonut");
  if (from < 0 || to < 0) throw new Error("could not isolate DailiesDonut in ops-donuts.tsx");
  return DONUTS.slice(from, to);
})();

const ringTokens = () =>
  [...DAILIES_RING.matchAll(/color: "var\((--[a-z-]+)\)"/g)].map((m) => m[1]);
const METER = readFileSync("src/components/common/metric.tsx", "utf8");
const DONUT = readFileSync("src/components/charts/donut.tsx", "utf8");

describe("production against a plan that does not exist", () => {
  it("is not a number, because there is nothing to compare to", () => {
    // This is the exact case that produced NaN%: no project carries a required
    // daily pace, so the day's target sums to zero.
    expect(percentAgainstPlan(0, 0)).toBeNull();
    expect(percentAgainstPlan(1450, 0)).toBeNull();
  });

  it("is not a number for a plan below zero either", () => {
    /**
     * This is the case the `plan <= 0` guard exists for, and the only one it
     * uniquely catches — a mutation run proved the rest of the function already
     * handles a plan of exactly zero, because dividing by it yields NaN or
     * Infinity and the finite check at the end rejects both.
     *
     * A negative plan divides cleanly and produces a confident, meaningless
     * figure: 100 ft against a plan of -50 reads as -300%, which would render
     * as a real badge nobody could account for.
     */
    expect(percentAgainstPlan(100, -50)).toBeNull();
    expect(percentAgainstPlan(0, -1)).toBeNull();
  });

  it("is not reported as zero, which would claim the plan was met", () => {
    // The tempting fix, and the wrong one. 0% reads as "exactly on plan" — a
    // statement about a plan that was never set.
    expect(percentAgainstPlan(0, 0)).not.toBe(0);
  });

  it("still answers normally once there is a plan", () => {
    expect(percentAgainstPlan(1200, 1000)).toBeCloseTo(20);
    expect(percentAgainstPlan(800, 1000)).toBeCloseTo(-20);
    expect(percentAgainstPlan(1000, 1000)).toBe(0);
  });

  it("refuses a non-finite input rather than passing it on", () => {
    for (const [actual, plan] of [
      [Number.NaN, 1000],
      [1000, Number.NaN],
      [Number.POSITIVE_INFINITY, 1000],
      [1000, Number.NEGATIVE_INFINITY],
    ] as const) {
      expect(percentAgainstPlan(actual, plan)).toBeNull();
    }
  });

  it("is never rendered as a badge when it is null", () => {
    // TrendBadge already returns null for a null value; what this holds is that
    // the call site stopped handing it a bare division.
    expect(CHART).toContain("percentAgainstPlan(summary.today, summary.target)");
    expect(CHART, "the unguarded division is back").not.toMatch(
      /\(summary\.today - summary\.target\) \/ summary\.target/,
    );
    // And the absence is explained rather than left as a gap somebody reads as
    // a rendering fault.
    expect(CHART).toContain("no plan set");
  });
});

describe("the week delta on an empty week", () => {
  it("is a real zero, because last week is a figure that exists", () => {
    // Unlike the plan comparison, this one has a meaningful zero: nothing this
    // week against nothing last week is no change. The query already guards the
    // division; this holds the formatting end of it.
    expect(formatSigned(0)).toBe("0.0%");
    expect(formatSigned(0)).not.toContain("NaN");
  });
});

describe("bars and meters with nothing in them", () => {
  it("never puts NaN in a width", () => {
    // Clamping does not catch NaN: Math.min(1, NaN) is NaN, and it reaches the
    // DOM as width: NaN%.
    expect(METER).toContain("Number.isFinite(width)");

    const clamp = (width: number) =>
      `${Number.isFinite(width) ? Math.max(0, Math.min(1, width)) * 100 : 0}%`;

    // 0/0 is the case that actually happens: every caller divides a subset by
    // its own total, so an empty portfolio makes both ends zero. An empty bar
    // is the honest answer — clamping to a full one would claim completion.
    expect(clamp(0 / 0)).toBe("0%");
    expect(clamp(Number.NaN)).toBe("0%");

    // Infinity needs a positive numerator over a zero denominator, which none
    // of the call sites can produce — a bucket cannot hold projects that do not
    // exist, and the two project meters guard the division upstream. It is
    // covered because it is non-finite, not because it is reachable.
    expect(clamp(Number.POSITIVE_INFINITY)).toBe("0%");

    expect(clamp(0.5)).toBe("50%");
    expect(clamp(1.4)).toBe("100%");
    expect(clamp(-0.2)).toBe("0%");
  });

  it("does not divide by a crew total that is zero or -Infinity", () => {
    // maxCrew is a Math.max over footage: zero when nobody installed anything
    // today, and -Infinity when the crew list is empty.
    expect(CHART).toContain("maxCrew > 0");

    const width = (ft: number, maxCrew: number) =>
      `${maxCrew > 0 ? Math.min(100, (ft / maxCrew) * 100) : 0}%`;
    expect(width(0, 0)).toBe("0%");
    expect(width(0, Math.max(...([] as number[])))).toBe("0%");
    expect(width(500, 1000)).toBe("50%");
  });
});

describe("the dailies ring counts every status", () => {
  /** The DailyStatus union, read off the type rather than restated here. */
  function declaredStatuses(): string[] {
    const block = /export type DailyStatus =([\s\S]*?);/.exec(TYPES);
    if (!block) throw new Error("could not find the DailyStatus union in types.ts");
    return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  }

  it("reads six statuses off the union, so this test cannot drift from it", () => {
    const declared = declaredStatuses();
    expect(declared).toEqual(["Submitted", "In review", "Approved", "Denied", "Flagged", "Draft"]);
  });

  it("counts every one of them in the query", () => {
    /**
     * The bug this exists for: the query counted four of the six, so Flagged
     * and Draft dailies were missing from the dashboard entirely. The ring's
     * denominator is the sum of what it is handed, so the shares still looked
     * perfectly consistent — computed over the wrong whole. Nothing on screen
     * said a number was missing.
     *
     * The dailies list makes the same argument in its own comment: a daily in
     * one of those states is still a daily somebody has to deal with, and
     * leaving it out of the count is how it gets forgotten.
     */
    const counted = [...QUERIES.matchAll(/\bof\("([^"]+)"\)/g)].map((m) => m[1]);
    expect([...counted].sort()).toEqual([...declaredStatuses()].sort());
  });

  it("gives every status a slice in the ring", () => {
    for (const status of declaredStatuses()) {
      // "Draft" is labelled "Not filed" on the dashboard, because that is what
      // it means to somebody reading it rather than writing it.
      const label = status === "Draft" ? "Not filed" : status;
      expect(DAILIES_RING, `${status} has no slice`).toContain(`label: "${label}"`);
    }
  });

  it("does not paint two states with one token", () => {
    const used = ringTokens();
    expect(used.length).toBe(declaredStatuses().length);
    expect(new Set(used).size, `a token is doing double duty: ${used.join(", ")}`).toBe(used.length);
  });

  it("keeps the two ambers apart in the ring order", () => {
    /**
     * --vq-gold and --warning are both ambers, and in the light theme both dark
     * browns: the palette validator rates them ΔE 0.7 for a protanope. Adjacent
     * in a ring they read as one slice, so the order deliberately separates
     * them and this holds that nobody "tidies" it back into lifecycle order.
     */
    const order = ringTokens();
    const gold = order.indexOf("--vq-gold");
    const warning = order.indexOf("--warning");
    expect(gold).toBeGreaterThanOrEqual(0);
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(Math.abs(gold - warning), "the two ambers are adjacent again").toBeGreaterThan(1);
  });

  it("drops a zero-count state instead of drawing a dead legend row", () => {
    expect(DAILIES_RING).toContain(".filter((s) => s.value > 0)");
  });
});

describe("a ring where one category holds everything", () => {
  it("draws the whole circle rather than nothing", () => {
    /**
     * An SVG arc whose start and end are the same point is degenerate and draws
     * nothing, so a single slice at 100% rendered as an empty grey track — the
     * one reading where the data is least ambiguous looked like a panel that
     * had failed to load.
     */
    expect(DONUT).toContain("to - from >= 0.999");
    expect(DONUT).toMatch(/<circle[\s\S]{0,400}stroke=\{s\.color\}/);
  });

  it("still leaves no gap notched out of a complete ring", () => {
    // A gap belongs between two segments. Cut into a circle that has no
    // neighbour it reads as missing data.
    expect(DONUT).toContain("real.length > 1 ? 2 / (TAU * rOuter) : 0");
  });

  it("names every slice in the legend, so colour is never the only signal", () => {
    expect(DONUT).toContain("{s.label}");
    expect(DONUT).toContain("{s.value.toLocaleString(\"en-US\")}");
  });
});
