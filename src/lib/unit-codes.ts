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

/**
 * RI = microfiber (BFO12RI, BFO24RI). Underground work that belongs with the
 * rest.
 *
 * Note the descriptions printed against these on the Uniti sheets say "PLACE
 * MICRO RIBBON FIBER IN DUCT", which is wrong for the unit — a reminder that
 * the *code* is authoritative and the description is just a label. Never
 * classify off description text.
 *
 * Matched as a *suffix*, not a substring: FRIBBONIZE ("RIBBONIZE LOOSE FIBERS")
 * contains RI and is not an RI code. The lookahead allows a trailing variant
 * like BFO12RI(2) while still rejecting RI followed by more letters.
 */
export function isRibbonInDuctCode(code: string): boolean {
  return /RI(?![A-Z])/.test(normalizeCode(code));
}

/**
 * Every BM unit is underground — pipe crossings, pedestal grounds, warning
 * signs, riser guards. The named families above are the high-traffic ones, but
 * BM26F and BM82PF belong in the same bucket.
 */
export function isBuriedMiscCode(code: string): boolean {
  return /^BM/.test(normalizeCode(code));
}

/**
 * CO units are aerial placement — "PLACE AERIAL FLAT RIBBON FIBER", "AERIAL
 * FILLED FO ASSEMBLY". On an underground job they're noise in every picker.
 * They are hidden, never dropped: a sheet that carries them can still bill
 * them, and silently discarding a billable unit is worse than a longer list.
 */
export function isAerialCode(code: string): boolean {
  return /^CO/.test(normalizeCode(code));
}

export function isPriorityCode(code: string): boolean {
  return priorityFamily(code) !== null || isBuriedMiscCode(code) || isRibbonInDuctCode(code);
}

export type CodeClass = "underground" | "aerial" | "other";

export function codeClass(code: string): CodeClass {
  if (isAerialCode(code)) return "aerial";
  if (isPriorityCode(code)) return "underground";
  return "other";
}

/**
 * Sort helper: priority families first in the order listed above, variants
 * grouped under their family, everything else after in alphabetical order.
 */
export function compareByPriority(a: string, b: string): number {
  // Aerial sinks below everything — on an underground job it's the last thing
  // anyone is looking for.
  const aerialA = isAerialCode(a);
  const aerialB = isAerialCode(b);
  if (aerialA !== aerialB) return aerialA ? 1 : -1;

  // Then the rest of the underground set (all BM*, all *RI) above unclassified.
  const undA = isPriorityCode(a);
  const undB = isPriorityCode(b);
  if (undA !== undB) return undA ? -1 : 1;

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
