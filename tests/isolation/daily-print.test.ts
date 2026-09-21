/**
 * What a printed daily actually contains.
 *
 * The sheet is one form and thirteen pages came out of the printer: the field
 * photos and the redline uploader live inside it, because a crew fills them in
 * while they are filling in the day, and printing took them along. Each
 * thumbnail was too small to show what it was taken to prove, and the form
 * itself was lost at the front of the stack.
 *
 * These check the print stylesheet through the browser's own print media
 * emulation, rather than by reading the CSS and believing it. That distinction
 * has already cost this file once: a `print:` utility that was never generated
 * emitted no CSS, and the grid printed at half its width for weeks with
 * nothing to say so.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";

const tenant = fixtures().a;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  const cookie = await sessionCookie(tenant.staffUserId, "ADMIN");
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: cookie.split("=")[0],
      value: cookie.split("=").slice(1).join("="),
      domain: "localhost",
      path: "/",
    },
  ]);
  page = await context.newPage();
  // /dailies/sheet/<projectId>?sheet=<sheetId> — the bare /dailies/sheet
  // route renders a job picker, which has no sheet on it at all.
  await page.goto(`${BASE_URL}/dailies/sheet/${tenant.projectId}?sheet=${tenant.dailySheetId}`, {
    waitUntil: "networkidle",
  });
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(500);
}, 240_000);

afterAll(async () => {
  await browser?.close();
});

describe("a printed daily is the billing form and nothing else", () => {
  it("leaves the photo galleries off the page", async () => {
    // Count them first. An earlier version asserted only that none were
    // displayed and passed against a page that had no galleries on it,
    // because the URL was wrong — "none visible" is satisfied by "none at
    // all", which is not what is being claimed here.
    const total = await page.locator(".sheet-photos").count();
    expect(total, "no photo galleries on the page — wrong page under test").toBeGreaterThan(0);

    const shown = await page.locator(".sheet-photos").evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).display !== "none").length,
    );
    expect(shown, "a photo gallery is still printing").toBe(0);
  });

  it("leaves the job map off the page", async () => {
    // A D-size plan squeezed onto letter is unreadable and costs a whole
    // extra sheet. Asserted separately from the galleries so that removing it
    // cannot be mistaken for the galleries being hidden twice.
    const map = page.getByText(/job map/i).first();
    // It has to be on the page before "it is not printing" means anything.
    // Without this, a renamed heading or a wrong URL satisfies the assertion
    // by finding nothing — which is how the galleries test first passed
    // against a page that had no galleries on it.
    expect(await map.count(), "no job map on the page — nothing was proved").toBeGreaterThan(0);
    const printed =
      (await map.evaluate((el) => {
        for (let n: HTMLElement | null = el as HTMLElement; n; n = n.parentElement) {
          if (getComputedStyle(n).display === "none") return false;
        }
        return true;
      }));
    expect(printed, "the job map is still printing").toBe(false);
  });

  it("still prints the form itself", async () => {
    // The point is to remove the photographs, not the sheet. If this ever goes
    // to zero the fix has eaten the thing it was protecting.
    const grid = page.locator(".sheet-grid").first();
    await grid.waitFor({ state: "attached", timeout: 10_000 });
    const visible = await grid.evaluate((el) => getComputedStyle(el).display !== "none");
    expect(visible, "the billing grid is not printing").toBe(true);
  });
});

describe("the form uses the page it is given", () => {
  it("scales the sheet to the full printable landscape width", async () => {
    // Letter landscape less 0.25in margins is 10.5in ≈ 1008px. The sheet is
    // 1420px of columns scaled by zoom, and what matters is that the result
    // fills the page rather than sitting in a column down one side — which is
    // what "bunched up and small" looked like.
    const width = await page
      .locator(".sheet-page")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);

    expect(width, `sheet rendered ${Math.round(width)}px wide`).toBeGreaterThan(950);
    expect(width, `sheet rendered ${Math.round(width)}px wide — wider than the page`).toBeLessThan(
      1040,
    );
  });
});
