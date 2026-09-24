/**
 * The dailies command centre, photographed.
 *
 * Writes a couple of dailies' worth of evidence first so the thumbnail column
 * has something real in it — a screenshot of an empty table says nothing about
 * whether the table works.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";
import { billingWeekFor } from "@/lib/billing";

const OUT = join(process.cwd(), "tests", "visual", "screens");
const tenant = fixtures().a;
const db = testClient();

let browser: Browser;
/** What seedShowcase made, so the assertions can name this tenant's own rows. */
let seeded: { dailyId: string; bareId: string; sheetId: string };

/**
 * One daily that exercises every column the redesign added.
 *
 * The seeded tenant files a daily with no line items and no photographs, so
 * the money column renders an em dash and the photo column renders a warning
 * — both correct, and both useless for judging whether the table works. This
 * gives exactly one day real quantities against a code the customer's rate
 * card already prices, links it to its sheet, and attaches five photographs.
 *
 * Nothing here prices anything. The quantity goes on the daily and the
 * existing pricing path multiplies it by the rate already on the card, which
 * is the point: a figure this test invented would prove nothing about the
 * column that renders it.
 */
async function seedShowcase() {
  const daily = await db.daily.findFirst({
    where: { projectId: tenant.projectId },
    orderBy: { createdAt: "desc" },
  });
  if (!daily) throw new Error("no seeded daily to dress up");

  // BFOV12 is the code the fixtures put on this customer's card.
  await db.daily.update({
    where: { id: daily.id },
    data: {
      lineItems: [
        { location: "153/@1-153/@3", code: "BFOV12", quantity: 1450, unit: "ft" },
      ],
      totalFt: 1450,
      // A day that was documented. Its counterpart below is left bare, so
      // the two rows show a reviewer both states side by side.
      hasAsBuilt: true,
    },
  });

  /**
   * A second, undocumented day — belonging to this tenant.
   *
   * The queue already showed two rows without this, but only one of them was
   * Northgate's: the other was Barrow's, visible across the boundary that
   * `tenant-vs-tenant.test.ts` exists to say is still open until Phase 4. A
   * test that reads a second row off that leak is a test that breaks on the
   * day the leak is fixed, and breaks for a reason that has nothing to do
   * with what it was checking. This tenant supplies its own contrast.
   */
  const bare = await db.daily.upsert({
    where: { id: `${daily.id}-bare` },
    update: {},
    create: {
      id: `${daily.id}-bare`,
      // A different number, not a longer one. "CLD-0001-B" contains
      // "CLD-0001", so a row matched on that text matched both dailies and
      // the test opened the same one twice — and saw one outcome where it
      // expected two.
      sheetNumber: daily.sheetNumber.replace(/\d+$/, "0002"),
      projectId: daily.projectId,
      projectName: daily.projectName,
      customer: daily.customer,
      subcontractor: daily.subcontractor,
      crew: daily.crew,
      workDate: daily.workDate,
      status: "Submitted",
      totalFt: 900,
    },
  });

  // The sheet is what photographs hang off, and what the row reads for them.
  let sheet = await db.dailySheet.findFirst({ where: { dailyId: daily.id } });
  if (!sheet) {
    sheet = await db.dailySheet.findFirst({ where: { projectId: tenant.projectId } });
    if (sheet) {
      await db.dailySheet.update({ where: { id: sheet.id }, data: { dailyId: daily.id } });
    }
  }
  if (!sheet) throw new Error("no daily sheet to attach photographs to");
  const sheetId = sheet.id;

  const shots = Array.from({ length: 5 }, (_, i) => ({
    url: `https://placehold.co/320x240/1f2937/9ca3af.png?text=Ped+${i + 1}`,
    structure: "Ped",
  }));

  const already = await db.projectPhoto.count({ where: { dailySheetId: sheetId } });
  if (already === 0) {
    await db.projectPhoto.createMany({
      data: shots.map((s) => ({
        projectId: tenant.projectId,
        dailySheetId: sheetId,
        url: s.url,
        mediaType: "image/png",
        sizeBytes: 140_000,
        kind: "PHOTO" as const,
        source: "CAMERA" as const,
        stage: "WORK_RECORD" as const,
        purpose: "RECORD" as const,
        category: "UTILITY_PEDESTAL" as const,
        uploadedBy: "Field crew",
      })),
    });
  }

  /**
   * Both stores, because the upload path writes both.
   *
   * A photograph filed on a sheet becomes an evidence row keyed by
   * `dailySheetId` *and* an entry in the sheet's own JSON list, whose length
   * is mirrored onto `Daily.photos` — that count is what the review panel's
   * documentation chip reads. Writing only the evidence rows produced a
   * screenshot no crew could ever generate: five thumbnails in the queue
   * beside a panel reporting "Photos: None". The disagreement was this
   * fixture's, so the fixture writes what the application writes.
   */
  await db.dailySheet.update({
    where: { id: sheetId },
    data: {
      photos: shots.map((s, i) => ({
        id: `seed-${i + 1}`,
        url: s.url,
        name: `ped-${i + 1}.png`,
        structure: s.structure,
        caption: "",
        addedAt: "2026-09-01T14:00:00.000Z",
      })),
    },
  });
  await db.daily.update({ where: { id: daily.id }, data: { photos: shots.length } });

  return { dailyId: daily.id, bareId: bare.id, sheetId };
}

