/**
 * The Operations Center, with the new rings on it.
 *
 *   npx vitest run tests/screens/ops-center.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { chromium, type Browser } from "playwright";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";

const tenant = fixtures().a;
const OUT = "docs/screens";
let browser: Browser;

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();
}, 300_000);

afterAll(async () => {
  await browser?.close();
});

describe("the operations center", () => {
  it("draws the dailies and locate rings", async () => {
    for (const [w, h, name] of [
      [1600, 1200, "20-ops-center.png"],
      [390, 900, "21-ops-center-phone.png"],
    ] as const) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 2,
        colorScheme: "dark",
      });
      const [n, v] = (await sessionCookie(tenant.staffUserId, "ADMIN")).split("=");
      await ctx.addCookies([{ name: n, value: v, url: BASE_URL }]);
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });

      if (w > 1000) {
        expect(await page.getByText("Locate status").count()).toBeGreaterThan(0);
        // "still open", not "waiting on you": the centre counts the statuses
        // that are not settled, which is not the /dailies "Need review" figure
        // — that one also counts a day with no photos or an unpriced code, and
        // cannot be known without reading every row.
        expect(await page.getByText("still open").count()).toBeGreaterThan(0);

        /**
         * The rings on their own, so a ring that fails to draw is visible
         * rather than lost in a six-thousand-pixel page.
         *
         * Matched on the panel's own <h2>, exactly. `hasText` is a
         * case-insensitive substring, so filtering on "Dailies" also matched
         * the revenue panel's "approved dailies, not yet invoiced" and this
         * quietly photographed the wrong panel for several runs — a shot meant
         * to prove a ring drew, of a card with no ring on it.
         */
        for (const [title, file] of [
          ["Dailies", "22-ring-dailies.png"],
          ["Locate status", "23-ring-locates.png"],
        ] as const) {
          const heading = page.getByRole("heading", { level: 2, name: title, exact: true });
          expect(await heading.count(), `no panel titled ${title}`).toBe(1);
          const panel = page.locator("section").filter({ has: heading });
          await panel.screenshot({ path: `${OUT}/${file}` });
          console.log(`  wrote ${OUT}/${file}`);
        }

        // A category holding the whole ring must actually draw. The arc form is
        // degenerate at 100%, so this is the case that silently rendered an
        // empty track.
        const drawn = await page.evaluate(() => {
          const svgs = [...document.querySelectorAll("svg")];
          return svgs.some((sv) =>
            [...sv.querySelectorAll("circle[stroke]:not([stroke='none']), path[fill]")].some((el) => {
              const c = el.getAttribute("stroke") || el.getAttribute("fill") || "";
              return c.startsWith("var(--") || /^#|rgb/.test(c);
            }),
          );
        });
        expect(drawn, "no ring segment was drawn at all").toBe(true);
      } else {
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(over, `phone scrolls ${over}px sideways`).toBeLessThanOrEqual(1);
      }
      console.log(`  wrote ${OUT}/${name}`);
    }
  }, 300_000);
});
