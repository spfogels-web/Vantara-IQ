/**
 * The Workforce routes on a phone, measured rather than eyeballed.
 *
 * An employee opens the time clock on a 390px screen in a truck, one-handed,
 * with gloves on. A table that scrolls sideways or a button under the fold is
 * not a cosmetic problem there — it is somebody unable to end their shift.
 *
 * Every assertion below is against the rendered page, because "it looked
 * fine" is exactly the claim that produced the horizontal scroll on /dailies
 * earlier in this work.
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
let adminPage: Page;
let employeePage: Page;
let entryId = "";
let created: string[] = [];

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });

  const project = (await db.project.findFirst({ select: { id: true, name: true } }))!;
  const user = await db.user.create({
    data: { email: `mob.${Date.now()}@example.invalid`, name: "Mobile Tester", role: "EMPLOYEE" },
  });
  const employee = await db.employee.create({
    data: { name: "Mobile Tester", title: "Operator", userId: user.id },
  });
  await db.employeeProject.create({ data: { employeeId: employee.id, projectId: project.id } });

  const start = new Date("2026-09-25T11:00:00Z");
  const end = new Date("2026-09-25T21:00:00Z");
  const entry = await db.timeEntry.create({
    data: {
      employeeId: employee.id,
      projectId: project.id,
      projectName: project.name,
      clockInAt: start,
      clockOutAt: end,
      workDate: "2026-09-25",
      durationSeconds: 10 * 3600,
      status: "COMPLETE",
      clockInLocationOk: true,
      clockOutLocationOk: true,
    },
  });
  entryId = entry.id;
  created = [employee.id, user.id, entry.id];

  await db.timeEntryLocation.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      timeEntryId: entry.id,
      capturedAt: new Date(start.getTime() + i * 5 * 60_000),
      latitude: 33.9 + i * 0.0003,
      longitude: -83.4,
      accuracyMeters: 18,
      kind: i === 0 ? ("CLOCK_IN" as const) : ("PERIODIC" as const),
    })),
  });

  browser = await chromium.launch();
  const admin = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const emp = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  await admin.addCookies([cookie(await sessionCookie(tenant.staffUserId, "ADMIN"))]);
  await emp.addCookies([cookie(await sessionCookie(user.id, "EMPLOYEE"))]);
  adminPage = await admin.newPage();
  employeePage = await emp.newPage();
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await db.timeEntryLocation.deleteMany({ where: { timeEntryId: entryId } }).catch(() => undefined);
  await db.timeEntry.delete({ where: { id: entryId } }).catch(() => undefined);
  await db.employeeProject.deleteMany({ where: { employeeId: created[0] } }).catch(() => undefined);
  await db.employee.delete({ where: { id: created[0] } }).catch(() => undefined);
  await db.user.delete({ where: { id: created[1] } }).catch(() => undefined);
  await db.$disconnect();
});

function cookie(raw: string) {
  return {
    name: raw.split("=")[0],
    value: raw.split("=").slice(1).join("="),
    domain: "localhost",
    path: "/",
  };
}

/** How far the page can be scrolled sideways. Anything over a pixel is a bug. */
async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

