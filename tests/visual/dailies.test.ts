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
