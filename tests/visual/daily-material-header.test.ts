/**
 * The daily's material header, and the standard on a job nobody linked.
 *
 * The four-surface coverage — admin and crew, project and daily, Kinetic and
 * not — lives in qc-surfaces.test.ts, which sets up explicit customers so the
 * comparison is a real one. What is left here is what that file does not
 * cover:
 *
 *   the three named material columns, and
 *   what a job with NO customer linked resolves to, which must never be
 *   another carrier's specification.
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
let projectId = "";

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  // Deliberately a project with no customer attached — that is the case
  // under test in the second block.
  const project =
    (await db.project.findFirst({ where: { customerId: null }, select: { id: true } })) ??
    (await db.project.findFirst({ select: { id: true } }))!;
  projectId = project.id;

  browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1500, height: 1200 },
    colorScheme: "dark",
  });
  const raw = await sessionCookie(tenant.staffUserId, "ADMIN");
  await ctx.addCookies([
    {
      name: raw.split("=")[0],
      value: raw.split("=").slice(1).join("="),
      domain: "localhost",
      path: "/",
    },
  ]);
  admin = await ctx.newPage();
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await db.$disconnect();
});

describe("the material header", () => {
  it("names the first three columns", async () => {
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
    await admin
      .locator("table")
      .last()
      .screenshot({ path: join(OUT, "daily-material-header.png") })
      .catch(() => undefined);
  });
});

describe("a job with no customer linked", () => {
  it("is not given another carrier's specification", async () => {
    const body = await admin.content();
    // The resolver must not fall back to Kinetic when it cannot tell whose
    // job this is: showing Windstream's manual on a job that is not
    // Windstream's is worse than showing only our own rules.
    expect(body, "an unlinked job was offered the Kinetic manual").not.toContain(
      "Kinetic OSP Quality Assurance Guide",
    );
    expect(body, "an unlinked job quoted the QCC manual").not.toMatch(/QCC p\d/);
  });

  it("still carries our own requirements", async () => {
    const body = await admin.content();
    expect(body, "the tick-mark rule went with the carrier's").toMatch(/Tick marks — main line/);
    expect(body, "nothing is attributed to Fortitude").toMatch(/Fortitude/);
    expect(body, "the QC reminder is missing").toMatch(/quality control requirements/i);
  });
});
