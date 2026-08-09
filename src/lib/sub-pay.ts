import "server-only";

import { prisma } from "@/lib/prisma";
import { priceQuantities } from "@/lib/pricing";
import { billingWeekFor } from "@/lib/billing";

/**
 * What Fortitude owes a crew, filed as their work is approved.
 *
 * The mirror of the customer side, and separate on purpose: that one is what we
 * bill, this is what the work costs, and the gap between them is our margin. A
 * crew reaches this record; they must never reach the other, and one table
 * holding both would put them a single query apart.
 *
 * Priced at the crew's own signed card, at the rate in force on the work date —
 * so a card renegotiated in March cannot restate what they earned in January.
 */

/** Total a draft from its own lines. */
export async function recalcSubInvoice(invoiceId: string): Promise<void> {
  const inv = await prisma.subInvoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, lines: { select: { amount: true } } },
  });
  if (!inv || inv.status !== "DRAFT") return;

  await prisma.subInvoice.update({
    where: { id: invoiceId },
    data: {
      subtotal: Math.round(inv.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
    },
  });
}

export interface SubFileResult {
  ok: boolean;
  reason?: string;
  invoiceNumber?: string;
  lines?: number;
  amount?: number;
  /** Codes the crew has no rate for — work they did that cannot be paid yet. */
  unpriced?: string[];
}

/**
 * Put one approved daily onto the filing crew's pay statement.
 *
 * The crew is the company named on the daily, not whoever is assigned to the
 * project: two crews on one job file separately and each is paid on their own
 * card, so the name on the sheet is what decides.
 */
export async function fileApprovedDailyForSub(dailyId: string): Promise<SubFileResult> {
  const daily = await prisma.daily.findUnique({
    where: { id: dailyId },
    select: {
      id: true, status: true, projectId: true, projectName: true,
      workDate: true, lineItems: true, subcontractor: true, billingWeekEnd: true,
    },
  });
  if (!daily) return { ok: false, reason: "Daily not found." };
  if (daily.status !== "Approved") return { ok: false, reason: "Only approved work is paid." };

  const company = daily.subcontractor?.trim();
  if (!company) return { ok: false, reason: "No company on this daily, so nobody to pay." };

  const already = await prisma.subInvoiceLine.findFirst({
    where: { dailyId: daily.id },
    select: { invoice: { select: { number: true } } },
  });
  if (already) return { ok: false, reason: `Already on ${already.invoice.number}.` };

  const week = billingWeekFor(daily);
  if (!week) return { ok: false, reason: "No work date, so no pay period." };

  const crew = await prisma.subcontractor.findFirst({
    where: { company },
    select: {
      id: true, company: true, boreMethod: true,
      rates: {
        select: {
          code: true, description: true, unit: true,
          rate: true, effectiveDate: true, expirationDate: true, source: true,
          method: true,
        },
      },
    },
  });
  if (!crew) return { ok: false, reason: `No crew on file called "${company}".` };
  if (crew.rates.length === 0) {
    return { ok: false, reason: `No signed rate card for ${company}, so their work cannot be priced.` };
  }

  // Roll the daily's own items up by code first.
  const byCode = new Map<string, number>();
  const items = Array.isArray(daily.lineItems) ? (daily.lineItems as unknown[]) : [];
  for (const raw of items) {
    const li = raw as { code?: unknown; quantity?: unknown };
    if (typeof li?.code !== "string" || !li.code.trim()) continue;
    const qty = typeof li.quantity === "number" ? li.quantity : 0;
    byCode.set(li.code.trim(), (byCode.get(li.code.trim()) ?? 0) + qty);
  }

  // Their bore method decides which of two same-coded rates applies. Asked once
  // on the crew rather than guessed per invoice, because the card cannot know
  // which machine turned up.
  const priced = priceQuantities(
    [...byCode.entries()].map(([code, quantity]) => ({ code, quantity })),
    crew.rates,
    daily.workDate,
    crew.boreMethod,
  );
  const unpriced = priced.unpriced.map((u) => u.code);

  if (priced.lines.length === 0) {
    return {
      ok: false,
      reason: unpriced.length
        ? `Nothing priced — ${company} has no rate for ${unpriced.join(", ")}.`
        : "Nothing payable on this daily.",
      unpriced,
    };
  }

  let invoice = await prisma.subInvoice.findFirst({
    where: {
      subcontractorId: crew.id,
      projectId: daily.projectId,
      periodStart: week.start,
      status: "DRAFT",
    },
    select: { id: true, number: true },
  });

  if (!invoice) {
    // A short, readable reference the crew can quote back on the phone.
    const initials = crew.company
      .replace(/[^A-Za-z ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "SC";
    const stamp = week.end.replace(/-/g, "");

    for (let n = 1; n <= 50 && !invoice; n++) {
      try {
        invoice = await prisma.subInvoice.create({
          data: {
            number: `PAY-${initials}-${stamp}-${String(n).padStart(2, "0")}`,
            subcontractorId: crew.id,
            projectId: daily.projectId,
            projectName: daily.projectName,
            periodStart: week.start,
            periodEnd: week.end,
            status: "DRAFT",
          },
          select: { id: true, number: true },
        });
      } catch {
        // Number taken by another job's statement for the same week.
      }
    }
    if (!invoice) return { ok: false, reason: "Could not open a pay statement for that week." };
  }

  await prisma.subInvoiceLine.createMany({
    data: priced.lines.map((l) => ({
      invoiceId: invoice.id,
      dailyId: daily.id,
      workDate: daily.workDate,
      code: l.code,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      rate: l.rate,
      amount: Math.round(l.amount * 100) / 100,
      sourceCard: l.source,
    })),
  });

  await recalcSubInvoice(invoice.id);

  return {
    ok: true,
    invoiceNumber: invoice.number,
    lines: priced.lines.length,
    amount: Math.round(priced.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
    unpriced,
  };
}

export interface SubUnfileResult {
  ok: boolean;
  removedFrom?: string;
  /** Set when the work sits on a statement the crew has already been sent. */
  blockedBy?: string;
}

/**
 * Take a daily off a crew's draft statement when it stops being approved.
 *
 * Only from a draft. Once a statement has been issued the crew has seen the
 * figure and may have accepted it — editing it out from under them is how a
 * crew stops trusting the numbers, which costs far more than the line.
 */
export async function unfileDailyForSub(dailyId: string): Promise<SubUnfileResult> {
  const lines = await prisma.subInvoiceLine.findMany({
    where: { dailyId },
    select: { invoice: { select: { id: true, number: true, status: true } } },
  });
  if (lines.length === 0) return { ok: true };

  const issued = lines.find((l) => l.invoice.status !== "DRAFT");
  if (issued) return { ok: false, blockedBy: issued.invoice.number };

  const invoiceId = lines[0].invoice.id;
  const number = lines[0].invoice.number;
  await prisma.subInvoiceLine.deleteMany({ where: { dailyId } });
  await recalcSubInvoice(invoiceId);

  const left = await prisma.subInvoiceLine.count({ where: { invoiceId } });
  if (left === 0) await prisma.subInvoice.delete({ where: { id: invoiceId } });

  return { ok: true, removedFrom: number };
}