async function shot(page: Page, name: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  seeded = await seedShowcase();
  const cookie = await sessionCookie(tenant.staffUserId, "ADMIN");
  browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
  await context.addCookies([
    {
      name: cookie.split("=")[0],
      value: cookie.split("=").slice(1).join("="),
      domain: "localhost",
      path: "/",
    },
  ]);
  (globalThis as { __page?: Page }).__page = await context.newPage();
}, 240_000);

afterAll(async () => {
  await browser?.close();
  await db.projectPhoto
    .deleteMany({ where: { projectId: tenant.projectId, uploadedBy: "Field crew" } })
    .catch(() => undefined);
  await db.daily.delete({ where: { id: seeded.bareId } }).catch(() => undefined);
  await db.$disconnect();
});

describe("the dailies command centre", () => {
  it("renders the queue at desktop width", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await shot(page, "dailies-desktop", 1680, 1100);

    // The table and its columns, not just "a page loaded".
    const html = await page.content();
    for (const col of ["Sheet #", "Production", "Est. value", "Status", "Photos"]) {
      expect(html, `column ${col} is missing`).toContain(col);
    }
  });

  it("opens a daily into the workspace", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    // The priced day with photographs on it, not merely the first row. An
    // earlier version took the first `tbody tr` and matched the "EARLIER THIS
    // MONTH" subtotal, which has no click handler, so nothing opened and the
    // screenshot was identical to the one before it; the version after that
    // opened the empty day, which shows the workspace with nothing in it.
    const row = page.locator("tbody tr").filter({ has: page.locator("td img") }).first();
    await row.click();
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: join(OUT, "dailies-selected.png"), fullPage: true });
    // The workspace's own nav is the proof it opened, not the row highlight.
    expect(await page.getByText(/AI review/i).first().count()).toBeGreaterThan(0);

  });

  /**
   * The review heading has to agree with the checks printed under it.
   *
   * It counted quantity flags only, so a day with no photographs and no
   * as-built announced "No discrepancies detected" above a list showing that
   * very check failing — and above a table row already warning about it. The
   * heading is the line a reviewer reads before deciding whether to open the
   * day at all, so it is the one that must not lie.
   *
   * Both seeded days are opened rather than one: the documented day proves
   * the heading can still say nothing is wrong, and the bare one proves it
   * stops saying so. A test that only ever saw one of those would pass on a
   * heading hard-coded to the other.
   *
   * The two are addressed by their own sheet numbers rather than by position,
   * because this tenant's queue currently also shows another contractor's day
   * — the open boundary in `tenant-vs-tenant.test.ts` — and neither this
   * test's subject nor its row count should depend on that still being true.
   */
  it("says how many checks failed, on every daily", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 1680, height: 1100 });
    await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });

    const mine = await db.daily.findMany({
      where: { id: { in: [seeded.dailyId, seeded.bareId] } },
      select: { sheetNumber: true },
    });
    expect(mine.length, "both seeded dailies should exist").toBe(2);

    const seen = new Set<string>();
    for (const { sheetNumber } of mine) {
      const row = page.locator("tbody tr").filter({ hasText: sheetNumber }).first();
      expect(await row.count(), `${sheetNumber} is not in the queue`).toBeGreaterThan(0);
      await row.click();
      await page.waitForTimeout(600);

      // The innermost element holding both the heading and the checks — the
      // panel. Matching on the text alone found the heading's own span, where
      // there are no checks to count and every count came back zero.
      const panel = page
        .locator("div")
        .filter({ hasText: /AI review/ })
        .filter({ has: page.locator("li") })
        .last();
      const failing = await panel.locator("li.text-warning").count();
      const heading = await panel.innerText();

      if (failing === 0) {
        expect(heading, "every check passed but the heading says otherwise").toContain(
          "No discrepancies detected",
        );
        seen.add("clean");
      } else {
        expect(heading, `${failing} checks failed and the heading claims none did`).not.toContain(
          "No discrepancies detected",
        );
        expect(heading, "the heading does not count the checks it sits above").toContain(
          `${failing} for your team to review`,
        );
        seen.add("flagged");
      }
      await row.click();
      await page.waitForTimeout(200);
    }

    expect([...seen].sort(), "one of the two outcomes never rendered").toEqual([
      "clean",
      "flagged",
    ]);
  });

  /**
   * The photo column must not be what decides how tall a row is.
   *
   * The thumbnails are 36px because that is the largest size in the range
   * worth considering that the row was already tall enough to hold: two
   * lines of text in the first cell come to 57.25px, and the same row with
   * three thumbnails in it comes to 57.75px. Half a pixel buys the column.
   * At 40px each photo row grows several pixels and the queue stops being
   * dense — so the size is checked against the rendered row here rather
   * than left to whoever next nudges a class name.
   */
  it("keeps the queue dense with photos in it", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 1680, height: 1100 });
    await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });

    const rows = await page.locator("tbody tr").evaluateAll((els) =>
      els
        // Data rows only. The month subtotal has no project cell and is
        // half the height, which would flatter any comparison it entered.
        .filter((el) => el.querySelector("td p"))
        .map((el) => ({
          height: el.getBoundingClientRect().height,
          thumbs: [...el.querySelectorAll("img")].map((i) => i.getBoundingClientRect().height),
        })),
    );

    const withPhotos = rows.filter((r) => r.thumbs.length > 0);
    const textOnly = rows.filter((r) => r.thumbs.length === 0);
    expect(withPhotos.length, "no row rendered any thumbnails").toBeGreaterThan(0);
    expect(textOnly.length, "nothing to compare a photo row against").toBeGreaterThan(0);

    for (const h of withPhotos.flatMap((r) => r.thumbs)) {
      expect(h, "thumbnail is not the size it was asked to be").toBeCloseTo(36, 0);
    }

    const tallestText = Math.max(...textOnly.map((r) => r.height));
    for (const r of withPhotos) {
      expect(
        r.height - tallestText,
        `photos grew the row to ${r.height}px against ${tallestText}px of text`,
      ).toBeLessThanOrEqual(2);
    }
  });

  /**
   * The two new columns, checked against what the fixture actually costs.
   *
   * 1,450ft of BFOV12 at the $8.50 on this customer's card is $12,325. The
   * figure is not written anywhere in the fixture — the page reaches the
   * rate card for it — so a column that renders a placeholder, prices the
   * wrong card, or silently drops to zero fails here rather than looking
   * plausible in a screenshot.
   */
  it("prices the day from the rate card and shows three photos of it", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 1680, height: 1100 });
    await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });

    const row = page.locator("tbody tr").filter({ has: page.locator("td img") }).first();
    const cells = await row.locator("td").allInnerTexts();
    expect(cells.join(" | "), "the row is not priced at the customer's rate").toContain("$12,325");
    expect(cells.join(" | "), "production is not the footage that was priced").toContain("1,450");

    // Three, and a count of what is not shown — not all five crammed in.
    expect(await row.locator("td img").count(), "the photo column is not capped at three")
      .toBe(3);
    expect(await row.getByText("+2").count(), "the remaining two are not accounted for")
      .toBeGreaterThan(0);

    // A hundred rows of phone photographs is why these defer.
    for (const img of await row.locator("td img").all()) {
      expect(await img.getAttribute("loading"), "thumbnails are not deferred").toBe("lazy");
    }

    // The tile over the table is the same money, summed — not a separate
    // figure computed a second way that can drift away from the rows.
    // The label sits two levels inside the tile — its own parent is just the
    // icon-and-label line, which is what the first version of this read.
    const kpi = await page
      .getByText(/Est\. value/)
      .first()
      .locator("xpath=../..")
      .innerText();
    expect(kpi, "the Est. value tile excludes the priced daily").toMatch(/\$1[0-9],\d{3}/);
  });

  it("stacks on a laptop", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await shot(page, "dailies-laptop", 1280, 900);
  });
});