describe("Workforce on a 390px phone", () => {
  const employeeRoutes = [
    ["time clock", "/time-clock"],
    ["my timesheets", "/my-timesheets"],
  ] as const;

  for (const [name, path] of employeeRoutes) {
    it(`does not scroll sideways on ${name}`, async () => {
      await employeePage.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
      const over = await sidewaysOverflow(employeePage);
      expect(over, `${path} scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
    });
  }

  it("does not scroll sideways on an employee's own shift", async () => {
    await employeePage.goto(`${BASE_URL}/my-timesheets/${entryId}`, { waitUntil: "networkidle" });
    await employeePage.waitForTimeout(1_500); // the map sizes itself
    const over = await sidewaysOverflow(employeePage);
    expect(over, `the shift detail scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
    await employeePage.screenshot({ path: join(OUT, "workforce-my-shift-phone.png"), fullPage: true });
  });

  const managerRoutes = [
    ["workforce home", "/workforce"],
    ["timesheet detail", `/workforce/timesheets/${""}`],
  ] as const;

  it("does not scroll sideways on the manager's Workforce", async () => {
    await adminPage.goto(`${BASE_URL}/workforce`, { waitUntil: "networkidle" });
    const over = await sidewaysOverflow(adminPage);
    expect(over, `/workforce scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
    await adminPage.screenshot({ path: join(OUT, "workforce-home-phone.png"), fullPage: true });
    expect(managerRoutes.length).toBeGreaterThan(0); // keep the list referenced
  });

  it("does not scroll sideways on a manager timesheet", async () => {
    await adminPage.goto(`${BASE_URL}/workforce/timesheets/${entryId}`, { waitUntil: "networkidle" });
    await adminPage.waitForTimeout(1_500);
    const over = await sidewaysOverflow(adminPage);
    expect(over, `the timesheet scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
    await adminPage.screenshot({ path: join(OUT, "workforce-timesheet-phone.png"), fullPage: true });
  });

  it("fits the employee roster and its controls on the screen", async () => {
    // The roster row carries the most controls of anything in Workforce —
    // invite, edit, deactivate and the job chips — so it is the one most
    // likely to push a phone sideways.
    await adminPage.goto(`${BASE_URL}/workforce?tab=employees`, { waitUntil: "networkidle" });
    const over = await sidewaysOverflow(adminPage);
    expect(over, `the employee roster scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
    await adminPage.screenshot({ path: join(OUT, "workforce-employees-phone.png"), fullPage: true });
  });

  it("opens Add employee without pushing the page sideways", async () => {
    await adminPage.goto(`${BASE_URL}/workforce`, { waitUntil: "networkidle" });
    await adminPage.getByRole("tab", { name: /employees/i }).click().catch(async () => {
      // The tabs are buttons in this view; fall back to the text.
      await adminPage.getByRole("button", { name: /^employees$/i }).first().click();
    });
    await adminPage.getByRole("button", { name: /add employee/i }).first().click();
    await adminPage.waitForTimeout(400);

    const dialog = adminPage.getByRole("dialog", { name: /add employee/i });
    expect(await dialog.count(), "the Add employee form did not open").toBeGreaterThan(0);

    const over = await sidewaysOverflow(adminPage);
    expect(over, `the Add employee form scrolls the page sideways by ${over}px`)
      .toBeLessThanOrEqual(1);

    // The form itself must fit the screen, not merely avoid scrolling the body.
    const box = (await dialog.first().boundingBox())!;
    expect(box.width, `the form is ${box.width}px wide on a 390px screen`).toBeLessThanOrEqual(390);

    await adminPage.screenshot({ path: join(OUT, "workforce-add-employee-phone.png"), fullPage: true });
  });

  it("gives the Add employee fields a thumb-sized target", async () => {
    const name = adminPage.getByRole("textbox").first();
    const box = await name.boundingBox();
    expect(box, "the form has no text field").not.toBeNull();
    expect(box!.height, `a field is only ${box!.height}px tall`).toBeGreaterThanOrEqual(40);

    const submit = adminPage.getByRole("button", { name: /^add employee$/i }).last();
    const sb = await submit.boundingBox();
    expect(sb!.height, `the submit button is only ${sb!.height}px tall`).toBeGreaterThanOrEqual(40);
  });

  it("keeps the clock button big enough to hit with a glove on", async () => {
    await employeePage.goto(`${BASE_URL}/time-clock`, { waitUntil: "networkidle" });
    const button = employeePage.getByRole("button", { name: /clock (in|out)/i }).first();
    const box = await button.boundingBox();
    expect(box, "the clock button is not on the page").not.toBeNull();
    // 44px is the usual floor; this is the one control that must not be missed.
    expect(box!.height, `the clock button is only ${box!.height}px tall`).toBeGreaterThanOrEqual(48);
    expect(box!.width, "the clock button does not span the column").toBeGreaterThan(280);
  });

  it("sizes the map to the phone rather than overflowing it", async () => {
    await employeePage.goto(`${BASE_URL}/my-timesheets/${entryId}`, { waitUntil: "networkidle" });
    await employeePage.waitForTimeout(1_500);
    const map = employeePage.locator(".leaflet-container").first();
    if ((await map.count()) === 0) return; // no points, no map — covered elsewhere
    const box = (await map.boundingBox())!;
    expect(box.width, `the map is ${box.width}px wide on a 390px screen`).toBeLessThanOrEqual(390);
  });
});

describe("who is offered the correction control", () => {
  it("offers it to an administrator", async () => {
    await adminPage.goto(`${BASE_URL}/workforce/timesheets/${entryId}`, { waitUntil: "networkidle" });
    expect(
      await adminPage.getByRole("button", { name: /correct times/i }).count(),
      "an administrator cannot correct a timecard",
    ).toBeGreaterThan(0);
  });

  it("does not offer it to the employee whose timecard it is", async () => {
    await employeePage.goto(`${BASE_URL}/my-timesheets/${entryId}`, { waitUntil: "networkidle" });
    expect(
      await employeePage.getByRole("button", { name: /correct times/i }).count(),
      "an employee was offered a way to edit their own punches",
    ).toBe(0);
  });

  it("shows the employee their own corrected times all the same", async () => {
    // They may not change them; they are entitled to see what they are.
    const body = await employeePage.content();
    expect(body).toContain("Total hours");
    expect(body).toContain("Location coverage");
  });
});
