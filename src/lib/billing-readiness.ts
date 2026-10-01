import "server-only";

import { prisma } from "@/lib/prisma";
import { producedByCode } from "@/lib/daily-lines";
import type { BillingStatus } from "@/lib/billing-status";

/**
 * The pure rules and the status vocabulary live in billing-status.ts, which
 * is not server-only — a crew's phone renders the same words. Re-exported here
 * so every call site keeps importing one thing.
 */
export {
  needsTickMarks,
  requirementsFor,
  STATUS_LABEL,
  STATUS_MEANING,
  STATUS_ORDER,
  STATUS_SHORT,
  STATUS_TONE,
} from "@/lib/billing-status";
export type { BillingRequirement, BillingStatus } from "@/lib/billing-status";

/**
 * Reading a daily's own lines lives in daily-lines.ts, which has no opinion
 * about billing — crew pay reads the same sheet and must never pick up a
 * customer-side hold on the way past. Re-exported so existing callers keep
 * importing one thing.
 */
export { allocateSpans, producedByCode, spansOf } from "@/lib/daily-lines";
export type { DailySpan } from "@/lib/daily-lines";

/**
 * Whether a quantity of production can go on a customer invoice yet.
 *
 * Production and billing are different questions and this file is the only
 * place that keeps them apart. A crew that built a thousand feet built a
 * thousand feet; whether Fortitude can invoice for them depends on paperwork
 * the crew may not have sent. Nothing here ever alters what was reported.
 *
 * ## What is authoritative
 *
 * InvoiceLine is the record of what has been billed, and stays so. This module
 * reads it and never shadows it — a second ledger of billed quantities is
 * precisely how two systems come to disagree about whether a foot was
 * invoiced, and the disagreement is always discovered by a customer.
 *
 * So:
 *
 *   billable = produced − already on an invoice − held
 *
 * Staged and Billed are read off the invoice a line sits on. A line on a draft
 * is staged; a line on an invoice that has been sent is billed. Neither is a
 * flag somebody sets, because a flag somebody sets is a flag somebody sets
 * wrongly.
 *
 * ## Customer billing is not crew pay
 *
 * Nothing here touches SubInvoice. A hold means Fortitude cannot invoice the
 * customer yet. It says nothing about what the crew is owed, and the two must
 * never be conflated — a crew whose photographs are missing still did the
 * work.
 */

export type CodeReadiness = {
  code: string;
  /** What the crew reported. Never reduced by anything in this module. */
  produced: number;
  /** Sum of InvoiceLine quantity for this daily and code. */
  billed: number;
  /** Of `billed`, how much sits on an invoice that has actually gone out. */
  sent: number;
  /** Held back, and why. */
  held: number;
  holdId: string | null;
  holdStatus: string | null;
  requirement: string;
  missing: string[];
  overrideReason: string;
  /** What the office told the crew when it was sent back, or waived. */
  resolutionNote: string;
  /** What the crew said when they answered. */
  responseNote: string;
  raisedBy: string;
  raisedAt: string | null;
  respondedBy: string;
  respondedAt: string | null;
  resolvedBy: string;
  resolvedAt: string | null;
  /** produced − billed − held. What could go on an invoice right now. */
  billable: number;
  status: BillingStatus;
  /** The invoices this code's quantity actually landed on. */
  invoices: { number: string; status: string; quantity: number }[];
};

/** Exactly the invoice-line fields the computation below reads. */
const LINE_SELECT = {
  dailyId: true,
  code: true,
  quantity: true,
  invoice: { select: { number: true, status: true } },
} as const;

type LineRow = {
  dailyId: string;
  code: string;
  quantity: number;
  invoice: { number: string; status: string };
};

type HoldRow = {
  id: string;
  dailyId: string;
  code: string;
  quantity: number;
  status: string;
  requirement: string;
  missing: string[];
  overrideReason: string;
  resolutionNote: string;
  responseNote: string;
  raisedBy: string;
  raisedAt: Date;
  respondedBy: string;
  respondedAt: Date | null;
  resolvedBy: string;
  resolvedAt: Date | null;
};

/**
 * Where every code on one daily stands, given its production, its lines and
 * its holds.
 *
 * Pure, and the only place the status ladder is written. One daily and a
 * hundred dailies go through this same function, so the chip on a sheet and
 * the row on the billing queue cannot come to different conclusions about the
 * same foot — which is the kind of disagreement a customer finds first.
 */
function computeReadiness(
  produced: Map<string, number>,
  lines: LineRow[],
  holds: HoldRow[],
): CodeReadiness[] {
  const holdByCode = new Map(holds.map((h) => [h.code, h]));

  return [...produced.entries()].map(([code, producedQty]) => {
    const mine = lines.filter((l) => l.code === code);
    const billed = mine.reduce((n, l) => n + l.quantity, 0);
    // DRAFT is staged; anything past it has gone to the customer.
    const sent = mine
      .filter((l) => l.invoice.status !== "DRAFT")
      .reduce((n, l) => n + l.quantity, 0);

    const hold = holdByCode.get(code);
    const holdOpen =
      hold && (hold.status === "NEEDS_DOCUMENTATION" || hold.status === "CREW_RESPONDED");
    const notBillable = hold?.status === "NOT_BILLABLE";
    const held = holdOpen || notBillable ? hold!.quantity : 0;

    const billable = Math.max(0, producedQty - billed - held);

    const status: BillingStatus = notBillable
      ? "NOT_BILLABLE"
      : hold?.status === "NEEDS_DOCUMENTATION"
        ? "NEEDS_DOCUMENTATION"
        : hold?.status === "CREW_RESPONDED"
          ? "CREW_RESPONDED"
          : sent > 0
            ? "BILLED"
            : billed > 0
              ? "STAGED"
              : hold?.status === "OVERRIDDEN"
                ? "READY_OVERRIDE"
                : "READY_TO_BILL";

    return {
      code,
      produced: producedQty,
      billed,
      sent,
      held,
      holdId: hold?.id ?? null,
      holdStatus: hold?.status ?? null,
      requirement: hold?.requirement ?? "",
      missing: hold?.missing ?? [],
      overrideReason: hold?.overrideReason ?? "",
      resolutionNote: hold?.resolutionNote ?? "",
      responseNote: hold?.responseNote ?? "",
      raisedBy: hold?.raisedBy ?? "",
      raisedAt: hold?.raisedAt?.toISOString() ?? null,
      respondedBy: hold?.respondedBy ?? "",
      respondedAt: hold?.respondedAt?.toISOString() ?? null,
      resolvedBy: hold?.resolvedBy ?? "",
      resolvedAt: hold?.resolvedAt?.toISOString() ?? null,
      billable,
      status,
      invoices: mine.map((l) => ({
        number: l.invoice.number,
        status: l.invoice.status,
        quantity: l.quantity,
      })),
    };
  });
}

