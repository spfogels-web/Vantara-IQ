import "server-only";
import { billableQuantities } from "@/lib/billing-readiness";
import { allocateSpans, producedByCode, spansOf, type DailySpan } from "@/lib/daily-lines";

import { prisma } from "@/lib/prisma";
import { priceQuantities } from "@/lib/pricing";
import { addDays, billingWeekFor, daysFromTerms, invoiceMoney } from "@/lib/billing";

/**
 * Filing approved production onto invoices, as it is approved.
 *
 * Approval is the moment the work becomes billable, so it is the moment the
 * line should appear on a bill. Waiting for someone to remember to press
 * "generate" is how a week's production sits unbilled and nobody notices until
 * the cash is short.
 *
 * Everything here is idempotent and reversible in one direction only:
 *
 *   - A daily files once. Its id is on the line it produced, so approving,
 *     reopening and approving again does not bill the customer twice.
 *   - It can be pulled back off a DRAFT, because a draft is ours.
 *   - It can never be pulled off a SENT invoice. The customer has that figure.
 *     Taking it back silently would make our copy disagree with theirs, which
 *     is the one thing a billing record must never do — that needs a credit.
 */

/** Re-add a draft invoice's own lines. Called after anything changes them. */
export async function recalcInvoice(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { retainagePct: true, status: true, lines: { select: { amount: true } } },
  });
  if (!invoice) return;
  // Only a draft is recomputed. Anything sent is frozen at its issued figures.
  if (invoice.status !== "DRAFT") return;

  const money = invoiceMoney(
    invoice.lines.reduce((s, l) => s + l.amount, 0),
    invoice.retainagePct,
  );
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotal: money.subtotal,
      retainageHeld: money.retainageHeld,
      amountDue: money.amountDue,
    },
  });
}

/**
 * A daily's lines on a DRAFT that are the old shape, or null when there are
 * none to replace.
 *
 * Finds them; removing them is the caller's job, and only once the replacement
 * has actually priced. Invoices written before this change carry one line per
 * code for the whole day, and leaving them that way would mean two shapes of
 * invoice in the same drawer — with the one the office is looking at today
 * being the old one.
 *
 * Three conditions, all of them refusals:
 *
 *   - Nothing unless the daily actually has spans to split by. A sheet written
 *     without locations has nothing better to become.
 *   - Nothing if any of the lines sits on an invoice that has been sent. The
 *     customer has that figure; reshaping it would make our copy disagree with
 *     theirs, which is the one thing a billing record must never do. That
 *     invoice keeps its rolled-up lines for good, and that is correct.
 *   - Nothing if the lines already carry spans.
 *
 * What is replaced is rebuilt from the same daily, at the same rates, for the
 * same work date, so the invoice total does not move. A test holds that,
 * because "it only changes the shape" is exactly the kind of claim that is
 * true until it isn't.
 */
async function staleDraftLines(
  dailyId: string,
  spans: DailySpan[],
): Promise<{ ids: string[]; invoiceIds: string[] } | null> {
  if (!spans.some((s) => s.location)) return null;

  const lines = await prisma.invoiceLine.findMany({
    where: { dailyId },
    select: { id: true, location: true, invoice: { select: { id: true, status: true } } },
  });
  if (lines.length === 0) return null;
  if (lines.some((l) => l.invoice.status !== "DRAFT")) return null;
  if (lines.every((l) => l.location)) return null;

  return {
    ids: lines.map((l) => l.id),
    invoiceIds: [...new Set(lines.map((l) => l.invoice.id))],
  };
}

export interface FileResult {
  ok: boolean;
  /** Why nothing happened, when nothing happened. */
  reason?: string;
  invoiceNumber?: string;
  lines?: number;
  amount?: number;
  /** Codes on the daily with no rate on the customer's card. */
  unpriced?: string[];
}

/**
 * Put one approved daily onto its project's open draft invoice.
 *
 * The invoice is found by project and by the week the work fell in — that is
 * what "based on the project number" means in practice, because a job's
 * billing is per job and the customer's cutoff is weekly. If no draft exists
 * for that job and week, one is opened.
 */