/**
 * Opening a day, on a queue the size a real one is.
 *
 * The redesign moved the detail out of the row and put it after the whole
 * table. With three fixture rows that reads as "just below"; with the
 * seventy-odd days a contractor actually has on the page, clicking the
 * second row scrolls nothing and paints nothing the viewer can see — the
 * workspace opens somewhere past the bottom of a very long table. To the
 * person clicking, the row does not open.
 *
 * So the assertion is not that state changed. It is that the workspace is
 * on screen, near the row that was clicked, which is the only version of
 * "it opened" that matters. The days here carry no daily sheet and no
 * photographs, because that is the shape most production days have.
 */
describe("opening a daily from a full-size queue", () => {
  const MANY = 40;
  let ids: string[] = [];

  beforeAll(async () => {
    const base = await db.daily.findFirst({ where: { projectId: tenant.projectId } });
    if (!base) throw new Error("no daily to model the bulk on");
    ids = Array.from({ length: MANY }, (_, i) => `${base.id}-bulk-${i}`);
    await db.daily.createMany({
      data: ids.map((id, i) => ({
        id,
        sheetNumber: `BULK-${String(i + 1).padStart(4, "0")}`,
        projectId: base.projectId,
        projectName: base.projectName,
        customer: base.customer,
        subcontractor: base.subcontractor,
        crew: base.crew,
        workDate: base.workDate,
        status: "Submitted",
        totalFt: 500 + i,
      })),
      skipDuplicates: true,
    });
  }, 120_000);

  afterAll(async () => {
    await db.daily.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
  });

  for (const [label, width, height] of [
    ["desktop", 1680, 1100],
    ["laptop", 1280, 900],
  ] as const) {
    it(`shows the workspace on screen after a click at ${label} width`, async () => {
      const page = (globalThis as { __page?: Page }).__page!;
      await page.setViewportSize({ width, height });
      await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });

      const rows = page.locator("tbody tr").filter({ has: page.locator("td p") });
      expect(await rows.count(), "the bulk days did not render").toBeGreaterThan(20);

      // The second row, near the top — where somebody actually starts.
      const row = rows.nth(1);
      await row.scrollIntoViewIfNeeded();
      const rowBox = (await row.boundingBox())!;
      await row.click();
      await page.waitForTimeout(800);

      // The workspace's own close control identifies it, and is inside it.
      const workspace = page
        .locator("div")
        .filter({ hasText: /AI review/ })
        .filter({ has: page.locator("li") })
        .last();
      expect(await workspace.count(), "no workspace rendered at all").toBeGreaterThan(0);

      // Present in the DOM is not open. It has to be where the eye is.
      await expect
        .poll(() => workspace.isVisible(), { timeout: 5_000 })
        .toBe(true);

      const box = (await workspace.boundingBox())!;
      const scrollY = await page.evaluate(() => window.scrollY);
      const viewportTop = scrollY;
      const viewportBottom = scrollY + height;
      const onScreen = box.y < viewportBottom && box.y + box.height > viewportTop;
      expect(
        onScreen,
        `workspace sits at y=${Math.round(box.y)} while the viewport is ${Math.round(viewportTop)}-${Math.round(viewportBottom)} (clicked row at y=${Math.round(rowBox.y)})`,
      ).toBe(true);
    });
  }
});

