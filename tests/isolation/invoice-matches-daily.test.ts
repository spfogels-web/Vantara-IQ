/**
 * An invoice line is a line of the daily it came from.
 *
 * A day on Rock Creek was written as six spans of placed fibre and arrived on
 * the bill as "BFO48 4,519". The total was right and the bill was uncheckable:
 * nobody holding the daily could reconcile it without adding six numbers up by
 * hand, and the crew being paid off the same roll-up could not tell which span
 * they had been paid for.
 *
 * So the shape changed. The money did not, and that is the assertion this file
 * exists for — "it only changes the presentation" is exactly the sort of claim
 * that is true right up until it quietly isn't.
 *
 * DATABASE_URL is pointed at this run's disposable schema before the modules
 * under test are imported, the way org-proxy.test.ts does it: these resolve
 * their own connection, and the one this process holds is production's.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixtures } from "../support/load";
import { TEST_SCHEMA, testClient, testDatabaseUrl } from "../support/test-db";

process.env.DATABASE_URL = testDatabaseUrl(TEST_SCHEMA);

const { fileApprovedDaily } = await import("@/lib/auto-invoice");
const { fileApprovedDailyForSub } = await import("@/lib/sub-pay");
const { runWithOrg } = await import("@/lib/org-context");

const onTestSchema = <T>(fn: () => Promise<T>) => runWithOrg("fortitude", fn);

const tenant = fixtures().a;
const crew = tenant.crews[0];
const db = testClient();

/** The rate card the fixture seeds: BFOV12 at 8.50 to the customer. */
const RATE = tenant.customerRate;

/**
 * Six spans of one code plus two per-span structures, which is the shape of a
 * real day and the shape that used to collapse to three lines.
 */
const SPANS = [
  { location: "153/@1-153/@3", code: "BFOV12", quantity: 1217, unit: "ft" },
  { location: "153/@3-153/@6", code: "BFOV12", quantity: 882, unit: "ft" },
  { location: "153/@6A-153/@12A", code: "BFOV12", quantity: 1106, unit: "ft" },
  { location: "153/@12A-153/@12", code: "BFOV12", quantity: 309, unit: "ft" },
  { location: "153/@12-153/@11A", code: "BFOV12", quantity: 491, unit: "ft" },
  { location: "153/@11A-153/@11b", code: "BFOV12", quantity: 514, unit: "ft" },
];
const TOTAL_FT = SPANS.reduce((n, s) => n + s.quantity, 0); // 4,519

const made: string[] = [];

/**
 * Invoices that existed before this suite ran, which it must not touch.
 *
 * The first version of the teardown deleted every invoice left with no lines
 * on it, reasoning that such a thing could only be this suite's litter. It is
 * not: the fixtures seed an invoice and a pay statement that carry no lines,
 * and removing them took out the rows four other suites read — the remittance
 * test failed with a 404 and the transaction test with a foreign key
 * violation, neither of them anywhere near this file.
 *
 * So the rule is the one that should have been obvious: remove what this suite
 * created, and nothing else.
 */
const preexisting = { invoices: new Set<string>(), subInvoices: new Set<string>() };

beforeAll(async () => {
  expect(RATE, "fixture problem: no customer rate").toBeGreaterThan(0);
  for (const i of await db.invoice.findMany({ select: { id: true } })) {
    preexisting.invoices.add(i.id);
  }
  for (const i of await db.subInvoice.findMany({ select: { id: true } })) {
    preexisting.subInvoices.add(i.id);
  }
}, 240_000);