/**
 * Where every code on one daily stands.
 *
 * Reads the daily's own reported items, the invoice lines that already carry
 * them, and any holds. Computed rather than stored, so a status cannot drift
 * away from the invoice that produced it.
 */
export async function readinessForDaily(dailyId: string): Promise<CodeReadiness[]> {
  const daily = await prisma.daily.findUnique({
    where: { id: dailyId },
    select: { id: true, lineItems: true },
  });
  if (!daily) return [];

  const [lines, holds] = await Promise.all([
    prisma.invoiceLine.findMany({ where: { dailyId }, select: LINE_SELECT }),
    prisma.billingHold.findMany({ where: { dailyId } }),
  ]);

  return computeReadiness(producedByCode(daily.lineItems), lines, holds);
}

/**
 * The same, for a page full of dailies, in three queries rather than three per
 * row.
 *
 * The dailies list renders every daily a viewer can see. Asking per row would
 * put a hundred round trips behind one page, and the page is opened all day.
 */
export async function readinessForDailies(
  dailyIds: string[],
): Promise<Map<string, CodeReadiness[]>> {
  const out = new Map<string, CodeReadiness[]>();
  if (dailyIds.length === 0) return out;

  const [dailies, lines, holds] = await Promise.all([
    prisma.daily.findMany({
      where: { id: { in: dailyIds } },
      select: { id: true, lineItems: true },
    }),
    prisma.invoiceLine.findMany({ where: { dailyId: { in: dailyIds } }, select: LINE_SELECT }),
    prisma.billingHold.findMany({ where: { dailyId: { in: dailyIds } } }),
  ]);

  const linesByDaily = new Map<string, LineRow[]>();
  for (const l of lines) {
    const bucket = linesByDaily.get(l.dailyId);
    if (bucket) bucket.push(l);
    else linesByDaily.set(l.dailyId, [l]);
  }
  const holdsByDaily = new Map<string, HoldRow[]>();
  for (const h of holds) {
    const bucket = holdsByDaily.get(h.dailyId);
    if (bucket) bucket.push(h);
    else holdsByDaily.set(h.dailyId, [h]);
  }

  for (const d of dailies) {
    out.set(
      d.id,
      computeReadiness(
        producedByCode(d.lineItems),
        linesByDaily.get(d.id) ?? [],
        holdsByDaily.get(d.id) ?? [],
      ),
    );
  }
  return out;
}

/**
 * How much of each code on a daily may be invoiced right now.
 *
 * The invoice builder asks this instead of billing the daily's reported
 * quantities outright. With no holds anywhere the answer is what it always
 * was — produced minus what is already on an invoice — so a job with no
 * documentation requirements bills exactly as it did before this existed.
 */
export async function billableQuantities(
  dailyId: string,
  produced: Map<string, number>,
  /**
   * Treat this daily's existing invoice lines as though they were not there.
   *
   * For the one caller that is about to replace every one of them — re-splitting
   * a draft from one row per code into one row per span. Subtracting lines that
   * are being deleted in the same breath would make the replacement bill
   * nothing, which is how a draft silently empties itself.
   *
   * Holds are still subtracted. Reshaping an invoice is not a reason to bill
   * work whose documentation has not arrived.
   */
  ignoreInvoiced = false,
): Promise<Map<string, number>> {
  const [lines, holds] = await Promise.all([
    ignoreInvoiced
      ? Promise.resolve([] as { code: string; quantity: number }[])
      : prisma.invoiceLine.findMany({
          where: { dailyId },
          select: { code: true, quantity: true },
        }),
    prisma.billingHold.findMany({
      where: {
        dailyId,
        status: { in: ["NEEDS_DOCUMENTATION", "CREW_RESPONDED", "NOT_BILLABLE"] },
      },
      select: { code: true, quantity: true },
    }),
  ]);

  const billedByCode = new Map<string, number>();
  for (const l of lines) billedByCode.set(l.code, (billedByCode.get(l.code) ?? 0) + l.quantity);
  const heldByCode = new Map(holds.map((h) => [h.code, h.quantity]));

  const out = new Map<string, number>();
  for (const [code, qty] of produced) {
    const remaining = qty - (billedByCode.get(code) ?? 0) - (heldByCode.get(code) ?? 0);
    // Never negative, and never more than was reported. A rounding error or a
    // hand-edited invoice line must not be able to manufacture quantity.
    if (remaining > 0) out.set(code, Math.min(remaining, qty));
  }
  return out;
}