/**
 * The row as a click target, and the table as something that fits.
 *
 * Both were reported from production together, and they turned out to be
 * one fault: `truncate` on a paragraph does not constrain a column in an
 * auto-layout table, so cells grew to their content, the table outgrew its
 * container, and the right-hand columns — photographs, and the open/close
 * control — sat outside the visible area. They were not unclickable
 * because of event handling. They were off the edge of the page.
 *
 * So these assert the two halves: every region of a row opens the day, and
 * the table does not spill out of the area it is given.
 */
describe("a daily row is one click target", () => {
  const WIDTHS = [
    ["desktop", 1680, 1100],
    ["laptop", 1280, 900],
  ] as const;

  /**
   * Names the length of real ones.
   *
   * The fixture's "Whitfield Loop / Pellham Boring" is short enough that the
   * table very nearly fits by luck, which is why the first version of these
   * tests passed against the layout that was failing in production. Real
   * jobs and real companies are not that tidy, and the columns that get
   * pushed off the edge are the ones on the right — the photographs and the
   * control that opens the day.
   */
  beforeAll(async () => {
    const d = await db.daily.findFirst({ where: { projectId: tenant.projectId } });
    if (!d) throw new Error("no daily to lengthen");
    await db.daily.update({
      where: { id: d.id },
      data: {
        projectName: "Whitfield Loop Phase II — Colbert to Milledgeville Reroute",
        subcontractor: "Pellham Boring & Directional Services of Georgia, LLC",
        crew: "Pellham Boring & Directional Services of Georgia, LLC",
        roads: "Keener Rd — or Hwy 17 to Pierce Creek, then along Old Mill Rd",
      },
    });
  }, 120_000);

  /** Where the workspace is, if it is open at all. */
  async function workspaceOpen(page: Page): Promise<boolean> {
    const panel = page
      .locator("div")
      .filter({ hasText: /AI review/ })
      .filter({ has: page.locator("li") })
      .last();
    return (await panel.count()) > 0 && (await panel.isVisible());
  }

  async function firstRow(page: Page) {
    return page.locator("tbody tr").filter({ has: page.locator("td p") }).first();
  }

  for (const [label, width, height] of WIDTHS) {
    it(`does not overflow its container at ${label} width`, async () => {
      const page = (globalThis as { __page?: Page }).__page!;
      await page.setViewportSize({ width, height });
      await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });

      const m = await page.evaluate(() => {
        const table = document.querySelector("table")!;
        const box = table.parentElement!;
        return {
          table: table.getBoundingClientRect().width,
          container: box.clientWidth,
          scrollW: box.scrollWidth,
          bodyScroll: document.documentElement.scrollWidth,
          bodyClient: document.documentElement.clientWidth,
        };
      });

      /**
       * The columns have to add up, and the project has to get a share.
       *
       * Every fixed column sat at its stated width while 182px went
       * nowhere, leaving the project name 90px on a laptop — the table did
       * not overflow, so the check above was happy, and the row was still
       * unreadable. A column marked hidden keeps holding its width open,
       * and an auto column does not reclaim it; the project column asks
       * for 100% so that it does.
       */
      const cols = await page.evaluate(() => {
        const t = document.querySelector("table")!;
        const body = (t.querySelector("tbody tr:nth-child(2)") || t.querySelector("tbody tr"))!;
        return [...body.querySelectorAll("td")].map((c) => c.getBoundingClientRect().width);
      });
      const summed = Math.round(cols.reduce((a, b) => a + b, 0));
      expect(
        Math.abs(summed - Math.round(m.table)),
        `columns add up to ${summed}px in a ${Math.round(m.table)}px table — the rest is dead space`,
      ).toBeLessThanOrEqual(2);

      // The project and its road are how a row is found. Anything under
      // this and the name is an ellipsis.
      expect(
        Math.round(cols[1]),
        `the project column is ${Math.round(cols[1])}px wide`,
      ).toBeGreaterThanOrEqual(160);
      expect(
        m.scrollW - m.container,
        `table scrolls ${m.scrollW - m.container}px inside a ${m.container}px container`,
      ).toBeLessThanOrEqual(1);
      expect(
        m.bodyScroll - m.bodyClient,
        `the page itself scrolls sideways by ${m.bodyScroll - m.bodyClient}px`,
      ).toBeLessThanOrEqual(1);
    });

    it(`opens the day from every region of the row at ${label} width`, async () => {
      const page = (globalThis as { __page?: Page }).__page!;
      await page.setViewportSize({ width, height });

      // Each named region of the row, by the cell it lives in.
      // Located by column heading rather than by a hard-coded index.
      // These pointed one column to the left the moment the cover square
      // was added at the head of the row, and passed anyway — because
      // every cell opens the day, a wrong index still looks like a pass.
      const headers = await page.locator("thead th").allInnerTexts();
      const at = (name: string) => {
        const i = headers.findIndex((h) => h.trim().toLowerCase().startsWith(name));
        expect(i, `no column headed "${name}"`).toBeGreaterThan(-1);
        return i;
      };
      const regions: [string, number][] = [
        ["cover square", 0],
        ["project text", at("project")],
        ["sheet number", at("sheet")],
        ["production", at("producti")],
        ["billing week", at("billing")],
        ["status", at("status")],
        ["crew", at("crew")],
        ["photo strip", at("photos")],
      ];

      for (const [name, cell] of regions) {
        await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });
        const row = await firstRow(page);
        const target = row.locator("td").nth(cell);
        expect(await target.count(), `${name}: cell ${cell} is missing`).toBeGreaterThan(0);
        // Crew is deliberately dropped below a wide desktop. A column
        // that is not on screen is not a dead click area.
        if (!(await target.isVisible())) continue;

        // Click the cell itself, not a child — that is the whitespace a
        // person actually hits, and the part that was dead.
        await target.click({ position: { x: 4, y: 4 } });
        await page.waitForTimeout(500);
        expect(await workspaceOpen(page), `${name} did not open the daily`).toBe(true);
      }
    });
  }

  it("opens the day from the keyboard", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 1680, height: 1100 });

    for (const key of ["Enter", "Space"]) {
      await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });
      const row = await firstRow(page);
      await row.focus();
      expect(
        await row.evaluate((el) => el === document.activeElement),
        `${key}: the row did not take focus — it is not reachable by keyboard`,
      ).toBe(true);
      await page.keyboard.press(key);
      await page.waitForTimeout(500);
      expect(await workspaceOpen(page), `${key} did not open the daily`).toBe(true);
    }
  });
});