afterAll(async () => {
  // Which invoices this suite's dailies landed on, read while the lines that
  // say so are still there.
  const touched = {
    invoices: new Set(
      (
        await db.invoiceLine.findMany({
          where: { dailyId: { in: made } },
          select: { invoiceId: true },
        })
      ).map((l) => l.invoiceId),
    ),
    subInvoices: new Set(
      (
        await db.subInvoiceLine.findMany({
          where: { dailyId: { in: made } },
          select: { invoiceId: true },
        })
      ).map((l) => l.invoiceId),
    ),
  };

  for (const id of made) {
    await db.invoiceLine.deleteMany({ where: { dailyId: id } }).catch(() => undefined);
    await db.subInvoiceLine.deleteMany({ where: { dailyId: id } }).catch(() => undefined);
    await db.billingHold.deleteMany({ where: { dailyId: id } }).catch(() => undefined);
    await db.daily.delete({ where: { id } }).catch(() => undefined);
  }

  for (const id of touched.invoices) {
    if (preexisting.invoices.has(id)) continue;
    if ((await db.invoiceLine.count({ where: { invoiceId: id } })) > 0) continue;
    await db.invoice.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of touched.subInvoices) {
    if (preexisting.subInvoices.has(id)) continue;
    if ((await db.subInvoiceLine.count({ where: { invoiceId: id } })) > 0) continue;
    await db.subInvoice.delete({ where: { id } }).catch(() => undefined);
  }

  await db.$disconnect();
});

async function approvedDaily(
  workDate: string,
  lineItems: { location: string; code: string; quantity: number; unit: string }[],
) {
  const d = await db.daily.create({
    data: {
      projectId: tenant.projectId,
      projectName: tenant.projectName,
      customer: tenant.customerName,
      subcontractor: crew.company,
      workDate,
      status: "Approved",
      lineItems,
    },
    select: { id: true },
  });
  made.push(d.id);
  return d.id;
}

const linesFor = (dailyId: string) =>
  db.invoiceLine.findMany({ where: { dailyId }, orderBy: { seq: "asc" } });