export async function fileApprovedDaily(dailyId: string): Promise<FileResult> {
  const daily = await prisma.daily.findUnique({
    where: { id: dailyId },
    select: {
      id: true, status: true, projectId: true, projectName: true,
      workDate: true, lineItems: true, billingWeekEnd: true,
    },
  });
  if (!daily) return { ok: false, reason: "Daily not found." };
  if (daily.status !== "Approved") return { ok: false, reason: "Only approved work is billed." };
  if (!daily.projectId) return { ok: false, reason: "This daily isn't attached to a project." };

  /**
   * What is left to bill on this daily, rather than whether it has been
   * touched at all.
   *
   * This was "any invoice line for this daily means skip it", which was right
   * while a daily billed once and entirely. It stops being right the moment a
   * quantity can be held back for missing documentation: six hundred of a
   * thousand feet would bill, and the four hundred released a week later
   * would find the daily already filed and never bill at all.
   *
   * So the question is arithmetic now — produced, minus what is already on an
   * invoice, minus what is held. With no holds on a daily the two rules give
   * the same answer: the first filing bills everything, and the second finds
   * nothing left. Behaviour on a job with no documentation requirements is
   * therefore unchanged, which is the point.
   *
   * InvoiceLine is still the only record of what has been billed. Nothing
   * here writes a second one.
   */
  const spans = spansOf(daily.lineItems);

  /**
   * Lines to be replaced, found but not yet removed.
   *
   * Nothing is deleted until the replacement has priced. Deleting first and
   * pricing after would empty a draft for good if the rate card had moved on
   * since it was built — the lines would be gone and nothing would go back.
   */
  const stale = await staleDraftLines(daily.id, spans);

  const already = await prisma.invoiceLine.findFirst({
    where: { dailyId: daily.id },
    select: { invoice: { select: { number: true } } },
  });

  const week = billingWeekFor(daily);
  if (!week) return { ok: false, reason: "No work date, so no billing period." };

  const project = await prisma.project.findUnique({
    where: { id: daily.projectId },
    select: { id: true, number: true, name: true, client: true, customerId: true },
  });
  if (!project) return { ok: false, reason: "Project not found." };

  const customerId =
    project.customerId ??
    (await prisma.customer.findFirst({ where: { name: project.client }, select: { id: true } }))?.id;
  if (!customerId) return { ok: false, reason: "No customer on this project, so nothing to bill to." };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true, shortCode: true, retainagePct: true, paymentTerms: true,
      rates: {
        select: {
          code: true, description: true, unit: true,
          rate: true, effectiveDate: true, expirationDate: true,
        },
      },
    },
  });
  if (!customer || customer.rates.length === 0) {
    return { ok: false, reason: "No rate card on the customer, so nothing can be priced." };
  }

  /**
   * One invoice line per line of the daily, in the order the crew wrote them.
   *
   * This used to roll the day up by code, which gave a correct total and an
   * unreadable bill: six spans of BFO48 arrived as "BFO48 4,519", and checking
   * that against the daily meant adding six numbers up by hand. Nobody did.
   *
   * The money is identical either way — same codes, same rates, same work date.
   * Only the shape changes. `spans` was read above, before the re-split.
   */
  const byCode = producedByCode(daily.lineItems);

  // Held quantities come out here, before pricing. A foot that cannot be billed
  // should never acquire a rate, an amount or a line. The allowance is per code
  // because that is what a hold is; allocateSpans turns it back into spans.
  const billable = await billableQuantities(daily.id, byCode, stale !== null);
  if (billable.size === 0) {
    return {
      ok: false,
      reason: already && stale === null
        ? `Already on ${already.invoice.number}.`
        : "Every quantity on this daily is held for documentation.",
    };
  }

  // Priced at the card in force on the work date, not today's card.
  const priced = priceQuantities(
    allocateSpans(spans, billable),
    customer.rates,
    daily.workDate,
  );
  const unpriced = priced.unpriced.map((u) => u.code);

  if (priced.lines.length === 0) {
    return {
      ok: false,
      reason: unpriced.length
        ? `Nothing priced — no rate for ${unpriced.join(", ")}.`
        : "Nothing billable on this daily.",
      unpriced,
    };
  }

  // The open draft for this job and week, or a new one.
  let invoice = await prisma.invoice.findFirst({
    where: {
      customerId: customer.id,
      projectId: project.id,
      periodStart: week.start,
      status: "DRAFT",
    },
    select: { id: true, number: true },
  });

  if (!invoice) {
    const terms = daysFromTerms(customer.paymentTerms);
    const stamp = week.end.replace(/-/g, "");
    for (let n = 1; n <= 50 && !invoice; n++) {
      try {
        invoice = await prisma.invoice.create({
          data: {
            number: `${customer.shortCode}-${stamp}-${String(n).padStart(2, "0")}`,
            customerId: customer.id,
            projectId: project.id,
            projectName: project.name,
            // The customer pays against their own job number, so it rides on
            // the invoice rather than being looked up from the project later.
            projectNumber: project.number,
            periodStart: week.start,
            periodEnd: week.end,
            status: "DRAFT",
            retainagePct: customer.retainagePct,
            dueAt: terms !== null ? new Date(`${addDays(week.end, terms)}T00:00:00Z`) : null,
          },
          select: { id: true, number: true },
        });
      } catch {
        // Number taken — almost always another job's invoice for the same
        // week. Try the next suffix rather than failing the approval.
      }
    }
    if (!invoice) return { ok: false, reason: "Could not open an invoice for that week." };
  }

  // The replacement has priced, so the old shape can go. Both halves in one
  // transaction: a draft must never be observed with neither set of lines on it.
  if (stale) {
    await prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { id: { in: stale.ids } } });
      await tx.invoiceLine.createMany({
        data: priced.lines.map((l, i) => ({
          invoiceId: invoice!.id,
          dailyId: daily.id,
          workDate: daily.workDate,
          location: l.location,
          seq: i + 1,
          code: l.code,
          description: l.description,
          unit: l.unit,
          quantity: l.quantity,
          rate: l.rate,
          amount: Math.round(l.amount * 100) / 100,
          derived: l.derived,
        })),
      });
    });
    for (const id of stale.invoiceIds) await recalcInvoice(id);
    await recalcInvoice(invoice.id);

    return {
      ok: true,
      invoiceNumber: invoice.number,
      lines: priced.lines.length,
      amount: Math.round(priced.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
      unpriced,
    };
  }

  await prisma.invoiceLine.createMany({
    data: priced.lines.map((l, i) => ({
      invoiceId: invoice.id,
      dailyId: daily.id,
      workDate: daily.workDate,
      location: l.location,
      // Where it sat on the daily, so the bill reads in the same order as the
      // sheet. Counted from one; zero is reserved for lines billed before this.
      seq: i + 1,
      code: l.code,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      rate: l.rate,
      amount: Math.round(l.amount * 100) / 100,
      derived: l.derived,
    })),
  });

  await recalcInvoice(invoice.id);

  return {
    ok: true,
    invoiceNumber: invoice.number,
    lines: priced.lines.length,
    amount: Math.round(priced.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
    unpriced,
  };
}

