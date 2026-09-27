/**
 * The prospects pipeline, measured rather than eyeballed.
 *
 * Two things this layout has to keep being true: where a prospect actually
 * lives is on the row — it is the fact that decides whether a job is in their
 * back yard or a motel away, and it used to be invisible until you opened
 * them — and the page never scrolls sideways at any width.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const OUT = join(process.cwd(), "tests", "visual", "screens");
const tenant = fixtures().a;

let browser: Browser;
let page: Page;
let phone: Page;

const db = testClient();
let madeIds: string[] = [];

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });

  // The fixture tenant has no prospects, so the table and the detail pane
  // would never render and the assertions below would pass on an empty page.
  const seeded = await Promise.all([
    db.prospect.create({
      data: {
        kind: "SUBCONTRACTOR", stage: "NEW", name: "Bates Underground LLC",
        contactName: "Joseph Bates", city: "Pickens", homeState: "SC",
        states: ["SC", "NC", "GA"], markets: ["Georgia Market"],
        trades: ["drop bury crew"], crewSize: 2, source: "facebook", owner: "sean",
        nextStep: "Call about rates", nextStepDue: "2026-08-09",
      },
    }),
    db.prospect.create({
      data: {
        kind: "PRIME", stage: "READY_TO_ONBOARD", name: "Kestrel Fiber Partners",
        contactName: "Dana Reyes", city: "Greenville", homeState: "SC",
        states: ["SC"], trades: ["prime"], source: "referral", owner: "sean",
      },
    }),
  ]);
  madeIds = seeded.map((r) => r.id);
  const raw = await sessionCookie(tenant.staffUserId, "ADMIN");
  const cookie = {
    name: raw.split("=")[0],
    value: raw.split("=").slice(1).join("="),
    domain: "localhost",
    path: "/",
  };
  browser = await chromium.launch();
  const desk = await browser.newContext({
    viewport: { width: 1536, height: 1100 },
    colorScheme: "dark",
  });
  const mob = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  await desk.addCookies([cookie]);
  await mob.addCookies([cookie]);
  page = await desk.newPage();
  phone = await mob.newPage();
}, 300_000);

afterAll(async () => {
  await browser?.close();
  for (const id of madeIds) {
    await db.prospect.delete({ where: { id } }).catch(() => undefined);
  }
  await db.$disconnect();
});

describe("the prospects pipeline", () => {
  it("shows the five counts and the table", async () => {
    await page.goto(`${BASE_URL}/prospects`, { waitUntil: "networkidle" });
    const body = await page.content();
    for (const label of [
      "Total prospects",
      "Active pipeline",
      "Follow-ups due",
      "Ready to onboard",
      "Not a fit",
    ]) {
      expect(body, `the "${label}" count is missing`).toContain(label);
    }
    await page.screenshot({ path: join(OUT, "prospects-desktop.png"), fullPage: false });
  });

  it("puts where they live on the row", async () => {
    const body = await page.content();
    // The column, and the tab counts beside each type.
    expect(body, "the home-town column is missing").toMatch(/Lives in/i);
    expect(body).toMatch(/Crews\s*<\/?[^>]*>?\s*\(?\d/);
  });

  it("does not scroll the page sideways on a phone", async () => {
    await phone.goto(`${BASE_URL}/prospects`, { waitUntil: "networkidle" });
    await phone.waitForTimeout(400);
    const over = await phone.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, `the page scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
    await phone.screenshot({ path: join(OUT, "prospects-phone.png"), fullPage: false });
  });
});
