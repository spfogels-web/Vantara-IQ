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

/**
 * The codes that carry Fortitude's invoicing, in the order crews think of them.
 *
 * Deliberately a named list rather than "anything starting with B". A B prefix
 * is buried work, but a material list carries plenty of buried work Fortitude
 * does not do — splice closures, distribution hubs, all-inclusive pricing
 * lines. Pulling those in would inflate a job with work nobody is going to
 * build. These families are the majority of what gets billed; the handful
 * outside them are added here by name when they turn up, which is a decision
 * someone makes once rather than a rule that quietly widens.
 */
export const PRIORITY_UNDERGROUND_CODES = [
  "BFO12",
  "BFO24",
  "BFO48",
  "BFO144",
  "BMFAF",
  "BFOV",
  "BM5F1",
  "BD5MPF",
  "BD4MPF",
  "BM60",
  "BM61",
  "BM2",
  "BM26",
  "BM53",
  // Handholes and the BDO pedestal: not on every list, but ours when they are.
  "BHF",
  "BDO",
] as const;

/**
 * The codes offered on a daily sheet. Exact codes, not prefixes.
 *
 * PRIORITY_UNDERGROUND_CODES matches by family, which pulls 231 codes off the
 * Globe card — every duct size and depth variant Windstream has ever priced,
 * most of which Fortitude will never build. A crew scrolling that to find
 * BM61(2)F is a crew about to pick the wrong one, and the wrong one still
 * prices, so nothing catches it.
 *
 * This is the work we actually sell: every code billed on a daily so far, plus
 * every code a subcontractor carries a rate for. Adding one is a decision
 * someone makes on purpose — put the exact code here, spelled the way the
 * customer's card spells it, and it appears in the dropdown. Spell it wrong
 * here and it simply won't show up, which is the safe direction to fail.
 */
export const MAIN_BILLABLE_CODES = [
  // Plow / vibratory bore — the bulk of the linear footage.
  'BFOV(12.7)(2W)12"DEPTH',
  'BFOV(12.7)(2W)12"DEPTH(D)', // the 12" depth adder, billed on every foot
  'BFOV(8.5)(1W)12"DEPTH',
  "BFOV(1)(1.25)",
  // Missile / directional bore.
  "BM61(2)F",
  "BM61(2)F12IN DEPTH",
  "BM60(1)(1 1/4)P",
  "BM60(1)(1 1/4)PFF",
  "BM60(2)(1 1/4)PF",
  // Cable placement.
  "BFO12",
  "BFO24",
  "BFO48",
  "BFO144",
  // Splice and misc buried.
  "BM2F",
  "BM2AF",
  "BM26F",
  "BM53F",
  "BMFAF",
  // Restoration and hand work.
  "BD4MPF",
  "BD5MPF",
  // Handholes and pedestals.
  "BHF(6)P",
  "BHF(10)P",
  "BDO",
] as const;

const MAIN_CODE_SET = new Set(
  MAIN_BILLABLE_CODES.map((c) => c.toUpperCase().replace(/\s+/g, "")),
);

/** Is this one of the codes a crew is offered on a daily sheet? */
export function isMainBillableCode(code: string): boolean {
  return MAIN_CODE_SET.has(String(code).toUpperCase().replace(/\s+/g, ""));
}