export interface UnfileResult {
  ok: boolean;
  removedFrom?: string;
  /** Set when the work sits on an invoice the customer already has. */
  blockedBy?: string;
}

/**
 * Take a daily back off its draft invoice, when it stops being approved.
 *
 * Denying or reopening work that was billed has to pull the line, or the
 * invoice carries production nobody stands behind. But only from a draft: once
 * an invoice is sent, that figure is the customer's, and quietly editing it
 * would leave our copy disagreeing with theirs. The caller is told which.
 */
export async function unfileDaily(dailyId: string): Promise<UnfileResult> {
  const lines = await prisma.invoiceLine.findMany({
    where: { dailyId },
    select: { id: true, invoice: { select: { id: true, number: true, status: true } } },
  });
  if (lines.length === 0) return { ok: true };

  const sent = lines.find((l) => l.invoice.status !== "DRAFT");
  if (sent) return { ok: false, blockedBy: sent.invoice.number };

  const invoiceId = lines[0].invoice.id;
  const number = lines[0].invoice.number;
  await prisma.invoiceLine.deleteMany({ where: { dailyId } });
  await recalcInvoice(invoiceId);

  // An invoice with nothing left on it is not a bill. Remove it rather than
  // leaving a $0 draft in the queue for somebody to puzzle over.
  const left = await prisma.invoiceLine.count({ where: { invoiceId } });
  if (left === 0) await prisma.invoice.delete({ where: { id: invoiceId } });

  return { ok: true, removedFrom: number };
}
