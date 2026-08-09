import { normalizeCode } from "@/lib/unit-codes";

/**
 * Pricing quantities against a rate card.
 *
 * One engine, used three times: a project's material list priced for what the
 * job is worth before it starts, a daily priced into an invoice, and the same
 * daily priced against a sub's card into a pay application. Quantities always
 * come from one place and get multiplied twice — that is what stops billing
 * Globe for 2,400 ft while paying the sub for 2,420.
 *
 * Two rules this must never break:
 *
 *   1. Codes match EXACTLY. BFO12 and BFO12I are different work at different
 *      money — placing cable versus pulling it through duct. The grouping in
 *      unit-codes.ts (microduct, microfiber) exists for reporting and must
 *      never reach arithmetic that produces a dollar figure.
 *
 *   2. A code with no rate is reported, never priced at zero. Silently
 *      dropping it produces a total that looks right and under-bills, and
 *      nothing downstream can tell the difference between "worth nothing" and
 *      "we never loaded the rate".
 */

export interface RateRow {
  code: string;
  description?: string;
  unit?: string;
  rate: number;
  effectiveDate?: string;
  expirationDate?: string;
  /** Which card this rate came from, carried through onto the priced line. */
  source?: string;
}

export interface QuantityRow {
  code: string;
  quantity: number;
  description?: string;
  unit?: string;
}

export interface PricedLine {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  /** The card the matched rate came from, so a figure can be traced back. */
  source: string;
}

export interface UnpricedLine {
  code: string;
  description: string;
  quantity: number;
}

export interface PricingResult {
  lines: PricedLine[];
  unpriced: UnpricedLine[];
  total: number;
  /** How much of the work, by code count, we could actually put a price on. */
  pricedCodes: number;
  totalCodes: number;
  /** True when every code carried a rate — the only case a total is complete. */
  complete: boolean;
}

/** Parseable date, or null. Rate cards carry free-text dates from a PDF. */
function asTime(value?: string): number | null {
  if (!value?.trim()) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/**
 * The rate in force for a code on a given date.
 *
 * Work is billed at the rate that applied when it was performed, not the rate
 * in force today — otherwise a mid-job rate change silently reprices work
 * already invoiced. With no date supplied (a forecast, where the work hasn't
 * happened yet) the most recently effective rate wins.
 */
export function findRate(
  code: string,
  rates: RateRow[],
  onDate?: string,
): RateRow | null {
  const wanted = normalizeCode(code);
  if (!wanted) return null;

  const candidates = rates.filter((r) => normalizeCode(r.code) === wanted);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const at = asTime(onDate);
  const inForce = candidates.filter((r) => {
    const from = asTime(r.effectiveDate);
    const until = asTime(r.expirationDate);
    if (at === null) return until === null || until >= Date.now();
    if (from !== null && at < from) return false;
    if (until !== null && at > until) return false;
    return true;
  });

  const pool = inForce.length > 0 ? inForce : candidates;
  // Latest effective date wins among equally valid rows.
  return pool.reduce((best, r) =>
    (asTime(r.effectiveDate) ?? 0) > (asTime(best.effectiveDate) ?? 0) ? r : best,
  );
}

export function priceQuantities(
  quantities: QuantityRow[],
  rates: RateRow[],
  onDate?: string,
): PricingResult {
  const lines: PricedLine[] = [];
  const unpriced: UnpricedLine[] = [];

  for (const q of quantities) {
    const code = normalizeCode(q.code);
    if (!code || !Number.isFinite(q.quantity) || q.quantity === 0) continue;

    const match = findRate(code, rates, onDate);
    if (!match || !Number.isFinite(match.rate)) {
      unpriced.push({
        code,
        description: q.description ?? "",
        quantity: q.quantity,
      });
      continue;
    }

    lines.push({
      code,
      description: match.description || q.description || "",
      unit: match.unit || q.unit || "",
      quantity: q.quantity,
      rate: match.rate,
      amount: q.quantity * match.rate,
      source: match.source ?? "",
    });
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);
  return {
    lines,
    unpriced,
    total,
    pricedCodes: lines.length,
    totalCodes: lines.length + unpriced.length,
    complete: unpriced.length === 0 && lines.length > 0,
  };
}

/**
 * What a job is worth: revenue at the customer's rates, cost at the sub's, and
 * the difference. "Gross" here is deliberate — it is before overhead, fuel,
 * restoration, damages and everything else that comes off later.
 */
export interface Valuation {
  revenue: PricingResult;
  subCost: PricingResult | null;
  subName: string | null;
  grossMargin: number | null;
  grossMarginPct: number | null;
}

export function valueProject(
  quantities: QuantityRow[],
  customerRates: RateRow[],
  subRates: RateRow[] | null,
  subName: string | null,
): Valuation {
  const revenue = priceQuantities(quantities, customerRates);
  const subCost = subRates ? priceQuantities(quantities, subRates) : null;

  const grossMargin = subCost ? revenue.total - subCost.total : null;
  const grossMarginPct =
    grossMargin !== null && revenue.total > 0 ? grossMargin / revenue.total : null;

  return { revenue, subCost, subName, grossMargin, grossMarginPct };
}
