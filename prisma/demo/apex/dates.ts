/**
 * Every date in the Apex demo, expressed as a distance from the day it is
 * seeded.
 *
 * Nothing here is an absolute date, and that is the whole point. A demo seeded
 * with real dates is a demo that reads as an active contractor for a fortnight
 * and as an abandoned one forever after: locates that expired last spring,
 * invoices eleven months overdue, a "this week" that was two years ago.
 *
 * So the dataset is defined in offsets — "the daily three working days back",
 * "the locate that expires the day after tomorrow" — and resolved against the
 * anchor at seed time. Re-seeding on any future date produces the same shape.
 *
 * Re-anchoring an *existing* Apex is deliberately not built here. Shifting
 * every date in a populated database is a broad write utility and it deserves
 * its own design rather than being smuggled in beside the first seed.
 */

/** `YYYY-MM-DD`, which is how the schema stores workDate, deadline and friends. */
export type DateString = string;

export function iso(d: Date): DateString {
  return d.toISOString().slice(0, 10);
}

/** The anchor, normalised to midnight so offsets are whole days. */
export function anchorOf(now: Date = new Date()): Date {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  return a;
}

export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

/** `days` before the anchor (negative) or after it (positive), as a date. */
export function at(anchor: Date, days: number): Date {
  return addDays(anchor, days);
}

/** The same, as the `YYYY-MM-DD` string the schema holds. */
export function on(anchor: Date, days: number): DateString {
  return iso(at(anchor, days));
}

const WEEKEND = new Set([0, 6]);

/** Whether a day is one a crew would normally have worked. */
export function isWorkday(d: Date): boolean {
  return !WEEKEND.has(d.getDay());
}

/**
 * The last `count` working days ending `endOffset` days from the anchor, most
 * recent first.
 *
 * Production history has to fall on working days or every dashboard that
 * averages by day reads low, and a "missing daily" story stops being legible —
 * a gap on a Sunday is not a missing daily, it is a Sunday.
 */
export function workdaysBack(anchor: Date, count: number, endOffset = 0): Date[] {
  const out: Date[] = [];
  let cursor = at(anchor, endOffset);
  while (out.length < count) {
    if (isWorkday(cursor)) out.push(new Date(cursor));
    cursor = addDays(cursor, -1);
  }
  return out;
}

/** Saturday ending the billing week a date falls in — how billing groups work. */
export function billingWeekEnd(d: Date): DateString {
  const end = new Date(d);
  const daysToSaturday = (6 - end.getDay() + 7) % 7;
  end.setDate(end.getDate() + daysToSaturday);
  return iso(end);
}

/** A stable pseudo-random number in [0,1) from a string. No Math.random. */
export function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * A quantity that varies by day and project but never by run.
 *
 * Deterministic on purpose: an idempotent seed has to produce the same numbers
 * on a re-run or every invoice it already wrote stops reconciling.
 */
export function vary(seed: string, base: number, spread: number): number {
  return Math.round((base + (hashUnit(seed) - 0.5) * 2 * spread) * 100) / 100;
}
