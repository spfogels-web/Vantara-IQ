/**
 * The coverage arithmetic, checked against cases with known answers.
 *
 * This is pure domain logic with no database in it, so it can be imported
 * directly — unlike anything that reaches Prisma, which would hand the vitest
 * process a production connection.
 *
 * Coverage is the number most likely to be quietly wrong and most likely to
 * be believed anyway, because it looks like a percentage and percentages look
 * settled. Each case below has an answer worked out by hand.
 */
import { describe, expect, it } from "vitest";

import {
  COVERAGE_WINDOW_SECONDS,
  MEANINGFUL_GAP_SECONDS,
  coverageFor,
  metresBetween,
  isValidPosition,
  trackingState,
  routeSegments,
  observedMetres,
} from "@/lib/workforce-location";

const T0 = new Date("2026-09-24T11:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const point = (minutes: number, lat = 33.9, lng = -83.4) => ({
  capturedAt: at(minutes),
  latitude: lat,
  longitude: lng,
  accuracyMeters: 20,
});

describe("coverage measures time, not points", () => {
  it("is 100% when points arrive inside every window", () => {
    // A 60-minute shift with a point every 5 minutes. Each speaks for 6, so
    // the windows overlap and nothing is left uncovered.
    const points = Array.from({ length: 13 }, (_, i) => point(i * 5));
    const c = coverageFor(points, at(0), at(60));
    expect(c.percent).toBe(100);
    expect(c.gaps).toEqual([]);
    expect(c.points).toBe(13);
  });

  it("does not let a burst of points buy coverage it did not earn", () => {
    // Six points inside one minute, then silence for an hour. A points-based
    // formula would call this well covered; it covers six minutes.
    const burst = Array.from({ length: 6 }, (_, i) => point(i * 0.2));
    const c = coverageFor(burst, at(0), at(60));
    // The last of the six lands at minute 1 and speaks until minute 7, so
    // seven minutes of sixty are covered: 12%. Six points, twelve per cent —
    // which is the whole argument against counting points.
    expect(c.percent, "a burst was counted as an hour of coverage").toBe(12);
    expect(c.longestGapSeconds, "the silent hour was not recorded as a gap")
      .toBeGreaterThan(50 * 60);
  });

  it("finds the gap between two islands of reporting", () => {
    // Points for the first ten minutes, nothing until the fiftieth.
    const points = [point(0), point(5), point(10), point(50), point(55)];
    const c = coverageFor(points, at(0), at(60));

    // Two measures, two questions, both right.
    //
    // Coverage counts observed time: points speak for 0–16 and 50–60, so 26
    // of 60 minutes were observed.
    expect(c.percent).toBe(Math.round((26 / 60) * 100));
    // The interruption is the silence between two fixes — minute 10 to minute
    // 50, forty minutes — which is what somebody reading "reporting stopped"
    // expects, and the same measure the route uses to break its line.
    expect(c.gaps.length, "the one real gap was not found").toBe(1);
    expect(Math.round(c.gaps[0].seconds / 60)).toBe(40);
    expect(Math.round(c.longestGapSeconds / 60)).toBe(40);
  });

  it("ignores gaps too short to mean anything", () => {
    // Points every 8 minutes: each leaves a 2-minute hole, which is the
    // ordinary rhythm of reporting rather than an interruption.
    const points = Array.from({ length: 8 }, (_, i) => point(i * 8));
    const c = coverageFor(points, at(0), at(60));
    expect(c.gaps, "ordinary spacing was reported as interruptions").toEqual([]);
    expect(c.longestGapSeconds).toBeLessThan(MEANINGFUL_GAP_SECONDS);
  });

  it("reports nothing observed when there are no points at all", () => {
    const c = coverageFor([], at(0), at(60));
    expect(c.percent).toBe(0);
    expect(c.points).toBe(0);
    expect(c.gaps.length).toBe(1);
    expect(c.gaps[0].seconds).toBe(3600);
  });

  it("does not count a window that runs past the end of the shift", () => {
    // One point a minute before clock-out. Its window is six minutes long but
    // only one of them is inside the shift.
    const c = coverageFor([point(59)], at(0), at(60));
    expect(c.percent).toBe(Math.round((1 / 60) * 100));
  });

  it("handles an overnight shift without losing the night", () => {
    // 10pm to 6am, reporting throughout. The date changes in the middle and
    // the arithmetic must not notice.
    const start = new Date("2026-09-24T02:00:00Z");
    const end = new Date("2026-09-24T10:00:00Z");
    const points = Array.from({ length: 97 }, (_, i) => ({
      capturedAt: new Date(start.getTime() + i * 5 * 60_000),
      latitude: 33.9,
      longitude: -83.4,
      accuracyMeters: 18,
    }));
    const c = coverageFor(points, start, end);
    expect(c.shiftSeconds).toBe(8 * 3600);
    expect(c.percent).toBe(100);
    expect(c.gaps).toEqual([]);
  });

  it("puts the window where the documentation says it is", () => {
    // Forward-looking: a fix speaks for the time after it, not before. A
    // single point at the start of a six-minute shift covers all of it.
    const c = coverageFor([point(0)], at(0), at(COVERAGE_WINDOW_SECONDS / 60));
    expect(c.percent).toBe(100);
    // ...and a single point at the end covers only the instant.
    const tail = coverageFor([point(6)], at(0), at(6));
    expect(tail.percent).toBe(0);
  });
});