describe("the invoice matches the daily", () => {
  it("carries the customer's own job number", async () => {
    // Their accounts system is keyed on it, so an invoice without it has to be
    // looked up by hand before it can be paid.
    const dailyId = await approvedDaily("2026-09-17", SPANS);
    const res = await onTestSchema(() => fileApprovedDaily(dailyId));
    expect(res.ok, res.reason).toBe(true);

    const line = await db.invoiceLine.findFirst({
      where: { dailyId },
      select: { invoice: { select: { projectNumber: true, projectName: true } } },
    });
    const project = await db.project.findUnique({
      where: { id: tenant.projectId },
      select: { number: true, name: true },
    });
    expect(project?.number, "fixture problem: the project has no number").toBeTruthy();
    expect(line?.invoice.projectNumber, "the invoice has no job number on it").toBe(project?.number);
    expect(line?.invoice.projectName).toBe(project?.name);
  });

  it("writes one line per line of the daily, in the same order", async () => {
    const dailyId = await approvedDaily("2026-09-18", SPANS);
    const res = await onTestSchema(() => fileApprovedDaily(dailyId));
    expect(res.ok, res.reason).toBe(true);

    const lines = await linesFor(dailyId);
    expect(lines, "the day was rolled up into one line per code again").toHaveLength(SPANS.length);
    expect(lines.map((l) => l.location)).toEqual(SPANS.map((s) => s.location));
    expect(lines.map((l) => l.quantity)).toEqual(SPANS.map((s) => s.quantity));
    expect(lines.map((l) => l.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("bills exactly what the roll-up billed", async () => {
    // The whole safety property. Six lines at the same rate must come to the
    // same money as one line of the summed footage.
    const dailyId = await approvedDaily("2026-09-19", SPANS);
    const res = await onTestSchema(() => fileApprovedDaily(dailyId));
    expect(res.ok, res.reason).toBe(true);

    const lines = await linesFor(dailyId);
    const billed = lines.reduce((n, l) => n + l.amount, 0);
    const rolledUp = Math.round(TOTAL_FT * RATE * 100) / 100;

    expect(Math.round(billed * 100) / 100, "splitting the day changed the money").toBe(rolledUp);
    expect(lines.reduce((n, l) => n + l.quantity, 0)).toBe(TOTAL_FT);
    for (const l of lines) expect(l.rate, "a span was priced at a different rate").toBe(RATE);
  });

  it("does not bill the same span twice when it files again", async () => {
    const dailyId = await approvedDaily("2026-09-20", SPANS);
    await onTestSchema(() => fileApprovedDaily(dailyId));
    const second = await onTestSchema(() => fileApprovedDaily(dailyId));

    expect(second.ok, "a second filing billed the day again").toBe(false);
    const lines = await linesFor(dailyId);
    expect(lines).toHaveLength(SPANS.length);
    expect(lines.reduce((n, l) => n + l.quantity, 0)).toBe(TOTAL_FT);
  });
});

describe("a draft written the old way", () => {
  /** A line as the roll-up used to write it: no span, no sequence. */
  async function rolledUpDraft(dailyId: string) {
    const invoice = await db.invoice.create({
      data: {
        number: `OLD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        customerId: (await db.customer.findFirst({ select: { id: true } }))!.id,
        projectId: tenant.projectId,
        status: "DRAFT",
      },
      select: { id: true },
    });
    await db.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        dailyId,
        workDate: "2026-09-21",
        code: "BFOV12",
        quantity: TOTAL_FT,
        rate: RATE,
        amount: Math.round(TOTAL_FT * RATE * 100) / 100,
      },
    });
    return invoice.id;
  }

  it("is re-split into spans, for the same money", async () => {
    const dailyId = await approvedDaily("2026-09-21", SPANS);
    const invoiceId = await rolledUpDraft(dailyId);
    const before = (await linesFor(dailyId)).reduce((n, l) => n + l.amount, 0);

    const res = await onTestSchema(() => fileApprovedDaily(dailyId));
    expect(res.ok, res.reason).toBe(true);

    const after = await linesFor(dailyId);
    expect(after, "the old rolled-up line was left as it was").toHaveLength(SPANS.length);
    expect(
      Math.round(after.reduce((n, l) => n + l.amount, 0) * 100) / 100,
      "re-splitting a draft moved the money",
    ).toBe(Math.round(before * 100) / 100);

    await db.invoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
  });

  it("is left intact when the replacement cannot be priced", async () => {
    /**
     * The hazard the ordering exists for. The first version of the re-split
     * deleted the old lines and then priced the replacement, so a daily whose
     * code had since fallen off the rate card would lose its lines and get
     * nothing back — a draft quietly emptying itself.
     *
     * Nothing is removed until the replacement has priced.
     */
    const dailyId = await approvedDaily("2026-09-29", [
      { location: "153/@1-153/@3", code: "NOSUCHCODE", quantity: 400, unit: "ft" },
    ]);
    const invoice = await db.invoice.create({
      data: {
        number: `OLD-UNPRICED-${Date.now()}`,
        customerId: (await db.customer.findFirst({ select: { id: true } }))!.id,
        projectId: tenant.projectId,
        status: "DRAFT",
      },
      select: { id: true },
    });
    try {
      await db.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          dailyId,
          workDate: "2026-09-29",
          code: "NOSUCHCODE",
          quantity: 400,
          rate: 1,
          amount: 400,
        },
      });

      const res = await onTestSchema(() => fileApprovedDaily(dailyId));
      expect(res.ok, "a code with no rate somehow priced").toBe(false);

      const lines = await linesFor(dailyId);
      expect(lines, "the draft was emptied and nothing went back").toHaveLength(1);
      expect(lines[0].amount).toBe(400);
    } finally {
      await db.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } }).catch(() => undefined);
      await db.invoice.delete({ where: { id: invoice.id } }).catch(() => undefined);
    }
  });

  it("is left alone once the customer has it", async () => {
    // A sent invoice is the customer's figure. Reshaping it would make our copy
    // disagree with theirs, which is the one thing a billing record must not do.
    const dailyId = await approvedDaily("2026-09-22", SPANS);
    const invoiceId = await rolledUpDraft(dailyId);
    await db.invoice.update({ where: { id: invoiceId }, data: { status: "SENT" } });

    const res = await onTestSchema(() => fileApprovedDaily(dailyId));
    expect(res.ok, "a sent invoice was re-billed").toBe(false);

    const lines = await linesFor(dailyId);
    expect(lines, "a sent invoice was re-split").toHaveLength(1);
    expect(lines[0].quantity).toBe(TOTAL_FT);
    expect(lines[0].location).toBe("");

    await db.invoiceLine.deleteMany({ where: { invoiceId } }).catch(() => undefined);
    await db.invoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
  });
});

describe("a documentation hold against spans", () => {
  it("bills the spans the allowance reaches and no more", async () => {
    const dailyId = await approvedDaily("2026-09-23", SPANS);
    // Hold 1,000 of the 4,519, leaving 3,519 billable.
    await db.billingHold.create({
      data: {
        dailyId,
        code: "BFOV12",
        quantity: 1000,
        status: "NEEDS_DOCUMENTATION",
        requirement: "Tick-mark documentation",
      },
    });

    const res = await onTestSchema(() => fileApprovedDaily(dailyId));
    expect(res.ok, res.reason).toBe(true);

    const lines = await linesFor(dailyId);
    const billedFt = lines.reduce((n, l) => n + l.quantity, 0);
    expect(billedFt, "the hold did not come off the invoice").toBe(TOTAL_FT - 1000);
    // Allocation is first span first, so no span is ever billed above what the
    // crew reported for it.
    for (const l of lines) {
      const span = SPANS.find((s) => s.location === l.location)!;
      expect(l.quantity, `${l.location} billed more than was reported`).toBeLessThanOrEqual(
        span.quantity,
      );
    }
  });
});

describe("the crew's statement", () => {
  it("is split the same way", async () => {
    const dailyId = await approvedDaily("2026-09-24", SPANS);
    const res = await onTestSchema(() => fileApprovedDailyForSub(dailyId));
    expect(res.ok, res.reason).toBe(true);

    const lines = await db.subInvoiceLine.findMany({
      where: { dailyId },
      orderBy: { seq: "asc" },
    });
    expect(lines).toHaveLength(SPANS.length);
    expect(lines.map((l) => l.location)).toEqual(SPANS.map((s) => s.location));
  });

  it("is priced at the crew's own card and never the customer's", async () => {
    /**
     * WE BILL is not WE PAY. The fixture bills the customer 8.50 for BFOV12 and
     * pays this crew 6.00, so the two are distinguishable in the data rather
     * than only in the comments — a statement carrying 8.50 would be handing a
     * subcontractor our margin on their own work.
     *
     * Splitting both documents by span is what made this worth pinning: the two
     * builders now do the same thing to the same daily, a line apart, and the
     * easy mistake is to share the rate card along with the shape.
     */
    const dailyId = await approvedDaily("2026-09-26", SPANS);
    const res = await onTestSchema(() => fileApprovedDailyForSub(dailyId));
    expect(res.ok, res.reason).toBe(true);

    const lines = await db.subInvoiceLine.findMany({ where: { dailyId } });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.rate, "the crew's statement is priced at the customer's rate").not.toBe(RATE);
      expect(l.rate, "the crew's statement is not on their own card").toBe(crew.rate);
    }
    expect(
      Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100,
      "the crew was paid the customer's figure",
    ).toBe(Math.round(TOTAL_FT * crew.rate * 100) / 100);
  });

  it("carries the job number, which is on their daily too", async () => {
    const dailyId = await approvedDaily("2026-09-27", SPANS);
    const res = await onTestSchema(() => fileApprovedDailyForSub(dailyId));
    expect(res.ok, res.reason).toBe(true);

    const line = await db.subInvoiceLine.findFirst({
      where: { dailyId },
      select: { invoice: { select: { projectNumber: true } } },
    });
    const project = await db.project.findUnique({
      where: { id: tenant.projectId },
      select: { number: true },
    });
    expect(line?.invoice.projectNumber, "the statement has no job number on it").toBe(
      project?.number ?? "",
    );
  });

  it("is not reduced by a hold on the customer's billing", async () => {
    // The rule that must never bend. A hold says Fortitude cannot invoice the
    // customer yet; it says nothing about what the crew earned, and a missing
    // photograph must not take money off somebody's pay for work they did.
    const dailyId = await approvedDaily("2026-09-25", SPANS);
    await db.billingHold.create({
      data: {
        dailyId,
        code: "BFOV12",
        quantity: TOTAL_FT,
        status: "NEEDS_DOCUMENTATION",
        requirement: "Tick-mark documentation",
      },
    });

    const res = await onTestSchema(() => fileApprovedDailyForSub(dailyId));
    expect(res.ok, "a billing hold stopped the crew being paid").toBe(true);

    const lines = await db.subInvoiceLine.findMany({ where: { dailyId } });
    expect(
      lines.reduce((n, l) => n + l.quantity, 0),
      "a billing hold reduced what the crew was paid",
    ).toBe(TOTAL_FT);
  });
});