/**
 * The billing-week column says what the open day says.
 *
 * The column is not a second calculation — it renders `billingWeekEnd` and
 * `billingWeekLate`, the same two fields the workspace prints in "Bills to
 * week ending … · filed after the Friday cutoff". This proves that rather
 * than asserting it: the Friday is read out of the database, then looked
 * for in the row and in the panel, and the cutoff note has to agree with
 * the flag the application already set.
 */
describe("billing week, in the table and in the day", () => {
  it("shows the same Friday in the row as in the open daily", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 1680, height: 1100 });
    await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });

    const daily = await db.daily.findUnique({ where: { id: seeded.dailyId } });
    if (!daily) throw new Error("the seeded daily vanished");

    /**
     * The expected Friday, from the application's own function.
     *
     * Not from the column: `Daily.billingWeekEnd` holds only an override,
     * and is empty on almost every day. The Friday a normal day bills to is
     * derived by `billingWeekFor` from the work date, which is what the page
     * renders — so that is what this compares against. Recomputing the week
     * here with fresh arithmetic would be a second source of truth, and a
     * test that agrees with itself rather than with the product.
     */
    const week = billingWeekFor({
      workDate: daily.workDate,
      billingWeekEnd: daily.billingWeekEnd,
    });
    if (!week) throw new Error("the seeded daily has no resolvable billing week");

    const [, m, dd] = week.end.split("-");
    const short = `${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][Number(m) - 1]} ${Number(dd)}`;

    const row = page.locator("tbody tr").filter({ hasText: daily.sheetNumber }).first();
    const rowText = await row.innerText();
    expect(rowText, `the row does not carry the billing week ${short}`).toContain(short);

    // The flag the application set decides whether the row shouts.
    if (daily.billingWeekLate) {
      expect(rowText, "a late daily does not say so in the table").toMatch(/Missed cutoff/i);
    } else {
      expect(rowText, "an on-time daily is shouting about a cutoff it made").not.toMatch(
        /Missed cutoff/i,
      );
    }

    // And the open day agrees, because it is the same field.
    await row.click();
    await page.waitForTimeout(800);
    const panel = page
      .locator("div")
      .filter({ hasText: /Bills to week ending/ })
      .last();
    const panelText = await panel.innerText();
    expect(panelText, "the open daily lost its billing week").toContain(week.end);
    expect(
      /filed after the Friday cutoff/i.test(panelText),
      "the table and the open daily disagree about the cutoff",
    ).toBe(Boolean(daily.billingWeekLate));
  });
});

