/**
 * Paying a crew that never pressed accept, and what fast pay costs them.
 *
 * The office could not pay a statement until the crew opened it and accepted
 * it. They do not: one login serves a whole company and it is a foreman using
 * it from a truck, so the gate protected nobody's figures and held up their
 * money. It is gone. A dispute still stops a payment, because a crew who has
 * actively said the figures are wrong should not be paid those figures while
 * the argument is open.
 *
 * The fee is the other half. Every crew is on NET 21; NET 10 costs them 3% and
 * is now elected by the office, because that is how it is actually asked for.
 * Anything that takes money off somebody's pay has to be recorded by name, and
 * has to be charged on the figure that is actually going out.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  FAST_PAY_DAYS,
  FAST_PAY_FEE_PCT,
  STANDARD_TERMS_DAYS,
  canElectFastPay,
  statementMoney,
} from "@/lib/fast-pay";

const ACTIONS = readFileSync("src/app/actions.ts", "utf8");
const REGISTER = readFileSync("src/components/financials/pay-app-actions.tsx", "utf8");
const PANEL = readFileSync("src/components/subcontractors/sub-pay-panel.tsx", "utf8");

/** One function's source, bounded at the next export. */
function fn(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start, `${name} is missing`).toBeGreaterThan(-1);
  const next = source.indexOf("export async function", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("the house terms", () => {
  it("is NET 21 with nothing taken off", () => {
    expect(STANDARD_TERMS_DAYS).toBe(21);
    const m = statementMoney({
      subtotal: 6567,
      retainagePct: 0.1,
      retainageHeld: 657,
      fastPay: false,
      fastPayFeePct: 0,
      termsDays: STANDARD_TERMS_DAYS,
    });
    expect(m.fee, "a standard statement was charged a fee").toBe(0);
    expect(m.net).toBe(m.payable);
    expect(m.days).toBe(21);
  });

  it("charges 3% for NET 10, and charges it on what is going out", () => {
    expect(FAST_PAY_FEE_PCT).toBe(3);
    expect(FAST_PAY_DAYS).toBe(10);

    // The register's own figures: $6,567 gross, $657 held back.
    const m = statementMoney({
      subtotal: 6567,
      retainagePct: 0.1,
      retainageHeld: 657,
      fastPay: true,
      fastPayFeePct: FAST_PAY_FEE_PCT,
      termsDays: FAST_PAY_DAYS,
    });

    expect(m.payable).toBe(5910);
    // Three per cent of the 5,910 going out, not of the 6,567 earned —
    // retainage is money not being paid this week, so charging to receive it
    // early charges for something nobody is receiving.
    expect(m.fee).toBe(177.3);
    expect(m.net).toBe(5732.7);
    expect(
      Math.round((m.fee + m.net) * 100) / 100,
      "the fee and the net do not add back to what was payable",
    ).toBe(m.payable);
    expect(m.days).toBe(10);
  });

  it("can be elected before the statement is approved", () => {
    // The office elects on a phone call, which does not wait for the statement
    // to be sent.
    expect(canElectFastPay("DRAFT", false)).toBe(true);
    expect(canElectFastPay("ISSUED", false)).toBe(true);
    expect(canElectFastPay("ACCEPTED", false)).toBe(true);
  });

  it("cannot be elected twice, or after the money has gone", () => {
    expect(canElectFastPay("ISSUED", true), "a second fee could be added").toBe(false);
    expect(canElectFastPay("PAID", false), "a fee could be added after payment").toBe(false);
    expect(canElectFastPay("VOID", false)).toBe(false);
  });
});

describe("paying without waiting on the crew", () => {
  const record = fn(ACTIONS, "recordSubPayment");

  it("no longer refuses a statement the crew has not accepted", () => {
    expect(record, "payment still waits on the crew").not.toMatch(
      /Wait for the crew to accept/,
    );
    expect(record).toMatch(/Approve this statement for payment first/);
  });

  it("still refuses a draft", () => {
    // Approving is what freezes the figures. Paying before that would pay a
    // statement nobody had looked at.
    expect(record).toMatch(/inv\.status === "DRAFT"/);
  });

  it("still refuses a disputed statement", () => {
    // The protection worth keeping: silence is not refusal, but an actual
    // objection is.
    expect(record).toMatch(/inv\.status === "DISPUTED"/);
    expect(record).toMatch(/settle it before paying it/i);
  });

  it("is staff only", () => {
    expect(record).toMatch(/await requireStaff\(\)/);
  });
});

describe("the office electing fast pay", () => {
  const elect = fn(ACTIONS, "electFastPay");

  it("lets the office do it, and still lets the crew", () => {
    expect(elect).toMatch(/const byOffice = isStaff\(user\.role\)/);
    expect(elect).toMatch(/!byOffice && user\.subcontractorId !== inv\.subcontractorId/);
  });

  it("records who pressed it, and that the office did", () => {
    // A crew querying the fee reads this line. "The office did it" with no name
    // on it is the answer that starts the argument rather than ending it.
    expect(elect).toMatch(/fastPayElectedBy/);
    expect(elect).toMatch(/office, at the crew's request/);
    expect(elect).toMatch(/accessLog/);
    expect(elect).toMatch(/subinvoice\.fastpay/);
  });

  it("logs the fee it actually charges", () => {
    // It used to quote on the gross while statementMoney charged on the payable,
    // so the audit line recorded a figure the crew was never charged.
    expect(elect).toMatch(/statementMoney\(/);
    expect(elect, "the logged fee is worked out on the gross").not.toMatch(
      /fastPayQuote\(inv\.subtotal/,
    );
    expect(elect).toMatch(/retainageHeld/);
  });

  it("cannot be taken back", () => {
    expect(elect).toMatch(/already on this statement/i);
  });
});

describe("the register", () => {
  it("does not offer to send anything to the crew", () => {
    for (const source of [REGISTER, PANEL]) {
      expect(source, "the send-to-crew action is still here").not.toMatch(/Send to crew/);
      expect(source, "the register still waits on the crew").not.toMatch(/Waiting on the crew/);
    }
  });

  it("offers approval instead", () => {
    expect(REGISTER).toMatch(/Approve for payment/);
    expect(PANEL).toMatch(/Approve for payment/);
  });

  it("lets a payment be recorded once approved, not once accepted", () => {
    expect(REGISTER).toMatch(/state === "ISSUED" \|\| state === "ACCEPTED"/);
    expect(PANEL).toMatch(/inv\.status === "ISSUED" \|\| inv\.status === "ACCEPTED"/);
  });

  it("offers the remittance to download from approval onwards", () => {
    // It is emailed to the crew, so the office needs it in hand.
    expect(REGISTER).toMatch(/\/api\/remittance\//);
    expect(REGISTER).toMatch(/state !== "DRAFT" && state !== "VOID"/);
    expect(PANEL).toMatch(/inv\.status !== "DRAFT" && inv\.status !== "VOID"/);
  });

  it("says what fast pay costs before it is pressed", () => {
    // In money. A percentage leaves the person clicking to work out what they
    // are taking off somebody else's pay.
    expect(REGISTER).toMatch(/formatCurrency\(fee\)/);
    expect(REGISTER).toMatch(/cannot be undone/);
    expect(REGISTER).toMatch(/Your name goes on\s*\n?\s*the record/);
  });
});
