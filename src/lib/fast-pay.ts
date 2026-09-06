/**
 * Fast pay — a crew trading a slice of the statement for getting paid sooner.
 *
 * Standard settlement is NET 21 and nothing comes off it. A crew may elect
 * fast pay instead: NET 10, with a fee taken off what they receive. The fee
 * percentage is frozen onto the statement at the moment it is elected, exactly
 * like a rate is frozen onto an invoice line — changing the house rate next
 * quarter must not restate what somebody already agreed to.
 *
 * Fast pay settles by wire only, and that is not a preference the crew sets.
 * Wire is what actually clears inside ten days; offering ACH beside it would be
 * offering a promise the rail cannot keep.
 */

/** House terms when nothing is elected. Net 21, no fee. */
export const STANDARD_TERMS_DAYS = 21;

/**
 * What fast pay costs and buys, as it stands today.
 *
 * A statement already elected keeps the percentage it was elected at — see
 * SubInvoice.fastPayFeePct — so moving this number changes what is offered
 * from here on and restates nothing behind it.
 */
export const FAST_PAY_FEE_PCT = 3.5;
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
  retainagePct?: number | null;
  retainageHeld?: number | null;
  fastPay: boolean;
  fastPayFeePct: number;
  termsDays?: number;
}): FastPayQuote {
  // Kept as a thin wrapper rather than deleted: every reader already goes
  // through it, and the shape it returns is the one they expect. What changed
  // is underneath — retainage comes off before any fee is worked out.
  const m = statementMoney({
    subtotal: inv.subtotal,
    retainagePct: inv.retainagePct,
    retainageHeld: inv.retainageHeld,
    fastPay: inv.fastPay,
    fastPayFeePct: inv.fastPayFeePct,
    termsDays: inv.termsDays ?? (inv.fastPay ? FAST_PAY_DAYS : STANDARD_TERMS_DAYS),
  });
  return { gross: m.gross, fee: m.fee, net: m.net, feePct: m.feePct, days: m.days };
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


/** Every figure on a pay statement, in the order they come off it. */
export interface StatementMoney {
  /** What the work came to, at the crew's own signed rates. */
  gross: number;
  retainagePct: number;
  /** Held back on this statement. Released when the job's retainage is. */
  retainage: number;
  /** Gross less retainage — what is actually payable this week. */
  payable: number;
  /** The fast-pay fee, or zero on standard terms. */
  fee: number;
  feePct: number;
  /** What lands in their account. */
  net: number;
  days: number;
}

/**
 * What a crew is actually paid, and in what order it comes off.
 *
 * The order is the whole point and it was wrong: the fast-pay fee used to be
 * taken on the gross, before retainage. Retainage is money not being paid this
 * week at all, so charging a fee to receive it early charges for something
 * that is not being received — on a $2,659.60 statement at 10% held back that
 * is a fee on $2,659.60 when only $2,393.64 is going out.
 *
 * Retainage first, then the fee on what is left.
 */
export function statementMoney(inv: {
  subtotal: number;
  retainagePct?: number | null;
  retainageHeld?: number | null;
  fastPay: boolean;
  fastPayFeePct: number;
  termsDays: number;
}): StatementMoney {
  const gross = Math.round(Math.max(0, inv.subtotal) * 100) / 100;
  const pct = inv.retainagePct ?? 0;
  // The stored figure when there is one, so a statement a crew accepted cannot
  // be restated by a rate change on the job.
  const retainage =
    inv.retainageHeld != null && inv.retainageHeld > 0
      ? Math.round(inv.retainageHeld * 100) / 100
      : Math.round(gross * pct * 100) / 100;
  const payable = Math.round((gross - retainage) * 100) / 100;

  if (!inv.fastPay) {
    return {
      gross,
      retainagePct: pct,
      retainage,
      payable,
      fee: 0,
      feePct: 0,
      net: payable,
      days: inv.termsDays || STANDARD_TERMS_DAYS,
    };
  }

  const q = fastPayQuote(payable, inv.fastPayFeePct, inv.termsDays || FAST_PAY_DAYS);
  return {
    gross,
    retainagePct: pct,
    retainage,
    payable,
    fee: q.fee,
    feePct: inv.fastPayFeePct,
    net: q.net,
    days: q.days,
  };
}
