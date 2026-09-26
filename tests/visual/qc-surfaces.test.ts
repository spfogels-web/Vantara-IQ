/**
 * The four surfaces, and the one thing that must never appear on one of them.
 *
 * Admin project, crew project, admin daily, crew daily. The same standard is
 * supposed to reach all four from one source — and a job that is not built to
 * Kinetic's specification must carry none of Kinetic's manual, pages or name
 * on any of them.
 *
 * Rendered rather than reasoned about: "both roles see the same thing" is not
 * a claim the markup can make on its own.
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
let crew: Page;
let phone: Page;

let winProjectId = "";
let traProjectId = "";
let crewId = "";
let crewUserId = "";
/**
 * Only the pairings this file created.
 *
 * create().catch() silently does nothing when the row already exists, so an
 * unconditional delete in afterAll removes fixture assignments other suites
 * depend on — which is exactly what it did: transactions.test.ts began
 * failing with "crew has no assignments".
 */
const madeAssignments: string[] = [];

function cookieOf(raw: string) {
  return { name: raw.split("=")[0], value: raw.split("=").slice(1).join("="), domain: "localhost", path: "/" };
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });

  // Two jobs whose customers differ, so "Kinetic does not leak" is a real
  // comparison rather than an assertion about one page.
  const ps = await db.project.findMany({ select: { id: true }, take: 2 });
  winProjectId = ps[0].id;
  traProjectId = ps[1]?.id ?? ps[0].id;

  const win = await db.customer.create({
    data: {
      name: "QC Kinetic Prime", shortCode: "WIN", industry: "Telecom", tone: "info",
      status: "Active", logoTint: "blue", location: "GA",
    },
  });
  const tra = await db.customer.create({
    data: {
      name: "QC Other Prime", shortCode: "TRA", industry: "Telecom", tone: "info",
      status: "Active", logoTint: "green", location: "GA",
    },
  });
  await db.project.update({ where: { id: winProjectId }, data: { customerId: win.id } });
  if (traProjectId !== winProjectId) {
    await db.project.update({ where: { id: traProjectId }, data: { customerId: tra.id } });
  }

  const sub = (await db.subcontractor.findFirst({ select: { id: true } }))!;
  crewId = sub.id;
  for (const pid of [winProjectId, traProjectId]) {
    const made = await db.projectCrew
      .create({ data: { projectId: pid, subcontractorId: sub.id } })
      .catch(() => null);
    if (made) madeAssignments.push(pid);
  }
  const u = await db.user.create({
    data: {
      email: `qcs.${Date.now()}@example.invalid`, name: "Crew Login",
      role: "SUBCONTRACTOR", subcontractorId: sub.id,
    },
  });
  crewUserId = u.id;

  browser = await chromium.launch();
  const a = await browser.newContext({ viewport: { width: 1500, height: 1200 }, colorScheme: "dark" });
  const c = await browser.newContext({ viewport: { width: 1500, height: 1200 }, colorScheme: "dark" });
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" });
  a.addCookies([cookieOf(await sessionCookie(tenant.staffUserId, "ADMIN"))]);
  c.addCookies([cookieOf(await sessionCookie(u.id, "SUBCONTRACTOR"))]);
  m.addCookies([cookieOf(await sessionCookie(u.id, "SUBCONTRACTOR"))]);
  admin = await a.newPage();
  crew = await c.newPage();
  phone = await m.newPage();
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await db.user.delete({ where: { id: crewUserId } }).catch(() => undefined);
  for (const pid of madeAssignments) {
    await db.projectCrew
      .deleteMany({ where: { projectId: pid, subcontractorId: crewId } })
      .catch(() => undefined);
  }
  for (const pid of [winProjectId, traProjectId]) {
    await db.project.update({ where: { id: pid }, data: { customerId: null } }).catch(() => undefined);
  }
  await db.customer.deleteMany({ where: { name: { in: ["QC Kinetic Prime", "QC Other Prime"] } } }).catch(() => undefined);
  await db.$disconnect();
});

const KINETIC_MARKERS = ["Kinetic OSP Quality Assurance Guide", "QCC p25", "quality-assurance-guide.pdf"];

