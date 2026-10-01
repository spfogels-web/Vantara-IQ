/**
 * Screenshots of the billing readiness workflow, taken against the test
 * schema's own seeded tenant.
 *
 * Not part of the gate. It runs on demand, under the same global setup as the
 * isolation suite, because that is the only place there is a server with data
 * in it that is not production — and a screenshot of production would mean
 * writing a hold into it, which is exactly what this phase must not do.
 *
 *   npx vitest run tests/screens/billing.test.ts
 *
 * Output lands in docs/screens/.
 */
import { afterAll, beforeAll, describe, it } from "vitest";
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();
const OUT = "docs/screens";

const crew = tenant.crews[0];

let browser: Browser;
const dailyIds: string[] = [];
/** The daily whose whole quantity is held — the one worth a screenshot. */
let heldDailyId = "";

/** A cookie on the right host, so the server believes who we are. */
async function pageAs(userId: string, role: "ADMIN" | "SUBCONTRACTOR"): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: role === "SUBCONTRACTOR" ? { width: 414, height: 900 } : { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const cookie = await sessionCookie(userId, role);
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name, value, url: BASE_URL }]);
  return ctx.newPage();
}

async function shot(page: Page, path: string, file: string) {
  await page.goto(BASE_URL + path, { waitUntil: "networkidle" });
  // The dev server compiles on first hit; a screenshot of a spinner is not a
  // screenshot of the feature.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });

  console.log(`  wrote ${OUT}/${file}`);
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();

  /**
   * Three dailies, so the queue shows the states side by side rather than one
   * row and an empty page: something held, something a crew has answered, and
   * something waived on the record.
   */
  const make = async (
    workDate: string,
    quantity: number,
    hold: { held: number; status: string; requirement: string; missing?: string[]; extra?: object } | null,
  ) => {
    const d = await db.daily.create({
      data: {
        projectId: tenant.projectId,
        projectName: tenant.projectName,
        customer: tenant.customerName,
        subcontractor: crew.company,
        workDate,
        status: "Approved",
        totalFt: quantity,
        lineItems: [
          { code: "BFOV12", quantity, location: "Keener Rd", unit: "ft" },
          { code: "BHF3048", quantity: 2, location: "Keener Rd at Pierce Creek", unit: "ea" },
        ],
      },
      select: { id: true },
    });
    dailyIds.push(d.id);
    if (hold) {
      await db.billingHold.create({
        data: {
          dailyId: d.id,
          code: "BFOV12",
          quantity: hold.held,
          status: hold.status as never,
          requirement: hold.requirement,
          missing: hold.missing ?? [],
          raisedBy: "Sean Fogelson",
          raisedAt: new Date(Date.now() - 6 * 86_400_000),
          ...(hold.extra ?? {}),
        },
      });
    }
    return d.id;
  };

  heldDailyId = await make("2026-09-22", 1140, {
    held: 1140,
    status: "NEEDS_DOCUMENTATION",
    requirement: "Tick-mark documentation",
    missing: [
      "Tick-mark photograph with the count readable",
      "In and Out for the applicable section",
    ],
  });
  await make("2026-09-23", 860, {
    held: 400,
    status: "CREW_RESPONDED",
    requirement: "Tick-mark documentation",
    missing: ["In and Out for the applicable section"],
    extra: {
      respondedBy: `${crew.company} lead`,
      respondedAt: new Date(Date.now() - 86_400_000),
      responseNote: "Photos are on the sheet, tick count 114 at the vault.",
    },
  });
  await make("2026-09-24", 620, {
    held: 620,
    status: "OVERRIDDEN",
    requirement: "Tick-mark documentation",
    extra: {
      overrideReason: "Customer PM walked the route and signed the count on site.",
      resolvedBy: "Sean Fogelson",
      resolvedAt: new Date(),
    },
  });
  // One with nothing outstanding, so "Ready to bill" is on screen too.
  await make("2026-09-25", 980, null);
}, 300_000);

afterAll(async () => {
  await db.billingHold.deleteMany({ where: { dailyId: { in: dailyIds } } }).catch(() => undefined);
  await db.daily.deleteMany({ where: { id: { in: dailyIds } } }).catch(() => undefined);
  await browser?.close();
  await db.$disconnect();
});

describe("the workflow, as it looks", () => {
  it("captures the office queue and the crew's screen", async () => {
    const office = await pageAs(tenant.staffUserId, "ADMIN");
    await shot(office, "/billing-readiness", "01-office-billing-readiness.png");

    // The drawer: open the held row by its work date, which is on the row and
    // nowhere else on the page. Not caught — a missed click here produced a
    // second copy of the queue screenshot and called it the drawer.
    await office.getByText("2026-09-22", { exact: true }).first().click({ timeout: 15_000 });
    await office.waitForTimeout(1500);
    await office.screenshot({ path: `${OUT}/02-office-review-drawer.png`, fullPage: true });

    console.log(`  wrote ${OUT}/02-office-review-drawer.png`);

    // The chips are on a daily's line items, inside the opened workspace — the
    // list alone does not show them, and the first run of this captured the
    // list and called it the chips. ?sheet= is the page's own way of opening
    // one, which beats hunting for a row in whichever layout is active.
    await shot(office, `/dailies?sheet=${heldDailyId}`, "03-office-daily-chips.png");

    const field = await pageAs(crew.userId, "SUBCONTRACTOR");
    await shot(field, "/billing-readiness", "04-crew-action-required.png");
    await shot(field, "/dailies", "05-crew-dailies-banner.png");
  }, 300_000);
});
