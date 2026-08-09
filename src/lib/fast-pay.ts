/**
 * Fast pay — a crew trading a slice of the statement for getting paid sooner.
 *
 * Standard settlement is NET 30. A crew may elect fast pay instead: NET 10,
 * with a fee taken off what they receive. The fee percentage is frozen onto the
 * statement at the moment it is elected, exactly like a rate is frozen onto an
 * invoice line — changing the house rate next quarter must not restate what
 * somebody already agreed to.
 *
 * Fast pay settles by wire only, and that is not a preference the crew sets.
 * Wire is what actually clears inside ten days; offering ACH beside it would be
 * offering a promise the rail cannot keep.
 */

/** House terms when nothing is elected. */
export const STANDARD_TERMS_DAYS = 30;

/** What fast pay costs and buys, as it stands today. */
export const FAST_PAY_FEE_PCT = 4;
export const FAST_PAY_DAYS = 10;

/** How fast pay is settled. Not a choice — see the note above. */
export const FAST_PAY_METHOD = "WIRE" as const;

export interface FastPayQuote {
  /** What the work came to, before anything is taken off. */
  gross: number;
  /** The fee, rounded to whole cents. */
  fee: number;
  /** What actually lands in their account. Always exactly gross - fee. */
  net: number;
  feePct: number;
  days: number;
}

/** Money is compared and stored in cents here so a fee never lands on a half-penny. */
const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

/**
 * What a crew gives up and what they get, for a given statement total.
 *
 * The fee is rounded to the cent and the net is derived by subtraction rather
 * than by a second percentage, so `fee + net` is always exactly `gross`. Two
 * independently rounded figures that don't add up is how a statement ends up
 * disputed over a penny.
 */
export function fastPayQuote(
  subtotal: number,
  feePct: number = FAST_PAY_FEE_PCT,
  days: number = FAST_PAY_DAYS,
): FastPayQuote {
  const grossCents = Math.max(0, toCents(subtotal));
  const feeCents = Math.round((grossCents * feePct) / 100);
  return {
    gross: fromCents(grossCents),
    fee: fromCents(feeCents),
    net: fromCents(grossCents - feeCents),
    feePct,
    days,
  };
}

/**
 * What a crew is actually owed on a statement, whichever way they took it.
 *
 * One function so the office view, the crew view and anything that totals a
 * batch all read the same number off the same rules.
 */
export function amountPayable(inv: {
  subtotal: number;
  fastPay: boolean;
  fastPayFeePct: number;
}): FastPayQuote {
  if (!inv.fastPay) {
    const gross = fromCents(Math.max(0, toCents(inv.subtotal)));
    return { gross, fee: 0, net: gross, feePct: 0, days: STANDARD_TERMS_DAYS };
  }
  return fastPayQuote(inv.subtotal, inv.fastPayFeePct);
}

/**
 * When a statement falls due.
 *
 * Counted from the Friday that closed the billing week, not from the day the
 * work was done and not from the day the statement happened to be sent. A week
 * of work is one debt with one due date; if terms ran from each work date,
 * Monday's footage and Friday's footage on the same statement would fall due on
 * different days, and if they ran from the send date the office could move a
 * crew's money simply by sitting on the paperwork.
 *
 * `cutoff` is the statement's period end, which is always a Friday. Days are
 * calendar days — terms have never been counted in working days.
 */
export function dueDateFromCutoff(cutoff: string | null, days: number): string {
  if (!cutoff) return "";
  const d = new Date(`${cutoff}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const due = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
  return due.toISOString().slice(0, 10);
}

/**
 * Whether fast pay can still be elected.
 *
 * A statement that is already paid or void is settled, and one that is still a
 * draft has not been issued for anybody to agree to. Everything in between is
 * fair game — a crew that accepted on standard terms and then needs the money
 * sooner is a normal thing to happen, not an error.
 */
export function canElectFastPay(status: string, alreadyElected: boolean): boolean {
  if (alreadyElected) return false;
  return status === "ISSUED" || status === "DISPUTED" || status === "ACCEPTED";
}

/** One line the crew reads before committing. */
export function fastPaySummary(q: FastPayQuote): string {
  return `Paid within ${q.days} days by wire, less a ${q.feePct}% fee.`;
}