describe("tracking status is about what arrived, not what is open", () => {
  it("is not active merely because a shift is open", () => {
    expect(trackingState(null), "an open shift with no points claimed to be tracking")
      .toBe("NONE");
  });

  it("goes stale once nothing has arrived for a window", () => {
    const now = at(60);
    expect(trackingState(at(58), now)).toBe("ACTIVE");
    expect(trackingState(at(50), now), "an hour-old fix still read as active").toBe("STALE");
  });
});

describe("the arithmetic underneath", () => {
  it("measures a short distance about right", () => {
    // ~111m per 0.001° of latitude. Good enough to compare against a 25m
    // threshold, which is all it is used for.
    const d = metresBetween(
      { latitude: 33.9, longitude: -83.4 },
      { latitude: 33.901, longitude: -83.4 },
    );
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });

  it("calls the same place zero metres away", () => {
    expect(metresBetween({ latitude: 33.9, longitude: -83.4 }, { latitude: 33.9, longitude: -83.4 }))
      .toBeCloseTo(0, 5);
  });

  it("refuses positions the Earth does not have", () => {
    expect(isValidPosition(91, 0), "a latitude past the pole was accepted").toBe(false);
    expect(isValidPosition(0, 181)).toBe(false);
    expect(isValidPosition(Number.NaN, 0)).toBe(false);
    expect(isValidPosition(Number.POSITIVE_INFINITY, 0)).toBe(false);
    expect(isValidPosition("33.9" as unknown, -83.4)).toBe(false);
    expect(isValidPosition(null, null)).toBe(false);
    expect(isValidPosition(33.9, -83.4)).toBe(true);
    // The Atlantic is a valid position, even if nobody works there.
    expect(isValidPosition(0, 0)).toBe(true);
  });
});

describe("the route breaks where the observation did", () => {
  const rp = (minutes: number, kind: "CLOCK_IN" | "PERIODIC" | "CLOCK_OUT" = "PERIODIC") => ({
    id: `p${minutes}`,
    kind,
    capturedAt: at(minutes),
    latitude: 33.9 + minutes * 0.0001,
    longitude: -83.4,
    accuracyMeters: 20,
  });

  it("keeps one segment when reporting is continuous", () => {
    const segs = routeSegments([rp(0, "CLOCK_IN"), rp(2), rp(4), rp(6), rp(8, "CLOCK_OUT")]);
    expect(segs.length).toBe(1);
    expect(segs[0].points.length).toBe(5);
    expect(segs[0].gapAfterSeconds).toBeNull();
  });

  it("splits the line at a gap longer than ten minutes", () => {
    // 7:00 -> 9:14, a 34-minute hole, then 9:48 -> 12:30, in miniature.
    const segs = routeSegments([rp(0, "CLOCK_IN"), rp(4), rp(8), rp(42), rp(46, "CLOCK_OUT")]);
    expect(segs.length, "the route was drawn straight through the gap").toBe(2);
    expect(segs[0].points.length).toBe(3);
    expect(segs[1].points.length).toBe(2);
    // The gap is reported on the segment it follows, so the map can label it.
    expect(Math.round((segs[0].gapAfterSeconds ?? 0) / 60)).toBe(34);
    expect(segs[1].gapAfterSeconds).toBeNull();
  });

  it("does not split at a gap of exactly ten minutes", () => {
    // The boundary is "longer than", and it has to match the coverage
    // threshold exactly or the map and the summary disagree.
    const segs = routeSegments([rp(0), rp(10), rp(20)]);
    expect(segs.length, "an ordinary ten-minute gap broke the route").toBe(1);
  });

  it("splits at a gap a second over the threshold", () => {
    const points = [
      { id: "a", kind: "PERIODIC" as const, capturedAt: at(0), latitude: 33.9, longitude: -83.4, accuracyMeters: 20 },
      { id: "b", kind: "PERIODIC" as const, capturedAt: new Date(at(10).getTime() + 1000), latitude: 33.91, longitude: -83.4, accuracyMeters: 20 },
    ];
    expect(routeSegments(points).length).toBe(2);
  });

  it("uses the same threshold the coverage summary uses", () => {
    // One definition of "a gap". If these ever diverge, a manager sees a
    // broken line beside a summary claiming no interruptions, or worse.
    const justOver = MEANINGFUL_GAP_SECONDS + 60;
    const segs = routeSegments([rp(0), rp(justOver / 60)]);
    const cov = coverageFor([point(0), point(justOver / 60)], at(0), at(justOver / 60 + 6));
    expect(segs.length).toBe(2);
    expect(cov.gaps.length, "the summary did not call it a gap too").toBe(1);
  });

  it("returns nothing for a shift with no points", () => {
    expect(routeSegments([])).toEqual([]);
  });

  it("measures distance within segments only", () => {
    // Across the gap the two positions are far apart; that distance was never
    // travelled under observation and must not be added.
    const near = [
      { id: "a", kind: "PERIODIC" as const, capturedAt: at(0), latitude: 33.9, longitude: -83.4, accuracyMeters: 20 },
      { id: "b", kind: "PERIODIC" as const, capturedAt: at(2), latitude: 33.901, longitude: -83.4, accuracyMeters: 20 },
    ];
    const withGap = [
      ...near,
      { id: "c", kind: "PERIODIC" as const, capturedAt: at(60), latitude: 34.9, longitude: -83.4, accuracyMeters: 20 },
    ];
    const joined = observedMetres(routeSegments(near));
    const split = observedMetres(routeSegments(withGap));
    expect(split, "the unobserved jump was counted as distance travelled").toBe(joined);
  });
});
