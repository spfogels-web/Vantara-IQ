import "server-only";

/**
 * Reading what a crew actually wrote on a daily.
 *
 * Its own file, and deliberately not part of the billing-holds module, because
 * both sides of the money read from here: what the customer is invoiced and
 * what the crew is paid. Those are different questions with different rate
 * cards and different rules — a documentation hold stops an invoice and must
 * never stop a payment — so the one thing they share is this, the plain reading
 * of the sheet, with no opinion about either.
 */

/** One line of a daily, as the crew wrote it. */
export type DailySpan = {
  /** The span of route — "153/@1-153/@3". Empty on older or ad-hoc entries. */
  location: string;
  code: string;
  quantity: number;
  unit: string;
};

/**
 * The daily's lines, in the order they were written.
 *
 * Order is kept on purpose. A crew writes a day down the route, and an invoice
 * that reorders those spans is an invoice somebody has to sort before they can
 * check it against the sheet in their hand.
 *
 * Codes are trimmed but not case-folded, matching what the invoice builder has
 * always done and how the rate card is keyed.
 */
export function spansOf(lineItems: unknown): DailySpan[] {
  const out: DailySpan[] = [];
  const items = Array.isArray(lineItems) ? (lineItems as unknown[]) : [];
  for (const raw of items) {
    const li = raw as { code?: unknown; quantity?: unknown; location?: unknown; unit?: unknown };
    if (typeof li?.code !== "string" || !li.code.trim()) continue;
    const quantity = typeof li.quantity === "number" ? li.quantity : 0;
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    out.push({
      location: typeof li.location === "string" ? li.location.trim() : "",
      code: li.code.trim(),
      quantity,
      unit: typeof li.unit === "string" ? li.unit : "",
    });
  }
  return out;
}

/**
 * The quantities a daily reports, rolled up by code.
 *
 * Still needed wherever the question is "how much of this code did the crew
 * report" rather than "which spans" — the readiness view, the hold actions, and
 * the arithmetic behind both. One implementation, because three copies of this
 * is three chances for the number on the invoice to differ from the number on
 * the screen, and that difference is always found by a customer.
 */
export function producedByCode(lineItems: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const span of spansOf(lineItems)) {
    out.set(span.code, (out.get(span.code) ?? 0) + span.quantity);
  }
  return out;
}

/**
 * Trim a daily's spans down to a per-code allowance, span by span.
 *
 * Holds and prior invoicing are both decided per code — a hold says "400 feet
 * of BFO12RI are held", not which 400 — so turning a code-level allowance back
 * into spans needs a rule. The rule is first span first: fill each span in the
 * order the crew wrote it until the allowance runs out.
 *
 * It is an allocation, not a fact about the ground, and it does not pretend
 * otherwise. What it guarantees is the part that matters: the spans it returns
 * add up to exactly the allowance for that code, never more, so no foot can be
 * invoiced twice by being split. A span that the allowance does not reach is
 * dropped rather than billed at zero.
 */
export function allocateSpans(
  spans: DailySpan[],
  allowanceByCode: Map<string, number>,
): DailySpan[] {
  const left = new Map(allowanceByCode);
  const out: DailySpan[] = [];

  for (const span of spans) {
    const remaining = left.get(span.code);
    if (remaining === undefined || remaining <= 0) continue;
    const take = Math.min(span.quantity, remaining);
    // Rounded to the hundredth, so repeated splitting cannot leave a trailing
    // fraction of a foot behind that never bills and never goes away.
    const quantity = Math.round(take * 100) / 100;
    if (quantity <= 0) continue;
    out.push({ ...span, quantity });
    left.set(span.code, Math.round((remaining - quantity) * 100) / 100);
  }

  return out;
}
