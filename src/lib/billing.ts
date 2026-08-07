/**
 * Turning approved production into a bill.
 *
 * Two rules the rest of the app leans on:
 *
 *   1. Only *approved* dailies bill. A daily that is submitted, in review,
 *      flagged or denied is production that nobody has stood behind yet, and
 *      invoicing it is how a contractor ends up crediting work back.
 *
 *   2. A daily bills once. The line carries the daily it came from, so a
 *      second run over the same week finds it already invoiced and skips it
 *      rather than doubling the customer.
 */

/** Sunday-based week key for a YYYY-MM-DD work date, as [start, end]. */
export function weekOf(workDate: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workDate.trim());
  if (!m) return null;

  // Built in UTC on purpose. A local-time Date on a YYYY-MM-DD string shifts
  // backwards in any timezone west of UTC, which would file Monday's work into
  // the previous week and split a cutoff across two invoices.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;

  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - d.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/** Add days to a YYYY-MM-DD date, staying in UTC. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Read a due date off a payment-terms string: "Net 30", "net15", "Net 45".
 *
 * Returns null for anything else — "Due on receipt", a blank, a term someone
 * typed in prose. A due date is what makes an invoice past due, so guessing 30
 * when the contract says something different would manufacture a collections
 * problem that isn't real.
 */
export function daysFromTerms(terms: string): number | null {
  const m = /net\s*(\d{1,3})/i.exec(terms ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Retainage on a subtotal, to the cent.
 *
 * Rounded here rather than left to float drift, because this figure is
 * subtracted from what the customer owes and has to reconcile against their
 * remittance exactly.
 */
export function retainageOn(subtotal: number, pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round(subtotal * pct * 100) / 100;
}

export interface InvoiceMoney {
  subtotal: number;
  retainageHeld: number;
  amountDue: number;
}

export function invoiceMoney(subtotal: number, retainagePct: number): InvoiceMoney {
  const rounded = Math.round(subtotal * 100) / 100;
  const retainageHeld = retainageOn(rounded, retainagePct);
  return {
    subtotal: rounded,
    retainageHeld,
    amountDue: Math.round((rounded - retainageHeld) * 100) / 100,
  };
}

/**
 * What is still owed on an invoice, and whether that makes it paid.
 *
 * Partial payment is the norm on this work, so "paid" is decided by whether
 * the money covers the bill — never by the invoice being old, and never by a
 * single payment arriving. The half-cent tolerance absorbs rounding on the
 * customer's side rather than leaving a $0.004 balance that never closes.
 */
export function balanceOf(amountDue: number, payments: { amount: number }[]) {
  const paid = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const balance = Math.round((amountDue - paid) * 100) / 100;
  return { paid, balance, settled: balance <= 0.005 };
}

/** True when an unpaid invoice's due date has passed. */
export function isPastDue(dueAt: Date | null, balance: number, today = new Date()): boolean {
  if (!dueAt || balance <= 0.005) return false;
  return dueAt.getTime() < today.getTime();
}
