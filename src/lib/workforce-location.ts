/**
 * What Vantara actually observed about where a device was, and what it did
 * not observe.
 *
 * The one rule this file exists to enforce: nothing in here invents a
 * position. Browsers on phones stop running JavaScript when the screen locks,
 * when the tab goes to the background, when the OS decides the battery
 * matters more, and when the network disappears. Every one of those produces a
 * gap in the record, and the honest thing — the only useful thing — is to
 * show the gap.
 *
 * A route drawn through missing minutes would imply somebody was somewhere
 * nobody knows they were, which is worse than admitting the gap, because it
 * would be evidence in a dispute that Vantara made up.
 */

/**
 * WHAT THESE THRESHOLDS ACTUALLY COST, MEASURED.
 *
 * Simulated against a browser emitting a fix a second, applying the same
 * three rules below. Rows written per shift:
 *
 *                       8h     10h    12h
 *   parked all day      98     122    146
 *   walking a route     242    302    362
 *   driving between     242    302    362
 *
 * Moving costs roughly double standing still, because once somebody is
 * moving the 120-second floor is what binds — a point every two minutes,
 * thirty an hour — rather than the 25-metre threshold. That is the intended
 * trade: two-minute route resolution while somebody is actually going
 * somewhere. At twenty employees on a twenty-two day month the worst case
 * is about 66,000 rows, which this table is indexed for.
 *
 * These are the real numbers. An earlier planning estimate of 80–150 points
 * per shift held only for a stationary crew, and is not repeated here,
 * because a figure that flatters the design is worse than no figure.
 *
 * Re-measure before changing any constant below.
 */
/** No point is persisted less than this after the previous one. */
export const MIN_SECONDS_BETWEEN_POINTS = 120;

/** A stationary device still reports this often, so a shift has a heartbeat. */
export const HEARTBEAT_SECONDS = 300;

/** Below this, a new position is the same place with noise on it. */
export const MIN_MOVEMENT_METRES = 25;

/** A fix vaguer than this says little; periodic points are dropped above it. */
export const MAX_PERIODIC_ACCURACY_METRES = 100;

/**
 * How long one point speaks for.
 *
 * Forward-looking rather than centred: a fix tells you reporting was working
 * at that moment, and confidence decays as time passes, not before it. Six
 * minutes is the heartbeat plus a minute of slack, so a phone reporting
 * normally shows unbroken coverage while one that stopped shows the stop.
 */
export const COVERAGE_WINDOW_SECONDS = 360;

/** Below this a gap is the ordinary rhythm of reporting; above it, a fact. */
export const MEANINGFUL_GAP_SECONDS = 600;

export type LocationPoint = {
  capturedAt: Date;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export type Gap = {
  /** Inclusive start of the unobserved stretch. */
  from: Date;
  to: Date;
  seconds: number;
};

export type Coverage = {
  /** 0–100, rounded. The share of the shift a point speaks for. */
  percent: number;
  points: number;
  /** Unobserved stretches longer than MEANINGFUL_GAP_SECONDS. */
  gaps: Gap[];
  longestGapSeconds: number;
  lastPointAt: Date | null;
  shiftSeconds: number;
};

/**
 * Metres between two positions.
 *
 * Haversine on a sphere. Good to a few metres over the distances a crew moves
 * in a day, which is far finer than the fixes being compared — a GPS reading
 * with 20m accuracy does not deserve an ellipsoidal model.
 */
export function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a number is a real coordinate and not a hopeful string. */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Whether a position is one the Earth has. */
export function isValidPosition(lat: unknown, lng: unknown): boolean {
  return (
    isFiniteNumber(lat) &&
    isFiniteNumber(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * How much of a shift the location record actually speaks for.
 *
 * Each point covers the window that follows it, clipped to the shift; the
 * covered windows are merged and measured against the shift's length. What is
 * left over is what nobody observed.
 *
 * Deliberately NOT points ÷ some expected number of points. That flatters a
 * phone that reported nothing for an hour and then sent six fixes in a
 * minute, and punishes one that sat still doing exactly what it was asked.
 * Time is the thing being asked about, so time is what is measured.
 *
 * THIS IS NOT ATTENDANCE. It says how much of the shift a device was
 * reporting its position. It says nothing about whether somebody was working,
 * and it must never be presented as though it did — a phone in a truck cab
 * with a flat battery is not an absent employee.
 */
export function coverageFor(
  points: LocationPoint[],
  shiftStart: Date,
  shiftEnd: Date,
): Coverage {
  const shiftSeconds = Math.max(0, Math.round((shiftEnd.getTime() - shiftStart.getTime()) / 1000));
  const ordered = [...points].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  if (shiftSeconds === 0 || ordered.length === 0) {
    return {
      percent: 0,
      points: ordered.length,
      gaps:
        shiftSeconds > MEANINGFUL_GAP_SECONDS
          ? [{ from: shiftStart, to: shiftEnd, seconds: shiftSeconds }]
          : [],
      longestGapSeconds: shiftSeconds,
      lastPointAt: ordered.at(-1)?.capturedAt ?? null,
      shiftSeconds,
    };
  }

  // Each point speaks for the window after it, clipped to the shift.
  const windows: [number, number][] = [];
  for (const p of ordered) {
    const from = Math.max(shiftStart.getTime(), p.capturedAt.getTime());
    const to = Math.min(shiftEnd.getTime(), p.capturedAt.getTime() + COVERAGE_WINDOW_SECONDS * 1000);
    if (to > from) windows.push([from, to]);
  }

  // Merge overlaps, so a burst of points does not count its seconds twice.
  const merged: [number, number][] = [];
  for (const w of windows) {
    const last = merged.at(-1);
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w]);
  }

  const coveredMs = merged.reduce((n, [a, b]) => n + (b - a), 0);

  /**
   * The interruptions, measured between points rather than between windows.
   *
   * Two different questions live in this function and they need two different
   * measures. The percentage above asks how much of the shift was observed,
   * so it counts covered time. An *interruption* asks when reporting stopped
   * and restarted, which is the interval from one point to the next — if the
   * last fix was 9:14 and the next was 9:48, the interruption was 34 minutes,
   * and that is the number a person expects to read.
   *
   * It also has to be the same measure routeSegments uses, or the map breaks
   * its line in a place the summary does not call an interruption, and a
   * manager is left holding two answers. One definition, used twice.
   */
  const gaps: Gap[] = [];
  const firstAt = ordered[0].capturedAt.getTime();
  if (firstAt - shiftStart.getTime() > MEANINGFUL_GAP_SECONDS * 1000) {
    gaps.push(gap(shiftStart.getTime(), firstAt));
  }
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1].capturedAt.getTime();
    const b = ordered[i].capturedAt.getTime();
    if (b - a > MEANINGFUL_GAP_SECONDS * 1000) gaps.push(gap(a, b));
  }
  const lastAt = ordered.at(-1)!.capturedAt.getTime();
  if (shiftEnd.getTime() - lastAt > MEANINGFUL_GAP_SECONDS * 1000) {
    gaps.push(gap(lastAt, shiftEnd.getTime()));
  }

  const meaningful = gaps;

  return {
    percent: Math.round((coveredMs / (shiftSeconds * 1000)) * 100),
    points: ordered.length,
    gaps: meaningful,
    longestGapSeconds: meaningful.reduce((n, g) => Math.max(n, g.seconds), 0),
    lastPointAt: ordered.at(-1)!.capturedAt,
    shiftSeconds,
  };
}

