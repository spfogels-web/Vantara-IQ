/**
 * The override, driven through the running app rather than read off the source.
 *
 *   npx vitest run tests/screens/approve-override.test.ts
 *
 * A daily with no photographs, refused, then approved with a reason — and the
 * record checked afterwards. The source-level test beside this one proves the
 * code says the right things; this proves the daily actually ends up approved.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { chromium, type Browser } from "playwright";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();
const OUT = "docs/screens";

let browser: Browser;
let dailyId = "";

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();

  // A day from before photographs were asked for: real production, no sheet
  // photos, waiting on review.
  const daily = await db.daily.create({
    data: {
      projectId: tenant.projectId,
      projectName: tenant.projectName,
      customer: tenant.customerName,
      subcontractor: tenant.crews[0].company,
      workDate: "2026-06-12",
      status: "Submitted",
      totalFt: 1311,
      lineItems: [
        { code: "BFOV12", quantity: 898, location: "2033/2 - 2033@4", unit: "ft" },
        { code: "BFOV12", quantity: 413, location: "2033@4 - h7", unit: "ft" },
      ],
    },
    select: { id: true },
  });
  dailyId = daily.id;
  await db.dailySheet.create({
    data: { dailyId, projectId: tenant.projectId, photos: [] },
  }).catch(() => undefined);
}, 300_000);

afterAll(async () => {
  await db.dailySheet.deleteMany({ where: { dailyId } }).catch(() => undefined);
  await db.invoiceLine.deleteMany({ where: { dailyId } }).catch(() => undefined);
  await db.subInvoiceLine.deleteMany({ where: { dailyId } }).catch(() => undefined);
  await db.daily.delete({ where: { id: dailyId } }).catch(() => undefined);
  await browser?.close();
  await db.$disconnect();
});

describe("a daily filed before photographs were required", () => {
  it("is refused, then approved with a reason on the record", async () => {
    const ctx = await browser.newContext({
      viewport: { width: 1500, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    const [name, value] = (await sessionCookie(tenant.staffUserId, "ADMIN")).split("=");
    await ctx.addCookies([{ name, value, url: BASE_URL }]);
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/dailies?sheet=${dailyId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    // The ordinary approve is refused, and the refusal is what offers the way
    // through — it is not sitting there before anyone has been stopped.
    expect(
      await page.getByText("Approve without photos").count(),
      "the override was offered before the gate refused",
    ).toBe(0);

    await page.getByRole("button", { name: /^Approve daily$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/09-approve-refused.png`, fullPage: true });

    const stillSubmitted = await db.daily.findUnique({
      where: { id: dailyId },
      select: { status: true },
    });
    expect(stillSubmitted?.status, "it was approved without photographs").toBe("Submitted");

    // Now the way through: a reason, then the override.
    await page.getByRole("button", { name: /Use that reason/ }).click({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/10-approve-override.png`, fullPage: true });

    await page.getByRole("button", { name: /Approve without photos/ }).click({ timeout: 20_000 });
    await page.waitForTimeout(3000);

    const after = await db.daily.findUnique({
      where: { id: dailyId },
      select: { status: true, reviewNote: true, reviewedBy: true },
    });
    expect(after?.status, "the override did not approve it").toBe("Approved");
    expect(after?.reviewNote, "the daily does not say what was waived").toMatch(
      /Approved without field photographs/,
    );
    expect(after?.reviewNote).toMatch(/predates|before field photographs were required/i);

    const log = await db.accessLog.findFirst({
      where: { action: "daily.approved_without_photos", subjectId: dailyId },
      select: { actorEmail: true, detail: true },
    });
    expect(log, "nothing was written to the audit log").toBeTruthy();
    expect(log?.actorEmail, "the log does not say who waived it").toBeTruthy();
    expect(log?.detail).toMatch(/1311 ft/);

    // eslint-disable-next-line no-console
    console.log(`  approved: ${after?.status} · note "${after?.reviewNote}" · logged by ${log?.actorEmail}`);
  }, 300_000);
});
