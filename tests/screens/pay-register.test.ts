/**
 * The redrawn pay register, at the three widths it is actually used at.
 *
 *   npx vitest run tests/screens/pay-register.test.ts
 *
 * A register is read on a laptop and a payment gets chased from a truck, so
 * the phone view is not an afterthought — it is checked here with the same
 * seriousness as the desktop one. Output lands in docs/screens/.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const crew = tenant.crews[0];
const db = testClient();
const OUT = "docs/screens";

let browser: Browser;
const made: string[] = [];

async function statement(
  number: string,
  status: "DRAFT" | "ISSUED" | "ACCEPTED" | "DISPUTED" | "PAID" | "VOID",
  periodStart: string,
  periodEnd: string,
  gross: number,
  opts: { fastPay?: boolean } = {},
) {
  const inv = await db.subInvoice.create({
    data: {
      number,
      subcontractorId: crew.subcontractorId,
      projectId: tenant.projectId,
      projectName: tenant.projectName,
      projectNumber: "704263275",
      periodStart,
      periodEnd,
      status,
      subtotal: gross,
      retainagePct: 0.1,
      retainageHeld: Math.round(gross * 0.1 * 100) / 100,
      termsDays: opts.fastPay ? 10 : 21,
      fastPay: !!opts.fastPay,
      fastPayFeePct: opts.fastPay ? 3 : 0,
      ...(opts.fastPay
        ? {
            fastPayElectedAt: new Date(),
            fastPayElectedBy: "Sean Fogelson (office, at the crew's request)",
          }
        : {}),
    },
    select: { id: true },
  });
  made.push(inv.id);

  // Two dailies' worth of lines, so the drawer has something to break down.
  await db.subInvoiceLine.createMany({
    data: [
      { invoiceId: inv.id, dailyId: `${inv.id}-a`, workDate: periodStart, location: "Smith Rd", seq: 1, code: "BFOV12", description: "12\" Buried Fiber", unit: "ft", quantity: 1450, rate: crew.rate, amount: Math.round(1450 * crew.rate * 100) / 100 },
      { invoiceId: inv.id, dailyId: `${inv.id}-a`, workDate: periodStart, location: "Smith Rd", seq: 2, code: "BHF(10)P", description: "Handhole", unit: "ea", quantity: 3, rate: 115, amount: 345 },
      { invoiceId: inv.id, dailyId: `${inv.id}-b`, workDate: periodEnd, location: "Hwy 29", seq: 3, code: "BFO24", description: "24\" Buried Fiber", unit: "ft", quantity: 820, rate: crew.rate, amount: Math.round(820 * crew.rate * 100) / 100 },
    ],
  });
  return inv.id;
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();
  await statement("PAY-JC-20260911-01", "DRAFT", "2026-09-05", "2026-09-11", 6014);
  await statement("PAY-JC-20260814-01", "ISSUED", "2026-08-08", "2026-08-14", 2660);
  await statement("PAY-EC-20260807-01", "ISSUED", "2026-08-01", "2026-08-07", 12445, { fastPay: true });
}, 300_000);

afterAll(async () => {
  for (const id of made) {
    await db.subInvoiceLine.deleteMany({ where: { invoiceId: id } }).catch(() => undefined);
    await db.subInvoice.delete({ where: { id } }).catch(() => undefined);
  }
  await browser?.close();
  await db.$disconnect();
});

async function open(width: number, height: number): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const [name, value] = (await sessionCookie(tenant.staffUserId, "ADMIN")).split("=");
  await ctx.addCookies([{ name, value, url: BASE_URL }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/pay-applications`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  return page;
}

describe("the register", () => {
  it("draws on a laptop, a tablet and a phone", async () => {
    // Desktop: list and statement side by side.
    const desk = await open(1600, 1000);
    await desk.screenshot({ path: `${OUT}/14-pay-register.png`, fullPage: true });
    await desk.getByText("PAY-JC-20260911-01").first().click({ timeout: 20_000 });
    await desk.waitForTimeout(1200);
    await desk.screenshot({ path: `${OUT}/15-pay-register-open.png`, fullPage: true });

    // The breakdown is what the drawer exists for.
    expect(await desk.getByText("Net payable").count()).toBeGreaterThan(0);
    expect(await desk.getByText("Approved for payment").count()).toBeGreaterThan(0);
    // And the action that was there before is still there.
    expect(await desk.getByRole("button", { name: /Approve for payment/ }).count()).toBeGreaterThan(0);

    await desk.getByRole("button", { name: /^Earnings$/ }).click({ timeout: 20_000 });
    await desk.waitForTimeout(700);
    await desk.screenshot({ path: `${OUT}/16-pay-earnings.png`, fullPage: true });
    expect(await desk.getByText("Rate (we pay)").count()).toBeGreaterThan(0);

    // Tablet: one column, table still readable.
    const tab = await open(900, 1100);
    await tab.screenshot({ path: `${OUT}/17-pay-tablet.png`, fullPage: true });

    // Phone: cards, and the statement as a screen of its own.
    const phone = await open(390, 900);
    await phone.screenshot({ path: `${OUT}/18-pay-phone.png`, fullPage: true });
    // The card, not the table's copy of the same number — the table is still in
    // the DOM below md, just hidden, and it matches first by document order.
    await phone
      .getByRole("button", { name: /PAY-JC-20260911-01/ })
      .first()
      .click({ timeout: 20_000 });
    await phone.waitForTimeout(1200);
    await phone.screenshot({ path: `${OUT}/19-pay-phone-open.png`, fullPage: true });

    // Nothing should scroll sideways on a phone.
    const overflow = await phone.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the phone view scrolls ${overflow}px sideways`).toBeLessThanOrEqual(1);

    // eslint-disable-next-line no-console
    console.log(`  wrote ${OUT}/14..19 pay register screens`);
  }, 300_000);
});