function gap(fromMs: number, toMs: number): Gap {
  return {
    from: new Date(fromMs),
    to: new Date(toMs),
    seconds: Math.round((toMs - fromMs) / 1000),
  };
}

/**
 * Whether a shift that is open is actually reporting.
 *
 * An open TimeEntry is not evidence that tracking works — the phone may have
 * been asleep for an hour. The employee's screen must not say "Active" on the
 * strength of the shift alone, so this asks the only question that matters:
 * how long since anything arrived.
 */
export function trackingState(
  lastPointAt: Date | null,
  now: Date = new Date(),
): "ACTIVE" | "STALE" | "NONE" {
  if (!lastPointAt) return "NONE";
  const age = (now.getTime() - lastPointAt.getTime()) / 1000;
  return age <= COVERAGE_WINDOW_SECONDS ? "ACTIVE" : "STALE";
}

/** A point as the map draws it, with its place in the record. */
export type RoutePoint = LocationPoint & {
  id: string;
  kind: "CLOCK_IN" | "PERIODIC" | "CLOCK_OUT";
};

/** One unbroken run of observation, and the silence that follows it. */
export type RouteSegment = {
  points: RoutePoint[];
  /** The gap between this segment and the next, when there is one. */
  gapAfterSeconds: number | null;
};

/**
 * The route, broken wherever nobody was watching.
 *
 * A polyline drawn straight through a thirty-four minute gap is a claim that
 * somebody travelled that line. Nothing observed it. The device was asleep,
 * or underground, or out of signal, and the truthful drawing of that is two
 * separate runs with a hole between them — which is also what the coverage
 * percentage beside the map already says, so the two agree instead of
 * contradicting each other on the same screen.
 *
 * The threshold is MEANINGFUL_GAP_SECONDS, shared with the coverage
 * calculation on purpose. One number, one definition of "a gap", and no way
 * for the map to call something an interruption that the summary does not.
 *
 * Nothing is snapped to a road and nothing is interpolated. The line joins
 * reported positions in the order they were reported, and that is the whole
 * of what it means.
 */
export function routeSegments(points: RoutePoint[]): RouteSegment[] {
  const ordered = [...points].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  if (ordered.length === 0) return [];

  const segments: RouteSegment[] = [];
  let current: RoutePoint[] = [ordered[0]];

  for (let i = 1; i < ordered.length; i++) {
    const since =
      (ordered[i].capturedAt.getTime() - ordered[i - 1].capturedAt.getTime()) / 1000;
    if (since > MEANINGFUL_GAP_SECONDS) {
      segments.push({ points: current, gapAfterSeconds: Math.round(since) });
      current = [ordered[i]];
    } else {
      current.push(ordered[i]);
    }
  }
  segments.push({ points: current, gapAfterSeconds: null });
  return segments;
}

/**
 * How far the reported positions are from each other, added up.
 *
 * Point to point, and only within a segment — measuring across a gap would
 * add a distance nobody travelled in a time nobody observed.
 *
 * This is NOT odometer mileage. It is the length of the path through the
 * positions that happened to be recorded, which is shorter than the road
 * actually driven and says nothing about fuel or reimbursement.
 */
export function observedMetres(segments: RouteSegment[]): number {
  let total = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.points.length; i++) {
      total += metresBetween(seg.points[i - 1], seg.points[i]);
    }
  }
  return Math.round(total);
}
