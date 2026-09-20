/**
 * The visual checkpoint: photographs of the real page, not a mockup of it.
 *
 * This drives a real browser against the real server the rest of the suite
 * uses, signed in as real staff, reading the seeded tenant's real rows. That
 * matters more than it sounds: a hand-built preview of the design would agree
 * with itself no matter what the application actually renders, which is
 * exactly the kind of green that means nothing.
 *
 * It seeds a handful of evidence rows first, because a gallery with nothing in
 * it shows an empty state rather than the thing being reviewed.
 *
 * Run it on its own — `npx vitest run tests/visual` — and look at the PNGs it
 * writes. It asserts almost nothing; the eye is the assertion here.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const OUT = join(process.cwd(), "tests", "visual", "screens");
const tenant = fixtures().a;
const db = testClient();

let browser: Browser;
let cookie = "";

/** A route with a plausible amount on it, so the gallery is worth looking at. */
async function seedEvidence() {
  const existing = await db.projectPhoto.count({ where: { projectId: tenant.projectId } });
  if (existing > 0) return;

  const base = { lat: 34.5034, lng: -82.6501 };
  const rows = Array.from({ length: 14 }, (_, i) => {
    const isVideo = i === 4 || i === 9;
    const stage =
      i < 4 ? "PRE_CONSTRUCTION" : i < 11 ? "WORK_RECORD" : i < 13 ? "DIRECTION" : "CLOSEOUT";
    // Some carry a fix and some do not, which is the honest mix and the one
    // the viewer has to tell apart.
    const located = i % 3 !== 0;
    return {
      projectId: tenant.projectId,
      url: `https://placehold.co/800x600/1a1d23/6b7280.png?text=Field+${i + 1}`,
      mediaType: isVideo ? "video/mp4" : "image/png",
      sizeBytes: 480_000,
      kind: (isVideo ? "VIDEO" : "PHOTO") as "VIDEO" | "PHOTO",
      source: (i % 2 ? "CAMERA" : "LIBRARY") as "CAMERA" | "LIBRARY",
      stage: stage as "PRE_CONSTRUCTION" | "WORK_RECORD" | "DIRECTION" | "CLOSEOUT",
      purpose: (stage === "DIRECTION" ? "DIRECTION" : "RECORD") as "DIRECTION" | "RECORD",
      category: (i < 4 ? "DRIVEWAY" : "UTILITY_PEDESTAL") as "DRIVEWAY" | "UTILITY_PEDESTAL",
      existingDamage: i === 1 || i === 2,
      damageNote: i === 1 ? "Apron already cracked corner to corner" : "",
      caption: i === 1 ? "Cracked apron, 214 Hurricane Grove" : `Pedestal ${i + 1}`,
      capturedAt: new Date(Date.UTC(2026, 8, 22, 14 + (i % 8), i * 3)),
      capturedAtSource: (i % 2 ? "camera" : "exif") as string,
      lat: located ? base.lat + i * 0.0004 : null,
      lng: located ? base.lng + i * 0.0006 : null,
      accuracyM: located ? 4 + (i % 5) : null,
      locationSource: located ? (i % 2 ? "device" : "exif") : "",
      uploadedBy: "Dana Whitfield",
      dailySheetId: i < 4 || i > 10 ? null : tenant.dailySheetId,
    };
  });

  await db.projectPhoto.createMany({ data: rows });
}

async function open(width: number, height: number): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  await context.addCookies([
    {
      name: cookie.split("=")[0],
      value: cookie.split("=").slice(1).join("="),
      domain: "localhost",
      path: "/",
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/projects/${tenant.projectId}`, { waitUntil: "networkidle" });
  return page;
}

/** Open one accordion row by its visible title. */
async function expand(page: Page, title: string) {
  const row = page.getByRole("button", { name: new RegExp(title, "i") }).first();
  await row.click();
  await page.waitForTimeout(700);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  await seedEvidence();
  cookie = await sessionCookie(tenant.staffUserId, "ADMIN");
  browser = await chromium.launch();
}, 240_000);

afterAll(async () => {
  await browser?.close();
  await db.$disconnect();
});

describe("the project command page, photographed", () => {
  it("1 — collapsed, desktop", async () => {
    const page = await open(1440, 1100);
    await shot(page, "1-collapsed-desktop");
    await page.context().close();
  });

  it("2 — project map & plans expanded", async () => {
    const page = await open(1440, 1100);
    await expand(page, "Project map");
    await shot(page, "2-map-expanded");
    await page.context().close();
  });

  it("3 — project evidence expanded", async () => {
    const page = await open(1440, 1100);
    await expand(page, "Project evidence");
    await shot(page, "3-evidence-expanded");
    await page.context().close();
  });

  it("4 — pre-construction evidence", async () => {
    const page = await open(1440, 1100);
    await expand(page, "Project evidence");
    const precon = page.getByText("Pre-construction documentation").first();
    await precon.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, "4-preconstruction.png") });
    await page.context().close();
  });

  it("5 — rates expanded", async () => {
    const page = await open(1440, 1100);
    await expand(page, "Rates on this job");
    await shot(page, "5-rates-expanded");
    await page.context().close();
  });

  it("6 — dailies expanded", async () => {
    const page = await open(1440, 1100);
    await expand(page, "Dailies");
    await shot(page, "6-dailies-expanded");
    await page.context().close();
  });

  it("7 — mobile", async () => {
    const page = await open(390, 844);
    await shot(page, "7-mobile");
    await page.context().close();
  });

  it("8 — tablet", async () => {
    const page = await open(834, 1112);
    await shot(page, "8-tablet");
    await page.context().close();
  });
});