/** Uppercase, strip whitespace — "bm61(2)f " and "BM61(2)F" are the same code. */
export function normalizeCode(code: string): string {
  return (
    code
      .trim()
      .toUpperCase()
      // An inch mark is written both ways across the paperwork the same job
      // produces: the material list says BFOV(12.7)(2W)12IN DEPTH, Exhibit A
      // says BFOV(12.7)(2W)12"DEPTH. They are one code. Without this they
      // never match, and the microduct lines — the bulk of a fibre job — price
      // at nothing and read as unpriced forever.
      .replace(/["″]/g, "IN")
      .replace(/\s+/g, "")
  );
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

/**
 * Pole-mounted units that carry a buried prefix.
 *
 * BDSFH(POLE) is a fibre distribution hub on a pole — a B code doing aerial
 * work. The paperwork says so in the code itself, so this reads it rather than
 * keeping a list of exceptions that will always be one sheet out of date.
 */
function isPoleMounted(code: string): boolean {
  return /\(POLE\)|POLE\)/.test(normalizeCode(code));
}

/**
 * Riser guards. A B code, and aerial work all the same.
 *
 * A riser guard protects cable running up a pole, so it appears on buried
 * material lists but is not buried work — Fortitude does not do it. Marking it
 * out of scope on one project was not enough: the next list brought it back,
 * priced, on a job nobody was going to build it on.
 */
function isRiserGuardCode(code: string): boolean {
  return /^BM82/.test(normalizeCode(code));
}

/**
 * Underground work, by the coding Windstream actually uses.
 *
 * B is the buried prefix across the whole sheet: BFO (buried fibre), BFOV
 * (duct), BM (pipe crossings, grounds, signs), BD (pedestals and vaults), BHF
 * (handholes), BG (grounds), BC (buried cable). The aerial families are P
 * (PM pole, PE guy, PF anchor), CO, HO and the STRAT/MAKE READY estimate lines
 * — none of which start with B.
 *
 * This used to be a hand-written list of twelve families, which is why it
 * recognised BFO12, BFO24, BFO48 and BFO144 but not BFO36 or BFO96; BD4MPF and
 * BD5MPF but not BD3MPF; and nothing at all for BFOE depth adders or BHF
 * handholes. Every one of those is ordinary underground work that then sat in
 * the review queue while the codes beside it went through, so a job's material
 * list came up short and its value with it. A list of families can only ever be
 * as current as the last sheet somebody read.
 */
/**
 * Work that appears on our lists and is not ours to build.
 *
 * Riser guards are aerial. Microfiber — the RI codes — is blown through duct
 * we place, but somebody else blows it; we are not installing it, so it is not
 * our revenue and pulling it in overstates a job by the length of the whole
 * route. Charles Hart carries $12,700 of it.
 *
 * A default, not a rule: any line can be put back in scope on the project, and
 * if the arrangement changes this list is the one thing to edit.
 */
export function isOutOfScopeCode(code: string): boolean {
  const c = normalizeCode(code);
  return isRiserGuardCode(c) || isRibbonInDuctCode(c);
}

export function isPriorityCode(code: string): boolean {
  const c = normalizeCode(code);
  if (!c) return false;
  if (isAerialCode(c) || isPoleMounted(c) || isOutOfScopeCode(c)) return false;
  // Labour, equipment and hourly lines are not material at all.
  if (isLabourOrEquipmentCode(c)) return false;
  return priorityFamily(c) !== null;
}

/**
 * Microduct sizes. 8.5 and 12.7 are the same product to a crew — both are
 * microduct, and both take microfiber (the RI codes) pulled through them.
 *
 * They live on the sheet as BFOV(8.5)(1W)12IN DEPTH and BFOV(12.7)(2W)12IN
 * DEPTH, which is why this keys on the size parameter rather than the BFOV
 * prefix: BFOV(1)(1.25) is ordinary 1.25" vacant duct, not microduct.
 */
const MICRODUCT_SIZES = ["8.5", "12.7"];

export function isMicroductCode(code: string): boolean {
  const c = normalizeCode(code);
  if (!c.startsWith("BFOV")) return false;
  return MICRODUCT_SIZES.some((size) => c.includes(`(${size})`));
}

/**
 * A label for units a crew thinks of as one thing, or null.
 *
 * This groups for *reporting* only — the underlying codes stay distinct, and
 * draw-down still matches each one exactly. 1W and 2W duct may not bill the
 * same, so rolling them into a single billable line would be a costly
 * assumption to make on someone's behalf. Showing one total while keeping the
 * codes intact gives the number without taking the risk.
 */
export function codeGroupLabel(code: string): string | null {
  if (isMicroductCode(code)) return "Microduct";
  if (isRibbonInDuctCode(code)) return "Microfiber";
  return null;
}

/** A roll-up of codes a crew thinks of as one thing. */
export interface MaterialGroupTotal {
  label: string;
  codes: number;
  unit: string;
  planned: number;
  completed: number;
  remaining: number;
}

/**
 * Structural shape only — this lives here rather than in the query layer so
 * client components can total groups without importing a server-only module.
 */
interface GroupableMaterial {
  group: string | null;
  unit: string;
  planned: number;
  completed: number;
  remaining: number;
}

export function groupMaterialTotals(materials: GroupableMaterial[]): MaterialGroupTotal[] {
  const byGroup = new Map<string, MaterialGroupTotal>();
  for (const m of materials) {
    if (!m.group) continue;
    const g = byGroup.get(m.group) ?? {
      label: m.group,
      codes: 0,
      unit: m.unit,
      planned: 0,
      completed: 0,
      remaining: 0,
    };
    g.codes += 1;
    g.planned += m.planned;
    g.completed += m.completed;
    g.remaining += m.remaining;
    byGroup.set(m.group, g);
  }
  return [...byGroup.values()];
}

/**
 * How the footage got in the ground.
 *
 * Plow and bore are different work at different rates and different day-rates
 * of production, so a single "footage today" number hides the thing a
 * superintendent actually wants to know. The BFO family is placement — cable
 * and duct plowed in along the route, microduct included. BM60 and BM61 are
 * the crossings: missile and bore under driveways and pipe.
 */
export type ProductionMethod = "plow" | "bore" | "other";

/**
 * A depth/condition adder rather than a placement in its own right.
 *
 * On Exhibit A these sit next to the code they modify at a fraction of the
 * price — BFOV(12.7)(2W)12"DEPTH is $1.35, its (D) is $0.30 — and they are
 * billed across footage that has already been counted once. They must price
 * (that is the extra $0.30 a foot) but must NOT add footage, or the same run
 * gets counted twice in the plow total and production looks better than it was.
 */
export function isAdderCode(code: string): boolean {
  const c = normalizeCode(code);
  // Trailing (D), or a bare D on a placement family: BFO12D, BFOV(1)(2)D.
  return /\(D\)$/.test(c) || /^(BFO|BM6[01]|BFCR|BFCV|BFD)[^)]*D$/.test(c);
}

/**
 * Work that runs through duct already in the ground.
 *
 * BFO12RI blows microfiber through microduct that BFOV placed; BFO12I pulls
 * cable into duct already there. Both bill by the foot and neither covers new
 * ground — on Charles Hart the RI codes total 12,700 ft against 12,735 ft of
 * microduct, because they are the same route walked twice. Counting them as
 * linear progress makes a job look nearly twice as far along as it is.
 */
export function isInDuctCode(code: string): boolean {
  const c = normalizeCode(code);
  return /^BFO/.test(c) && /(RI|I)(?![A-Z])/.test(c);
}

export function productionMethod(code: string): ProductionMethod {
  const c = normalizeCode(code);
  // An adder rides on footage already counted — pricing it again is right,
  // counting the feet again is not.
  if (isAdderCode(c)) return "other";
  // Same reasoning: a second pass down a route already opened.
  if (isInDuctCode(c)) return "other";
  if (/^BM6[01]/.test(c)) return "bore";
  if (/^BFO/.test(c)) return "plow";
  return "other";
}

/**
 * Feet of route this code covers — plow and bore only.
 *
 * The linear measure of a job. Pedestals, ground rods, warning signs and ant
 * control are all real work and all billable, but none of them advance the
 * route, so counting them toward pace would make a day spent setting peds look
 * like a day of production.
 */
export function isLinearFootageCode(code: string): boolean {
  const m = productionMethod(code);
  return m === "plow" || m === "bore";
}

/**
 * Hourly labour, trucks and equipment — the T&M side of the rate sheet.
 *
 * Exhibit A carries these alongside the unit work items (FOREMAN, LABORER,
 * BUCKET TRUCK, JETVAC, HC3-5 (B)>300<=600, 1/2 TON TRUCK W/TOOLS (A)F). They
 * are real rates, but they are not what an underground crew bills a daily
 * against, and a couple of hundred of them bury the codes that matter.
 *
 * They're excluded from the imported rate card rather than deleted from the
 * concept: if a T&M code ever turns up on a daily it will read as unpriced —
 * visible and fixable — rather than quietly billing at zero.
 */
const TM_WORDS =
  /\b(TRUCK|TRAILER|TRACTOR|BACKHOE|BUCKET|CHAINSAW|CHIPPER|JETVAC|COMPRESSOR|GENERATOR|GEN\b|PUMP|TAMP|PACKAGE|PLOW CABLE|DROP PLOW|CABLE PLOW|SPLICER|FOREMAN|LABORER|LINEMAN|OPERATOR|CREW|TON)\b/;

export function isLabourOrEquipmentCode(code: string): boolean {
  const raw = code.trim().toUpperCase();
  if (TM_WORDS.test(raw)) return true;
  // House-connect / drop families — copper and coax work, not underground.
  if (/^(HC|WHC|XXHC)\d/.test(raw.replace(/\s+/g, ""))) return true;
  return false;
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

/* ---- The microduct depth adder ------------------------------------------- */

/**
 * The code the depth adder is billed under.
 *
 * Written the way Exhibit A writes it, because that is the card the rate is
 * read from. `normalizeCode` reconciles it with the material list's
 * `12IN DEPTH` spelling.
 */
export const DEPTH_ADDER_CODE = 'BFOV(12.7)(2W)12"DEPTH(D)';

/**
 * Microduct placed at 12in depth, whichever duct went in the ground.
 *
 * The 8.5 is on the paperwork but not on the truck — it is placed as 12.7 2W
 * because the 8.5 is unavailable — so both carry the adder. Anything already
 * in duct (RI, I) is a second pass down a route already opened and carries
 * nothing.
 */
export function isDepthAdderBase(code: string): boolean {
  const c = normalizeCode(code);
  if (isAdderCode(c) || isInDuctCode(c)) return false;
  return /^BFOV\((?:12\.7|8\.5)\)/.test(c);
}

export interface AdderLine {
  code: string;
  quantity: number;
}

/**
 * How much depth adder a set of quantities earns.
 *
 * The adder rides every foot of 12.7 and converted 8.5, so the amount owed is
 * the whole of that footage. Anything already written down is subtracted
 * rather than added to: a list that states the adder in full earns nothing
 * further, and one that states part of it is topped up to the total. Billing
 * the same foot twice is the failure this guards against.
 *
 * Returns null when there is nothing to add, so a caller can tell "no adder
 * due" from "adder of zero".
 */
export function depthAdderDue(items: { code: string; quantity: number }[]): AdderLine | null {
  let base = 0;
  let already = 0;

  for (const it of items) {
    const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
    if (isDepthAdderBase(it.code)) base += qty;
    else if (isAdderCode(it.code) && /^BFOV\((?:12\.7|8\.5)\)/.test(normalizeCode(it.code))) {
      already += qty;
    }
  }

  const due = Math.round((base - already) * 100) / 100;
  if (base <= 0 || due <= 0) return null;
  return { code: DEPTH_ADDER_CODE, quantity: due };
}