/**
 * Every day opens, whatever state it is in.
 *
 * "Review" and "View" are the same action wearing two labels — one for a day
 * still waiting on a decision, one for a day already decided. Nothing about
 * the status may gate whether the row opens, because the commonest reason to
 * open an approved day is to check what was approved.
 */
describe("status does not decide whether a day opens", () => {
  it("opens a submitted day and an approved day alike", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 1680, height: 1100 });

    const mine = await db.daily.findMany({
      where: { id: { in: [seeded.dailyId, seeded.bareId] } },
      select: { sheetNumber: true, status: true },
    });
    // One of each, or this proves only one branch.
    expect(new Set(mine.map((d) => d.status)).size, "both dailies share a status").toBe(2);

    for (const { sheetNumber, status } of mine) {
      await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });
      const row = page.locator("tbody tr").filter({ hasText: sheetNumber }).first();
      await row.click();
      await page.waitForTimeout(600);
      const panel = page
        .locator("div")
        .filter({ hasText: /AI review/ })
        .filter({ has: page.locator("li") })
        .last();
      expect(
        (await panel.count()) > 0 && (await panel.isVisible()),
        `a daily in "${status}" would not open`,
      ).toBe(true);
    }
  });

  it("reads as a list on a phone, with no sideways scrolling", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });

    // The table is for desks. A phone gets the card list.
    // Scoped to the card list itself. "ul > li [role=button]" also
    // matched the sidebar navigation, so .first() tapped a nav item and
    // left the page — which read as "the card did not open".
    const cards = page.locator('ul[class*="md:hidden"] > li [role=button]');
    expect(await cards.count(), "no cards rendered on a phone").toBeGreaterThan(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the phone layout scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);

    // And a card opens the same day the table would.
    await cards.first().click();
    await page.waitForTimeout(800);
    // Scoped inside the card list. The desktop table is still in the
    // DOM at this width, only hidden by CSS, so it holds a second copy of
    // the workspace — and .last() picked that invisible one.
    const panel = page
      .locator('ul[class*="md:hidden"]')
      .locator("div")
      .filter({ hasText: /AI review/ })
      .filter({ has: page.locator("li") })
      .last();
    expect((await panel.count()) > 0 && (await panel.isVisible()), "a card did not open the day").toBe(
      true,
    );
    await page.screenshot({ path: join(OUT, "dailies-phone.png"), fullPage: true });
  });
});

