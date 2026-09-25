/**
 * The management side of Workforce: who may open it, what it shows, and what
 * it must never contain.
 *
 * Everything goes through the running server under a real session. The
 * queries behind these pages reach Prisma, so importing them into the vitest
 * process would hand them a production connection — the tenancy system
 * refuses it, and that refusal is the reminder rather than something to work
 * around.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { get, pageText, sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

let admin = "";
let employeeSession = "";
let otherEmployeeSession = "";
let crew = "";

let myEntryId = "";
let theirEntryId = "";
let projectName = "";

beforeAll(async () => {
  admin = await sessionCookie(tenant.staffUserId, "ADMIN");
  crew = await sessionCookie(tenant.crews[0].userId, "SUBCONTRACTOR");

  const project = (await db.project.findFirst({ select: { id: true, name: true } }))!;
  projectName = project.name;

  // Two employees with logins, each with a finished shift of their own.
  const mine = await makeEmployee("Tyler Manager-Test", project.id);
  const theirs = await makeEmployee("Brandon Manager-Test", project.id);
  employeeSession = mine.session;
  otherEmployeeSession = theirs.session;
  myEntryId = mine.entryId;
  theirEntryId = theirs.entryId;

  await get(BASE_URL, "/workforce", admin);
}, 240_000);

async function makeEmployee(name: string, projectId: string) {
  const user = await db.user.create({
    data: { email: `${name.replace(/\W+/g, ".")}.${Date.now()}@example.invalid`, name, role: "EMPLOYEE" },
  });
  const employee = await db.employee.create({ data: { name, title: "Operator", userId: user.id } });
  await db.employeeProject.create({ data: { employeeId: employee.id, projectId } });

  const start = new Date("2026-09-25T11:00:00Z");
  const end = new Date("2026-09-25T21:00:00Z");
  const entry = await db.timeEntry.create({
    data: {
      employeeId: employee.id,
      projectId,
      projectName: (await db.project.findUnique({ where: { id: projectId }, select: { name: true } }))!.name,
      clockInAt: start,
      clockOutAt: end,
      workDate: "2026-09-25",
      durationSeconds: 10 * 3600,
      status: "COMPLETE",
      clockInLocationOk: true,
      clockOutLocationOk: true,
    },
  });

  /**
   * A shift with a deliberate hole in it.
   *
   * Points every five minutes for the first hour, then nothing for
   * thirty-four minutes, then points again. That is the shape the map has to
   * draw as two segments and the summary has to call one interruption.
   */
  const points: { at: Date; kind: "CLOCK_IN" | "PERIODIC" | "CLOCK_OUT" }[] = [];
  points.push({ at: start, kind: "CLOCK_IN" });
  for (let m = 5; m <= 60; m += 5) points.push({ at: new Date(start.getTime() + m * 60_000), kind: "PERIODIC" });
  for (let m = 94; m <= 120; m += 5) points.push({ at: new Date(start.getTime() + m * 60_000), kind: "PERIODIC" });
  points.push({ at: end, kind: "CLOCK_OUT" });

  await db.timeEntryLocation.createMany({
    data: points.map((p, i) => ({
      timeEntryId: entry.id,
      capturedAt: p.at,
      latitude: 33.9 + i * 0.0002,
      longitude: -83.4,
      accuracyMeters: 18,
      kind: p.kind,
    })),
  });

  return { session: await sessionCookie(user.id, "EMPLOYEE"), employeeId: employee.id, entryId: entry.id };
}

describe("who may open the manager's Workforce", () => {
  it("serves it to an administrator", async () => {
    const r = await get(BASE_URL, "/workforce", admin);
    expect(r.status).toBe(200);
    expect(pageText(r), "the workforce page did not render").toContain("Clocked in");
  });

  it("refuses an employee", async () => {
    const r = await get(BASE_URL, "/workforce", employeeSession);
    expect(pageText(r).trim(), "an employee reached manager Workforce").toBe("/time-clock");
  });

  it("refuses a subcontractor", async () => {
    const r = await get(BASE_URL, "/workforce", crew);
    expect(pageText(r).trim(), "a crew reached manager Workforce").toBe("/dailies");
  });
});

