/**
 * The demo, derived.
 *
 * Nothing in here is a typed-in total. A daily is quantities against the rate
 * its project's customer and market actually price; an invoice is the sum of
 * the dailies it covers; a sub invoice is the same quantities against what that
 * subcontractor is paid. Change a rate and every figure downstream moves,
 * which is the only way a demo stays honest once somebody starts adding up the
 * numbers on screen.
 *
 * Pure. It touches no database, so the whole dataset can be checked by tests
 * before a single row is written anywhere.
 */
import {
  buildRateCard,
  CUSTOMERS,
  codeOf,
  customerOf,
  rateFor,
  type CodeId,
  type CustomerKey,
  type MarketId,
  type RateRow,
} from "./catalog";
import { billingWeekEnd, hashUnit, iso, on, vary, workdaysBack, type DateString } from "./dates";
import { IN_HOUSE_CREWS, SUBS, subOf, type SubKey } from "./org";
import { PROJECTS, type ProjectSeed } from "./projects";

export type DailyLine = { code: CodeId; description: string; unit: string; quantity: number; rate: number; amount: number };

export type DemoDaily = {
  key: string;
  projectKey: string;
  workDate: DateString;
  billingWeekEnd: DateString;
  crew: string;
  subcontractor: string;
  customer: string;
  status: "Approved" | "Submitted" | "Draft";
  lines: DailyLine[];
  totalFt: number;
  billableAmount: number;
  hasAsBuilt: boolean;
  hasBoreLog: boolean;
  /** What Apex pays out for this day's work, when a subcontractor did it. */
  subCost: number | null;
};

export type DemoInvoice = {
  key: string;
  number: string;
  customer: CustomerKey;
  projectKey: string;
  periodStart: DateString;
  periodEnd: DateString;
  status: "DRAFT" | "SENT" | "PAID";
  dailyKeys: string[];
  subtotal: number;
  retainagePct: number;
  retainageHeld: number;
  amountDue: number;
  issuedDays: number | null;
  dueDays: number | null;
  paidAmount: number;
};

export type DemoSubInvoice = {
  key: string;
  number: string;
  sub: SubKey;
  projectKey: string;
  periodStart: DateString;
  periodEnd: DateString;
  status: "DRAFT" | "ISSUED" | "ACCEPTED" | "PAID";
  subtotal: number;
  retainagePct: number;
  retainageHeld: number;
  paidAmount: number;
  dailyKeys: string[];
};

export type DemoDataset = ReturnType<typeof buildApexDataset>;

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * How much of a code a crew does in a day on a given job.
 *
 * Linear-footage codes move in the hundreds or thousands; a vault or a splice
 * case is counted in ones. Getting this wrong is what makes a demo read as
 * fake — 1,400 splice cases in a day is not production, it is a typo.
 */
function dailyQuantity(code: CodeId, seed: string, pace: number): number {
  const c = codeOf(code);
  if (c.unit === "ft") return Math.max(80, Math.round(vary(seed, pace, pace * 0.35)));
  if (c.unit === "sf") return Math.max(20, Math.round(vary(seed, pace * 0.12, pace * 0.05)));
  // Counted things: a handful a day at most.
  const base = c.base > 1000 ? 1 : c.base > 300 ? 2 : 6;
  return Math.max(1, Math.round(vary(seed, base, base * 0.6)));
}

/**
 * Which codes a given day's work used — a job does not do everything daily.
 *
 * A job that lays footage lays it most days, so the linear-footage codes
 * rotate among themselves and a counted code rides along beside them. The
 * first version rotated through every code equally, which gave some days no
 * footage at all and dropped the average below the required pace on jobs that
 * were supposed to be keeping up — the dataset said "behind" while the label
 * said "healthy", and the test caught it.
 */
