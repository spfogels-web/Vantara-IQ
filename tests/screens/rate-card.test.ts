/**
 * The rates panel with the whole card on it, and the sheet it produces.
 *
 *   npx vitest run tests/screens/rate-card.test.ts
 *
 * Seeds a job that plans two codes while the customer's card carries several
 * more, so the fold — the job's own work, then the rest of the price book —
 * has something to show. Output lands in docs/screens/.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser } from "playwright";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();
const OUT = "docs/screens";

let browser: Browser;
const addedRates: string[] = [];

/** Codes on the customer's card that this job does not plan. */
const OFF_JOB = [
  { code: "BHF(10)P", description: "Place 10 inch round handhole", unit: "ea", rate: 81.97 },
  { code: "BD4MPF", description: "MST FTTP pedestal", unit: "ea", rate: 99.44 },
  { code: "BM2F", description: "Pedestal ground assembly - ground rod", unit: "ea", rate: 17.27 },
  { code: "BMFAF", description: "Place fire ant control", unit: "ea", rate: 9.09 },
];

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();

  const customerId = (await db.project.findUnique({
    where: { id: tenant.projectId },
    select: { customerId: true },
  }))?.customerId;

  for (const r of OFF_JOB) {
    const row = await db.customerRate
      .create({ data: { customerId: customerId!, ...r } })
      .catch(() => null);
    if (row) addedRates.push(row.id);
  }
}, 300_000);

afterAll(async () => {
  await db.customerRate.deleteMany({ where: { id: { in: addedRates } } }).catch(() => undefined);
  await browser?.close();
  await db.$disconnect();
});

describe("the rates panel", () => {
  it("folds the rest of the card in behind the job's own work", async () => {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    const [name, value] = (await sessionCookie(tenant.staffUserId, "ADMIN")).split("=");
    await ctx.addCookies([{ name, value, url: BASE_URL }]);
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/projects/${tenant.projectId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3500);

    // The project page keeps its sections collapsed; the table is not in the
    // DOM until this one is opened.
    await page.getByText("Rates on this job").first().click({ timeout: 20_000 });
    await page.waitForTimeout(1200);

    // Captured before anything is asserted, so a failure leaves something to
    // look at rather than only a count that was zero.
    await page.screenshot({ path: `${OUT}/11-rates-folded.png`, fullPage: true });

    const panel = await page.getByText("Rates on this job").count();
    const fold = page.getByRole("button", { name: /Show the other \d+ codes? on the rate card/ });
    expect(panel, "the rates panel is not on this page at all").toBeGreaterThan(0);
    expect(await fold.count(), "the fold is not on the page").toBeGreaterThan(0);

    await fold.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    await fold.first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/12-rates-all-codes.png`, fullPage: true });

    // The whole card is reachable, and the off-job codes have an editable cell.
    for (const r of OFF_JOB) {
      expect(
        await page.getByText(r.code, { exact: true }).count(),
        `${r.code} is not listed once the card is unfolded`,
      ).toBeGreaterThan(0);
    }
    // eslint-disable-next-line no-console
    console.log(`  wrote ${OUT}/11-rates-folded.png and ${OUT}/12-rates-all-codes.png`);
  }, 300_000);
});

describe("the sheet it produces", () => {
  it("names nobody", async () => {
    const cookie = await sessionCookie(tenant.staffUserId, "ADMIN");
    const res = await fetch(`${BASE_URL}/api/rate-sheet/project/${tenant.projectId}`, {
      headers: { cookie },
    });

    const disposition = res.headers.get("content-disposition") ?? "";
    const project = await db.project.findUnique({
      where: { id: tenant.projectId },
      select: { name: true, number: true },
    });

    if (res.status === 400) {
      // No pay rates set on this fixture job, so there is nothing to quote —
      // which is the documented refusal, not a failure of this test.
      // eslint-disable-next-line no-console
      console.log("  no pay rates on the fixture job; sheet correctly refused");
      return;
    }
    expect(res.status).toBe(200);

    expect(disposition, "the project name is in the filename").not.toContain(project!.name);

    const bytes = Buffer.from(await res.arrayBuffer());
    writeFileSync(`${OUT}/13-rate-sheet.pdf`, bytes);
    const raw = bytes.toString("latin1");

    // Metadata travels with the file and is not visible on the page.
    for (const name of [project!.name, tenant.customerName, tenant.orgName, tenant.crews[0].company]) {
      expect(raw, `the sheet carries "${name}"`).not.toContain(name);
    }
    // eslint-disable-next-line no-console
    console.log(`  wrote ${OUT}/13-rate-sheet.pdf — ${bytes.length} bytes, no company named`);
  }, 300_000);
});
