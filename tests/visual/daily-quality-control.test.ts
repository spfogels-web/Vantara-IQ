/**
 * The daily sheet, and the fact that a crew is shown the same one the office is.
 *
 * The Quality Control panel asks for the OSP guide with a HEAD request and
 * renders neither the link nor the example photographs unless the reply is
 * really a PDF. Middleware was bouncing a crew's request for /qc to /dailies,
 * so staff read the standard and the crews held to it saw an empty panel —
 * which looked like a missing feature rather than a redirect.
 *
 * Asserted per role against the rendered page, because "both roles see the
 * same thing" is not a claim the markup can make on its own.
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
let admin: Page;
let sub: Page;
let subUserId = "";
let projectId = "";
let crewId = "";

function cookieOf(raw: string) {
  return { name: raw.split("=")[0], value: raw.split("=").slice(1).join("="), domain: "localhost", path: "/" };
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  const project = (await db.project.findFirst({ select: { id: true } }))!;
  projectId = project.id;
  // A crew that is actually on this job. getProject scopes to the caller, so
  // an unassigned login gets notFound rather than the sheet — which is
  // correct, and was my test setup rather than the product.
  const crew = (await db.subcontractor.findFirst({ select: { id: true } }))!;
  crewId = crew.id;
  await db.projectCrew
    .create({ data: { projectId: project.id, subcontractorId: crew.id } })
    .catch(() => undefined);
  const u = await db.user.create({
    data: {
      email: `qcv.${Date.now()}@example.invalid`,
      name: "Crew Login",
      role: "SUBCONTRACTOR",
      subcontractorId: crew.id,
    },
  });
  subUserId = u.id;

  browser = await chromium.launch();
  const a = await browser.newContext({ viewport: { width: 1536, height: 1200 }, colorScheme: "dark" });
  const s = await browser.newContext({ viewport: { width: 1536, height: 1200 }, colorScheme: "dark" });
  a.addCookies([cookieOf(await sessionCookie(tenant.staffUserId, "ADMIN"))]);
  s.addCookies([cookieOf(await sessionCookie(u.id, "SUBCONTRACTOR"))]);
  admin = await a.newPage();
  sub = await s.newPage();
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await db.user.delete({ where: { id: subUserId } }).catch(() => undefined);
  if (crewId) {
    await db.projectCrew
      .deleteMany({ where: { projectId, subcontractorId: crewId } })
      .catch(() => undefined);
  }
  await db.$disconnect();
});

describe("the daily sheet", () => {
  it("labels the first three material columns", async () => {
    await admin.goto(`${BASE_URL}/dailies/sheet/${projectId}`, { waitUntil: "networkidle" });
    for (const label of ["Tick marks", "In", "Out"]) {
      expect(
        await admin.locator(`th:has-text("${label}")`).count(),
        `the material header has no "${label}" column`,
      ).toBeGreaterThan(0);
    }
    const th = admin.locator(`th:has-text("Tick marks")`).first();
    await th.scrollIntoViewIfNeeded();
    await admin.waitForTimeout(300);
    const table = admin.locator("table").last();
    await table.screenshot({ path: join(OUT, "daily-material-header.png") }).catch(async () => {
      await admin.screenshot({ path: join(OUT, "daily-material-header.png"), fullPage: false });
    });
  });

  it("shows the guide and the tick-mark rule to staff", async () => {
    const body = await admin.content();
    expect(body, "the tick-mark rule is missing").toContain("Tick marks — main line");
    await admin.waitForTimeout(1500); // the guide's HEAD check
    expect(
      await admin.locator("text=Kinetic OSP Quality Assurance Guide").count(),
      "staff cannot see the guide",
    ).toBeGreaterThan(0);
  });

  it("shows the same guide and rule to a subcontractor", async () => {
    await sub.goto(`${BASE_URL}/dailies/sheet/${projectId}`, { waitUntil: "networkidle" });
    const body = await sub.content();
    expect(body, "a crew is not told about tick marks").toContain("Tick marks — main line");
    await sub.waitForTimeout(1500);
    expect(
      await sub.locator("text=Kinetic OSP Quality Assurance Guide").count(),
      "a crew cannot see the guide — this was the whole defect",
    ).toBeGreaterThan(0);
    expect(
      await sub.locator("text=What a finished one looks like").count(),
      "a crew cannot see the example photographs",
    ).toBeGreaterThan(0);
    await sub.screenshot({ path: join(OUT, "daily-qc-sub.png"), fullPage: false });
  });
});
