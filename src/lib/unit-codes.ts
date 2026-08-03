/**
 * Underground unit codes.
 *
 * Fortitude's work is underground, and a short list of codes carries most of
 * it. Those get surfaced first everywhere a code is picked, because scrolling
 * 59 codes to find BFO48 is how a crew ends up typing it from memory instead.
 *
 * The families below are matched by *prefix*, because the real sheets carry
 * variants the base code doesn't predict — BM61(2)F, BFOV(1)(1.25), BFO12I.
 * That's a deliberate distinction: prefixes decide what gets highlighted and
 * suggested, never what gets added together. Merging BFO12 and BFO12I would
 * quietly mis-bill "place cable" as "pull cable in duct".
 */

/** The codes that carry most underground production, in the order crews think of them. */
export const PRIORITY_UNDERGROUND_CODES = [
  "BFO12",
  "BFO24",
  "BFO48",
  "BFO144",
  "BMFAF",
  "BFOV",
  "BM5F1",
  "BDO",
  "BD5MPF",
  "BD4MPF",
  "BM60",
  "BM61",
] as const;

/** Uppercase, strip whitespace — "bm61(2)f " and "BM61(2)F" are the same code. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * The priority family a code belongs to, or null. Longest match wins so
 * BFO144 doesn't get filed under BFO12's shorter sibling by accident.
 */
export function priorityFamily(code: string): string | null {
  const c = normalizeCode(code);
  if (!c) return null;
  let best: string | null = null;
  for (const fam of PRIORITY_UNDERGROUND_CODES) {
    if (c.startsWith(fam) && (best === null || fam.length > best.length)) best = fam;
  }
  return best;
}

export function isPriorityCode(code: string): boolean {
  return priorityFamily(code) !== null;
}

/**
 * Sort helper: priority families first in the order listed above, variants
 * grouped under their family, everything else after in alphabetical order.
 */
export function compareByPriority(a: string, b: string): number {
  const fa = priorityFamily(a);
  const fb = priorityFamily(b);
  if (fa && !fb) return -1;
  if (!fa && fb) return 1;
  if (fa && fb && fa !== fb) {
    return (
      PRIORITY_UNDERGROUND_CODES.indexOf(fa as (typeof PRIORITY_UNDERGROUND_CODES)[number]) -
      PRIORITY_UNDERGROUND_CODES.indexOf(fb as (typeof PRIORITY_UNDERGROUND_CODES)[number])
    );
  }
  return normalizeCode(a).localeCompare(normalizeCode(b));
}

/**
 * Codes on the list that a typed code probably meant. Used to suggest
 * "did you mean BM61(2)F?" when someone types the bare family — never to
 * substitute silently.
 */
export function relatedCodes(typed: string, available: string[]): string[] {
  const t = normalizeCode(typed);
  if (!t) return [];
  return available.filter((c) => {
    const n = normalizeCode(c);
    return n !== t && (n.startsWith(t) || t.startsWith(n));
  });
}