function codesForDay(p: ProjectSeed, dayIndex: number): CodeId[] {
  const linear = p.codes.filter((c) => codeOf(c).unit === "ft");
  const counted = p.codes.filter((c) => codeOf(c).unit !== "ft");

  const out: CodeId[] = [];
  if (linear.length) out.push(linear[dayIndex % linear.length]);
  if (counted.length) out.push(counted[dayIndex % counted.length]);
  // A job with no footage at all (civil, splicing) still needs a day's work.
  if (!out.length) out.push(p.codes[dayIndex % p.codes.length]);
  return out;
}

export function buildApexDataset(anchor: Date) {
  const rates: RateRow[] = buildRateCard();
  const dailies: DemoDaily[] = [];

  for (const p of PROJECTS) {
    if (p.historyDays === 0) continue;
    const cust = customerOf(p.customer);
    const performer = p.performedBy;
    const sub = performer.kind === "sub" ? subOf(performer.key) : null;
    const crewName =
      performer.kind === "sub" ? sub!.company : IN_HOUSE_CREWS.find((c) => c.key === performer.key)!.name;

    /**
     * A job that is behind is behind in its production history, not in a
     * column that says so. These dailies are generated at a pace below the
     * required one, so "why is it behind" is answerable from the same rows the
     * dashboard counted.
     */
    const behind = p.storylines.includes("behind-production");
    const pace = p.requiredFtPerDay > 0 ? p.requiredFtPerDay * (behind ? 0.62 : 1.04) : 300;

    const days = workdaysBack(anchor, p.historyDays, p.status === "Completed" ? -14 : -1);

    days.forEach((d, i) => {
      /**
       * The missing daily: a working day with no record at all.
       *
       * Deliberately a gap in the series rather than a row marked missing —
       * the question "what dailies are missing" has to be answerable by
       * noticing an absence, which is the hard version and the real one.
       */
      if (p.storylines.includes("missing-daily") && (i === 2 || i === 5)) return;

      const dayKey = `${p.key}-${iso(d)}`;
      const codes = codesForDay(p, i);
      const lines: DailyLine[] = [];

      for (const code of codes) {
        const rate = rateFor(rates, p.customer, p.market, code);
        // A code the customer does not price in this market cannot be billed.
        if (rate === null) continue;
        const quantity = dailyQuantity(code, `${dayKey}-${code}`, pace);
        lines.push({
          code,
          description: codeOf(code).description,
          unit: codeOf(code).unit,
          quantity,
          rate,
          amount: money(quantity * rate),
        });
      }
      if (!lines.length) return;

      const billableAmount = money(lines.reduce((s, l) => s + l.amount, 0));
      const totalFt = Math.round(lines.filter((l) => l.unit === "ft").reduce((s, l) => s + l.quantity, 0));

      /**
       * Status tells the "awaiting verification" story with real rows: the
       * most recent days on those jobs sit Submitted, everything older is
       * Approved, and only Approved work is billable.
       */
      const awaiting = p.storylines.includes("awaiting-verification") && i < 3;
      const status: DemoDaily["status"] = awaiting ? "Submitted" : "Approved";

      // Documentation state, for the "missing as-built" story.
      const missingDoc = p.storylines.includes("missing-asbuilt") && i < 4;

      const subCost = sub
        ? money(lines.reduce((s, l) => s + l.quantity * money(l.rate * sub.payFactor), 0))
        : null;

      dailies.push({
        key: dayKey,
        projectKey: p.key,
        workDate: iso(d),
        billingWeekEnd: billingWeekEnd(d),
        crew: crewName,
        subcontractor: sub ? sub.company : "",
        customer: cust.name,
        status,
        lines,
        totalFt,
        billableAmount,
        hasAsBuilt: !missingDoc && hashUnit(dayKey) > 0.15,
        hasBoreLog: codes.some((c) => codeOf(c).family === "drilling") ? !missingDoc : false,
        subCost,
      });
    });
  }

  // ---- Invoices: built from approved dailies, never typed -------------------
  const invoices: DemoInvoice[] = [];
  let invoiceNo = 4100;

  for (const p of PROJECTS) {
    const mine = dailies.filter((d) => d.projectKey === p.key && d.status === "Approved");
    if (!mine.length) continue;
    const cust = customerOf(p.customer);

    /**
     * "Ready to bill" means approved work with no invoice against it — so
     * those projects deliberately leave their most recent fortnight uninvoiced
     * rather than carrying a flag.
     */
    const readyToBill = p.storylines.includes("ready-to-bill");
    const billed = readyToBill ? mine.slice(Math.ceil(mine.length / 2)) : mine;
    if (!billed.length) continue;

    const sorted = [...billed].sort((a, b) => a.workDate.localeCompare(b.workDate));
    const subtotal = money(sorted.reduce((s, d) => s + d.billableAmount, 0));
    const retainagePct = cust.retainagePct;
    const retainageHeld = money(subtotal * retainagePct);

    const unpaid = p.storylines.includes("billed-unpaid");
    const completed = p.status === "Completed";
    const status: DemoInvoice["status"] = unpaid ? "SENT" : completed ? "PAID" : "SENT";
    const paidAmount = status === "PAID" ? money(subtotal - retainageHeld) : 0;

    invoices.push({
      key: `inv-${p.key}`,
      number: `APX-${invoiceNo++}`,
      customer: p.customer,
      projectKey: p.key,
      periodStart: sorted[0].workDate,
      periodEnd: sorted[sorted.length - 1].workDate,
      status,
      dailyKeys: sorted.map((d) => d.key),
      subtotal,
      retainagePct,
      retainageHeld,
      amountDue: money(subtotal - retainageHeld - paidAmount),
      // An overdue invoice is overdue by its dates, not by a label.
      issuedDays: unpaid ? -52 : -30,
      dueDays: unpaid ? -22 : 5,
      paidAmount,
    });
  }

  // ---- Sub invoices: the same work, at what the sub is paid ----------------
  const subInvoices: DemoSubInvoice[] = [];
  let subNo = 7100;

  for (const p of PROJECTS) {
    if (p.performedBy.kind !== "sub") continue;
    const sub = subOf(p.performedBy.key);
    const mine = dailies.filter((d) => d.projectKey === p.key && d.subCost !== null && d.status === "Approved");
    if (!mine.length) continue;

    const sorted = [...mine].sort((a, b) => a.workDate.localeCompare(b.workDate));
    const subtotal = money(sorted.reduce((s, d) => s + (d.subCost ?? 0), 0));
    const retainagePct = 0.05;
    const retainageHeld = money(subtotal * retainagePct);

    const pending = p.storylines.includes("sub-payment-pending");
    const status: DemoSubInvoice["status"] = pending ? "ACCEPTED" : p.status === "Completed" ? "PAID" : "ISSUED";
    const paidAmount = status === "PAID" ? money(subtotal - retainageHeld) : 0;

    subInvoices.push({
      key: `sinv-${p.key}`,
      number: `APXS-${subNo++}`,
      sub: p.performedBy.key,
      projectKey: p.key,
      periodStart: sorted[0].workDate,
      periodEnd: sorted[sorted.length - 1].workDate,
      status,
      subtotal,
      retainagePct,
      retainageHeld,
      paidAmount,
      dailyKeys: sorted.map((d) => d.key),
    });
  }

  return { anchor, rates, dailies, invoices, subInvoices };
}

/** Totals for the report, counted rather than promised. */
export function datasetCounts(d: DemoDataset) {
  return {
    markets: 5,
    customers: CUSTOMERS.length,
    rateRows: d.rates.length,
    projects: PROJECTS.length,
    inHouseCrews: IN_HOUSE_CREWS.length,
    subcontractors: SUBS.length,
    dailies: d.dailies.length,
    dailyLines: d.dailies.reduce((s, x) => s + x.lines.length, 0),
    invoices: d.invoices.length,
    invoiceLines: d.invoices.reduce((s, i) => s + i.dailyKeys.length, 0),
    subInvoices: d.subInvoices.length,
  };
}