describe("one employee's timesheet is not another's", () => {
  it("lets an employee open their own, on their own route", async () => {
    // Not /workforce/timesheets/[id]: that address is management's and the
    // middleware refuses an employee before the page runs, which is correct
    // and stays that way. The component is shared; the route is not.
    const r = await get(BASE_URL, `/my-timesheets/${myEntryId}`, employeeSession);
    expect(r.status, "an employee could not open their own shift").toBe(200);
    expect(pageText(r)).toContain("Location coverage");
  });

  it("keeps an employee out of the manager's route even for their own shift", async () => {
    const r = await get(BASE_URL, `/workforce/timesheets/${myEntryId}`, employeeSession);
    expect(pageText(r).trim(), "an employee reached a management address").toBe("/time-clock");
  });

  it("refuses an employee somebody else's", async () => {
    const r = await get(BASE_URL, `/my-timesheets/${theirEntryId}`, employeeSession);
    const body = pageText(r);
    expect(body, "an employee read another employee's timesheet").not.toContain("Location coverage");
  });

  it("refuses an employee another employee's location history", async () => {
    // The map data travels inside the same page, so the refusal above is what
    // protects it — asserted separately because it is what would matter most
    // if it leaked.
    const r = await get(BASE_URL, `/my-timesheets/${theirEntryId}`, employeeSession);
    expect(pageText(r), "another employee's positions were served").not.toContain("Timeline");
  });

  it("lets an administrator open either", async () => {
    for (const id of [myEntryId, theirEntryId]) {
      const r = await get(BASE_URL, `/workforce/timesheets/${id}`, admin);
      expect(r.status).toBe(200);
      expect(pageText(r)).toContain("Location coverage");
    }
  });
});

describe("what the timesheet shows", () => {
  it("reports the interruption and does not hide it", async () => {
    const body = pageText(await get(BASE_URL, `/workforce/timesheets/${myEntryId}`, admin));
    expect(body, "the gap was not stated in the timeline")
      .toContain("Location reporting unavailable");
    // 60 -> 94 minutes is 34, which is what both the map and the summary use.
    expect(body).toMatch(/34 min/);
  });

  it("shows coverage from the shared helper", async () => {
    const body = pageText(await get(BASE_URL, `/workforce/timesheets/${myEntryId}`, admin));
    expect(body).toContain("Location coverage");
    expect(body).toContain("Interruptions");
    expect(body).toContain("Longest gap");
  });

  it("says plainly that coverage is not attendance", async () => {
    const body = pageText(await get(BASE_URL, `/workforce/timesheets/${myEntryId}`, admin));
    expect(body, "the page presents coverage without qualifying it")
      .toContain("not a record of whether somebody was working");
  });

  it("says the line is not the road travelled", async () => {
    const body = pageText(await get(BASE_URL, `/workforce/timesheets/${myEntryId}`, admin));
    expect(body).toContain("not the exact road or path travelled");
  });
});

describe("Workforce carries no money", () => {
  const FINANCIAL = [
    "billableAmount",
    "grossMargin",
    "subCost",
    "customerRate",
    "unpricedCodes",
    "retainage",
  ];

  it("returns no financial field on the manager page", async () => {
    const body = (await get(BASE_URL, "/workforce", admin)).body;
    for (const f of FINANCIAL) {
      expect(body, `the workforce page carries ${f}`).not.toContain(f);
    }
  });

  it("returns no financial field on a timesheet", async () => {
    const body = (await get(BASE_URL, `/workforce/timesheets/${myEntryId}`, admin)).body;
    for (const f of FINANCIAL) {
      expect(body, `the timesheet carries ${f}`).not.toContain(f);
    }
  });

  it("returns no financial field on an employee's own history", async () => {
    const body = (await get(BASE_URL, "/my-timesheets", employeeSession)).body;
    for (const f of FINANCIAL) {
      expect(body, `my-timesheets carries ${f}`).not.toContain(f);
    }
  });
});

describe("an employee's own history", () => {
  it("shows them their own shifts", async () => {
    const r = await get(BASE_URL, "/my-timesheets", employeeSession);
    expect(r.status).toBe(200);
    expect(pageText(r)).toContain("My timesheets");
    expect(pageText(r), "their own project was not named").toContain(projectName);
  });

  it("shows one employee nothing of the other's", async () => {
    const mineBody = pageText(await get(BASE_URL, "/my-timesheets", employeeSession));
    const theirsBody = pageText(await get(BASE_URL, "/my-timesheets", otherEmployeeSession));
    // Both worked the same job on the same day, so the distinguishing fact is
    // the entry id each page links to.
    expect(mineBody).toContain(myEntryId);
    expect(mineBody, "one employee's history linked to another's shift").not.toContain(theirEntryId);
    expect(theirsBody).toContain(theirEntryId);
    expect(theirsBody).not.toContain(myEntryId);
  });
});
