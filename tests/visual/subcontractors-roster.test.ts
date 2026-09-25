/**
 * The subcontractors roster, measured rather than eyeballed.
 *
 * Two things this layout has to keep being true: the table is for desktop and
 * a phone gets cards instead — eight columns dragged sideways is not a table
 * anybody reads — and the page itself never scrolls sideways at any width.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";

const OUT = join(process.cwd(), "tests", "visual", "screens");
const tenant = fixtures().a;

let browser: Browser;
let page: Page;
let phone: Page;

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  const cookie = await sessionCookie(tenant.staffUserId, "ADMIN");
  const raw = {
    name: cookie.split("=")[0],
    value: cookie.split("=").slice(1).join("="),
    domain: "localhost",
    path: "/",
  };
  browser = await chromium.launch();
  const desk = await browser.newContext({ viewport: { width: 1536, height: 1100 }, colorScheme: "dark" });
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await desk.addCookies([raw]);
  await mob.addCookies([raw]);
  page = await desk.newPage();
  phone = await mob.newPage();
}, 300_000);

afterAll(async () => {
  await browser?.close();
});

describe("the subcontractors roster", () => {
  it("renders the banner, the tiles and the table", async () => {
    await page.goto(`${BASE_URL}/subcontractors`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(OUT, "subs-desktop.png"), fullPage: false });
    expect(await page.getByRole("table").count()).toBeGreaterThan(0);
  });

  it("does not scroll the page sideways on a phone", async () => {
    await phone.goto(`${BASE_URL}/subcontractors`, { waitUntil: "networkidle" });
    const over = await phone.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    await phone.screenshot({ path: join(OUT, "subs-phone.png"), fullPage: true });
    expect(await phone.getByRole("table").isVisible().catch(() => false), "a table is visible on a phone").toBe(false);
    expect(over, `the page scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
  });
});