describe("the standard reaches all four surfaces", () => {
  it("admin project", async () => {
    await admin.goto(`${BASE_URL}/projects/${winProjectId}`, { waitUntil: "networkidle" });
    const b = await admin.content();
    expect(b, "no build standards on the admin project").toMatch(/Project QC (&|&amp;) build standards/);
    expect(b, "no pre-job sequence").toContain("Before work begins");
    await admin.screenshot({ path: join(OUT, "qc-admin-project.png"), fullPage: false });
  });

  it("subcontractor project", async () => {
    await crew.goto(`${BASE_URL}/projects/${winProjectId}`, { waitUntil: "networkidle" });
    const b = await crew.content();
    expect(b, "no build standards on the crew project").toMatch(/Project QC (&|&amp;) build standards/);
    expect(b, "no pre-job sequence for the crew").toContain("Before work begins");
    expect(b, "the crew is not told pre-construction comes first").toMatch(/pre-construction required/i);
    await crew.screenshot({ path: join(OUT, "qc-crew-project.png"), fullPage: false });
  });

  it("admin daily", async () => {
    await admin.goto(`${BASE_URL}/dailies/sheet/${winProjectId}`, { waitUntil: "networkidle" });
    const b = await admin.content();
    expect(b, "no QC reminder on the admin daily").toMatch(/quality control requirements/i);
    expect(b).toMatch(/What acceptable work (&|&amp;) photos look like/);
    await admin.screenshot({ path: join(OUT, "qc-admin-daily.png"), fullPage: false });
  });

  it("subcontractor daily", async () => {
    await crew.goto(`${BASE_URL}/dailies/sheet/${winProjectId}`, { waitUntil: "networkidle" });
    const b = await crew.content();
    expect(b, "no QC reminder on the crew daily").toMatch(/quality control requirements/i);
    expect(b).toMatch(/What acceptable work (&|&amp;) photos look like/);
    expect(b, "the crew is not asked to confirm anything").toContain("QC confirmation");
    await crew.screenshot({ path: join(OUT, "qc-crew-daily.png"), fullPage: false });
  });
});

describe("a non-Kinetic job carries no Kinetic content", () => {
  it("not on the project", async () => {
    if (traProjectId === winProjectId) return;
    await crew.goto(`${BASE_URL}/projects/${traProjectId}`, { waitUntil: "networkidle" });
    await crew.waitForTimeout(600);
    const b = await crew.content();
    for (const m of KINETIC_MARKERS) {
      expect(b, `"${m}" leaked onto a non-Kinetic project`).not.toContain(m);
    }
    // But our own rules are still there.
    expect(b).toMatch(/Project QC (&|&amp;) build standards/);
  });

  it("not on the daily", async () => {
    if (traProjectId === winProjectId) return;
    await crew.goto(`${BASE_URL}/dailies/sheet/${traProjectId}`, { waitUntil: "networkidle" });
    await crew.waitForTimeout(600);
    const b = await crew.content();
    for (const m of KINETIC_MARKERS) {
      expect(b, `"${m}" leaked onto a non-Kinetic daily`).not.toContain(m);
    }
    expect(b, "the crew lost the QC reminder entirely").toMatch(/quality control requirements/i);
  });

  it("and the Kinetic job still has it", async () => {
    await crew.goto(`${BASE_URL}/projects/${winProjectId}`, { waitUntil: "networkidle" });
    await crew.waitForTimeout(600);
    const b = await crew.content();
    // The other half of the comparison: if this fails the leak test above
    // passes for the wrong reason.
    expect(b, "the Kinetic job lost its manual, so the leak test proves nothing")
      .toContain("Open QCC Manual");
  });
});

describe("staff-only controls", () => {
  it("are offered to an administrator", async () => {
    await admin.goto(`${BASE_URL}/projects/${winProjectId}`, { waitUntil: "networkidle" });
    const b = await admin.content();
    expect(b).toMatch(/Cover photo|Change photo/);
    expect(b).toContain("Delete");
  });

  it("are not offered to a crew", async () => {
    await crew.goto(`${BASE_URL}/projects/${winProjectId}`, { waitUntil: "networkidle" });
    const b = await crew.content();
    expect(b, "a crew was offered Cover photo").not.toMatch(/Cover photo|Change photo/);
    expect(b, "a crew was offered Delete").not.toMatch(/>\s*Delete\s*</);
    expect(b, "a crew was offered the edit link").not.toContain(`/projects/${winProjectId}/edit`);
  });
});

describe("on a phone", () => {
  for (const [name, path] of [
    ["the project", () => `/projects/${winProjectId}`],
    ["the daily", () => `/dailies/sheet/${winProjectId}`],
  ] as const) {
    it(`does not scroll ${name} sideways`, async () => {
      await phone.goto(`${BASE_URL}${path()}`, { waitUntil: "networkidle" });
      await phone.waitForTimeout(500);
      const over = await phone.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${name} scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
      await phone.screenshot({
        path: join(OUT, `qc-phone-${name.replace(/\s/g, "-")}.png`),
        fullPage: false,
      });
    });
  }
});