/**
 * The two buttons that change something.
 *
 * "Review" on the row used to only open the day — the word named a state
 * the click never produced, so a second reviewer could not tell which of
 * thirty submitted days somebody was already working. Opening is "View"
 * now, and Review is a button inside the day that moves it.
 *
 * Delete is here because it had quietly stopped working: the action
 * succeeded and the refetch returned a list without the day on it, but the
 * queue was seeded into useState and never took the correction, so the row
 * stayed and the button looked dead. Asserting on the row rather than on
 * the request is the only version of this test that would have caught it.
 */
describe("the buttons that move a daily", () => {
  it("says View on every row, whatever the status", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 1680, height: 1100 });
    await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });

    const rows = page.locator("tbody tr").filter({ has: page.locator("td p") });
    const n = await rows.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
      const last = (await rows.nth(i).locator("td").last().innerText()).trim();
      expect(last, `a row still offers "${last}"`).toBe("View");
    }
  });

  it("moves a submitted day into review, and the filter agrees", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 1680, height: 1100 });
    await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });

    const daily = await db.daily.findUnique({ where: { id: seeded.bareId } });
    expect(daily?.status, "this test needs a submitted day").toBe("Submitted");

    await page.locator("tbody tr").filter({ hasText: daily!.sheetNumber }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /^review$/i }).first().click();
    await page.waitForTimeout(1_500);

    // The database is the fact; the tab is what the office reads.
    const after = await db.daily.findUnique({ where: { id: seeded.bareId } });
    expect(after?.status, "the day did not move").toBe("In review");
    await expect
      .poll(async () => (await page.getByText(/In review\s*1/).count()) > 0, { timeout: 6_000 })
      .toBe(true);

    // Put it back, so the rest of the file sees what it expects.
    await db.daily.update({
      where: { id: seeded.bareId },
      data: { status: "Submitted", tone: "info" },
    });
  });

  it("takes a deleted daily off the queue without a reload", async () => {
    const page = (globalThis as { __page?: Page }).__page!;
    await page.setViewportSize({ width: 1680, height: 1100 });

    // A throwaway day, so nothing the other tests rely on is destroyed.
    const base = (await db.daily.findUnique({ where: { id: seeded.dailyId } }))!;
    const doomed = await db.daily.create({
      data: {
        sheetNumber: "DOOMED-0001",
        projectId: base.projectId,
        projectName: base.projectName,
        customer: base.customer,
        subcontractor: base.subcontractor,
        crew: base.crew,
        workDate: base.workDate,
        status: "Submitted",
        totalFt: 120,
      },
    });

    try {
      await page.goto(`${BASE_URL}/dailies`, { waitUntil: "networkidle" });
      const row = page.locator("tbody tr").filter({ hasText: "DOOMED-0001" });
      expect(await row.count(), "the throwaway day is not in the queue").toBeGreaterThan(0);

      await row.first().click();
      await page.waitForTimeout(600);
      // Two presses: the first asks the server what the delete would take.
      const bin = page.getByRole("button", { name: /delete this daily|delete it/i }).first();
      await bin.click();
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: /delete it/i }).first().click();

      // The row has to leave the screen on its own.
      await expect
        .poll(() => page.locator("tbody tr").filter({ hasText: "DOOMED-0001" }).count(), {
          timeout: 15_000,
        })
        .toBe(0);
      expect(await db.daily.findUnique({ where: { id: doomed.id } })).toBeNull();
    } finally {
      await db.daily.delete({ where: { id: doomed.id } }).catch(() => undefined);
    }
  });
});
