/**
 * The pay application register as it now looks.
 *
 *   npx vitest run tests/screens/pay-applications.test.ts
 *
 * Three statements in the three states the office actually works through, so
 * the row that needs approving, the row that is ready to pay and the row that
 * is already settled appear together. Output lands in docs/screens/.
 */
import { afterAll, beforeAll, describe, it } from "vitest";
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
  opts: { fastPay?: boolean; paid?: boolean } = {},
) {
  const inv = await db.subInvoice.create({
    data: {
      number,
      subcontractorId: crew.subcontractorId,
      projectId: tenant.projectId,
      projectName: tenant.projectName,
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
        ? { fastPayElectedAt: new Date(), fastPayElectedBy: "Sean Fogelson (office, at the crew's request)" }
        : {}),
    },
    select: { id: true },
  });
  made.push(inv.id);

  await db.subInvoiceLine.createMany({
    data: [
      { invoiceId: inv.id, dailyId: "", workDate: periodStart, location: "153/@1-153/@3", seq: 1, code: "BFOV12", description: "Plow 12ct", unit: "ft", quantity: 620, rate: crew.rate, amount: Math.round(620 * crew.rate * 100) / 100 },
      { invoiceId: inv.id, dailyId: "", workDate: periodEnd, location: "153/@3-153/@6", seq: 2, code: "BFOV12", description: "Plow 12ct", unit: "ft", quantity: 480, rate: crew.rate, amount: Math.round(480 * crew.rate * 100) / 100 },
    ],
  });

  if (opts.paid) {
    await db.subPayment.create({
      data: { invoiceId: inv.id, amount: gross * 0.9, paidOn: periodEnd, method: "ACH", reference: "TRACE-88120" },
    }).catch(() => undefined);
  }
  return inv.id;
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();

  await statement("PAY-SC-20260925-01", "DRAFT", "2026-09-19", "2026-09-25", 6567);
  await statement("PAY-SC-20260918-01", "ISSUED", "2026-09-12", "2026-09-18", 6014);
  await statement("PAY-SC-20260911-01", "ISSUED", "2026-09-05", "2026-09-11", 2660, { fastPay: true });
}, 300_000);

afterAll(async () => {
  for (const id of made) {
    await db.subPayment.deleteMany({ where: { invoiceId: id } }).catch(() => undefined);
    await db.subInvoiceLine.deleteMany({ where: { invoiceId: id } }).catch(() => undefined);
    await db.subInvoice.delete({ where: { id } }).catch(() => undefined);
  }
  await browser?.close();
  await db.$disconnect();
});

async function pageAs(userId: string): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const [name, value] = (await sessionCookie(userId, "ADMIN")).split("=");
  await ctx.addCookies([{ name, value, url: BASE_URL }]);
  return ctx.newPage();
}

describe("the pay application register", () => {
  it("shows approve, NET 10 and the remittance", async () => {
    const office = await pageAs(tenant.staffUserId);
    await office.goto(`${BASE_URL}/pay-applications`, { waitUntil: "networkidle" });
    await office.waitForTimeout(2500);
    await office.screenshot({ path: `${OUT}/07-pay-applications.png`, fullPage: true });
    console.log(`  wrote ${OUT}/07-pay-applications.png`);

    // The fee, in money, before anybody presses it.
    await office.getByRole("button", { name: /NET 10/ }).first().click({ timeout: 15_000 });
    await office.waitForTimeout(900);
    await office.screenshot({ path: `${OUT}/08-pay-net10-confirm.png`, fullPage: true });
    console.log(`  wrote ${OUT}/08-pay-net10-confirm.png`);
  }, 300_000);
});
