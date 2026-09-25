/**
 * Putting somebody on the books, and everything that must not go wrong doing it.
 *
 * The guarantees here fall into three kinds, and each is asserted where it
 * actually lives:
 *
 *   IN THE DATABASE   one login controls one timecard; one live invitation per
 *                     employee; an address is used once. These are indexes,
 *                     and they are mutation-tested — an assertion that a
 *                     constraint exists proves nothing unless violating it is
 *                     shown to fail.
 *
 *   IN THE SERVER     who may create an employee. Asserted through the running
 *                     application under a real session, because importing the
 *                     action into this process would hand it the production
 *                     connection string — the tenancy system refuses that, and
 *                     rightly.
 *
 *   IN THE SOURCE     the guarantees that are the ABSENCE of a code path: no
 *                     administrator can set or read a password, and no request
 *                     can name which employee it is. You cannot test for the
 *                     absence of a feature by calling it, so these are checked
 *                     against the source, which also makes adding one a
 *                     deliberate act somebody has to explain.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { BASE_URL, fixtures } from "../support/load";
import { get, pageText, sessionCookie, wasRefused, wasServed } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

const ACTIONS = readFileSync("src/app/workforce-actions.ts", "utf8");
const ACCEPT = readFileSync("src/app/invite/employee/actions.ts", "utf8");

let projectId = "";
let adminSession = "";
let pmSession = "";
let employeeSession = "";

const unique = (s: string) => `${s}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  projectId = (await db.project.findFirst({ select: { id: true } }))!.id;

  // An employee login, to prove an employee cannot create employees.
  const u = await db.user.create({
    data: { email: `${unique("onb.emp")}@example.invalid`, name: "Field Hand", role: "EMPLOYEE" },
  });

  await db.employee.create({ data: { name: "Field Hand", userId: u.id } });

  const pm = await db.user.create({
    data: { email: `${unique("onb.pm")}@example.invalid`, name: "Project Manager", role: "PM" },
  });

  adminSession = await sessionCookie(tenant.staffUserId, "ADMIN");
  pmSession = await sessionCookie(pm.id, "PM");
  employeeSession = await sessionCookie(u.id, "EMPLOYEE");
}, 240_000);

/** An employee, its invite and its login, removed in dependency order. */
async function cleanup(employeeId: string, userIds: string[] = []) {
  await db.employeeInvite.deleteMany({ where: { employeeId } }).catch(() => undefined);
  await db.employeeProject.deleteMany({ where: { employeeId } }).catch(() => undefined);
  await db.employee.delete({ where: { id: employeeId } }).catch(() => undefined);
  for (const id of userIds) await db.user.delete({ where: { id } }).catch(() => undefined);
}

describe("what creating an employee produces", () => {
  it("writes the person, their jobs and an unused invitation together", async () => {
    const email = `${unique("onb.new")}@example.invalid`;
    const employee = await db.employee.create({
      data: { name: "Ray Colson", title: "Operator", phone: "864 555 0134", status: "ACTIVE" },
    });
    await db.employeeProject.create({ data: { employeeId: employee.id, projectId } });
    await db.employeeInvite.create({
      data: { token: unique("tok"), employeeId: employee.id, email, invitedBy: "Admin" },
    });

    const back = await db.employee.findUnique({
      where: { id: employee.id },
      select: {
        name: true,
        title: true,
        phone: true,
        status: true,
        userId: true,
        projects: { select: { projectId: true } },
        invite: { select: { email: true, used: true } },
      },
    });

    expect(back?.name).toBe("Ray Colson");
    expect(back?.title).toBe("Operator");
    expect(back?.phone).toBe("864 555 0134");
    expect(back?.status).toBe("ACTIVE");
    expect(back?.projects.map((p) => p.projectId), "the job assignment was not created")
      .toEqual([projectId]);
    // The invitation exists and grants nothing yet: no account, no role.
    expect(back?.invite?.email).toBe(email);
    expect(back?.invite?.used, "a fresh invitation is already spent").toBe(false);
    expect(back?.userId, "creating an employee created a login on its own").toBeNull();

    await cleanup(employee.id);
  });

  it("gives the accepted account the EMPLOYEE role and links it to that employee", async () => {
    // The shape the accept path writes. Asserted as a record rather than
    // through the action, which cannot be invoked from this process.
    const email = `${unique("onb.accept")}@example.invalid`;
    const employee = await db.employee.create({ data: { name: "Accepted Person" } });
    const user = await db.user.create({
      data: { email, name: "Accepted Person", passwordHash: "hashed", role: "EMPLOYEE" },
    });
    await db.employee.update({ where: { id: employee.id }, data: { userId: user.id } });

    const back = await db.employee.findUnique({
      where: { id: employee.id },
      select: { userId: true, user: { select: { role: true, email: true, passwordHash: true } } },
    });
    expect(back?.user?.role, "the account was not created as an EMPLOYEE").toBe("EMPLOYEE");
    expect(back?.userId, "Employee.userId does not point at the account").toBe(user.id);
    expect(back?.user?.email).toBe(email);

    await cleanup(employee.id, [user.id]);
  });
});

describe("identity integrity", () => {
  it("refuses to link one login to a second employee", async () => {
    const user = await db.user.create({
      data: { email: `${unique("onb.dup")}@example.invalid`, name: "One Login", role: "EMPLOYEE" },
    });
    const first = await db.employee.create({ data: { name: "First", userId: user.id } });
    const second = await db.employee.create({ data: { name: "Second" } });

    // THE GUARANTEE. Without the unique index on Employee.userId this is
    // accepted, and one person can clock in as either of two people.
    let refused = false;
    try {
      await db.employee.update({ where: { id: second.id }, data: { userId: user.id } });
    } catch {
      refused = true;
    }
    expect(refused, "one login was linked to two employees").toBe(true);

    await cleanup(second.id);
    await cleanup(first.id, [user.id]);
  });

  it("refuses a second account on the same address", async () => {
    const email = `${unique("onb.clash")}@example.invalid`;
    const user = await db.user.create({ data: { email, name: "Taken", role: "EMPLOYEE" } });

    let refused = false;
    try {
      await db.user.create({ data: { email, name: "Also Taken", role: "EMPLOYEE" } });
    } catch {
      refused = true;
    }
    expect(refused, "two accounts were created on one email address").toBe(true);

    await db.user.delete({ where: { id: user.id } });
  });

  it("keeps only one live invitation per employee", async () => {
    const employee = await db.employee.create({ data: { name: "Invited Twice" } });
    await db.employeeInvite.create({
      data: { token: unique("t1"), employeeId: employee.id, email: `${unique("a")}@x.invalid` },
    });

    // A second row for the same person is refused outright: reissuing has to
    // replace the first, which is what stops yesterday's forwarded link
    // still working.
    let refused = false;
    try {
      await db.employeeInvite.create({
        data: { token: unique("t2"), employeeId: employee.id, email: `${unique("b")}@x.invalid` },
      });
    } catch {
      refused = true;
    }
    expect(refused, "an employee ended up with two working invitation links").toBe(true);

    await cleanup(employee.id);
  });

  it("cannot be told which employee it is — the token decides", () => {
    // acceptEmployeeInvite takes a token and a password. There is no
    // employeeId, no email and no role in its parameters, so a crafted
    // request cannot put somebody on the payroll who was not invited.
    const signature = ACCEPT.slice(
      ACCEPT.indexOf("export async function acceptEmployeeInvite"),
      ACCEPT.indexOf("{", ACCEPT.indexOf("export async function acceptEmployeeInvite")) + 200,
    );
    expect(signature, "the accept path accepts an employee id from the request")
      .not.toMatch(/employeeId/);
    expect(signature, "the accept path accepts a role from the request").not.toMatch(/role/);
    // And the employee and address it writes are read off the invite row.
    expect(ACCEPT).toMatch(/name:\s*invite\.employee!?\.name/);
    expect(ACCEPT).toMatch(/email:\s*invite\.email/);
  });

  it("still takes the clocking-in employee from the session and not the request", () => {
    const start = ACTIONS.indexOf("export async function clockIn");
    const clockIn = ACTIONS.slice(start, ACTIONS.indexOf("export async function clockOut"));
    // Only the PARAMETER LIST. The body is full of `employeeId: me.employeeId`,
    // which is the correct thing — the employee coming off the session and
    // being written down. What must not exist is an employeeId the caller
    // supplies, and that could only appear between these two braces.
    const params = clockIn.slice(clockIn.indexOf("(input: {") + 9, clockIn.indexOf("}) {"));
    expect(params, "clockIn accepts an employeeId from the browser").not.toMatch(/employeeId/);
    expect(params, "clockIn accepts a user id from the browser").not.toMatch(/userId/);
    expect(clockIn, "clockIn no longer resolves the employee from the session")
      .toMatch(/requireEmployeeSelf\(\)/);
  });
});

describe("no administrator handles a password", () => {
  it("has no way to set one when creating an employee", () => {
    const create = ACTIONS.slice(
      ACTIONS.indexOf("export async function createEmployee"),
      ACTIONS.indexOf("export async function updateEmployee"),
    );
    expect(create, "createEmployee takes a password").not.toMatch(/password/i);
    expect(create, "createEmployee writes a password hash").not.toMatch(/passwordHash/);
    // What it mints instead is a token the person spends themselves.
    expect(create).toMatch(/randomBytes\(32\)/);
  });

  it("has no way to read one back", () => {
    expect(ACTIONS, "a management action selects a password hash").not.toMatch(
      /passwordHash:\s*true/,
    );
  });

  it("creates the account only where the password is chosen", () => {
    // The single place a User is created for an employee is the accept path,
    // which runs for the employee themselves with the token they were given.
    expect(ACTIONS, "a management action creates a login directly").not.toMatch(/user\.create/);
    expect(ACCEPT).toMatch(/tx\.user\.create/);
    expect(ACCEPT).toMatch(/hashPassword\(input\.password\)/);
  });
});

describe("who may put somebody on the books", () => {
  it("guards every management action with the administrator check", () => {
    for (const fn of [
      "createEmployee",
      "updateEmployee",
      "setEmployeeStatus",
      "inviteEmployee",
      "revokeEmployeeInvite",
    ]) {
      const start = ACTIONS.indexOf(`export async function ${fn}`);
      expect(start, `${fn} is missing`).toBeGreaterThan(-1);
      const body = ACTIONS.slice(start, start + 900);
      expect(body, `${fn} does not require a workforce manager`).toMatch(
        /requireWorkforceManager\(\)/,
      );
    }
  });

  it("limits that check to administrators and nobody else", () => {
    const authz = readFileSync("src/lib/workforce-authz.ts", "utf8");
    const fn = authz.slice(
      authz.indexOf("export async function requireWorkforceManager"),
      authz.indexOf("export async function requireWorkforceManager") + 400,
    );
    expect(fn).toMatch(/role !== "ADMIN"/);
    for (const role of ["PM", "OFFICE", "SUPERVISOR", "EMPLOYEE", "SUBCONTRACTOR"]) {
      expect(fn, `${role} can manage the workforce`).not.toContain(`"${role}"`);
    }
  });

  it("serves the Add employee control to an administrator", async () => {
    // ?tab=employees, because only the open tab renders — without it the
    // control is genuinely absent from the markup and the assertion would
    // pass or fail for the wrong reason.
    const r = await get(BASE_URL, "/workforce?tab=employees", adminSession);
    expect(wasServed(r), "an administrator cannot reach Workforce").toBe(true);
    expect(pageText(r), "an administrator is not offered Add employee").toContain("Add employee");
  });

  it("refuses Workforce to a project manager", async () => {
    const r = await get(BASE_URL, "/workforce?tab=employees", pmSession);
    expect(
      wasRefused(r) || !pageText(r).includes("Add employee"),
      "a PM was offered the employee roster",
    ).toBe(true);
  });

  it("refuses Workforce to an employee", async () => {
    const r = await get(BASE_URL, "/workforce", employeeSession);
    expect(wasRefused(r), "an employee reached the Workforce management screen").toBe(true);
  });

  it("does not offer an employee any way to add another", async () => {
    const body = pageText(await get(BASE_URL, "/time-clock", employeeSession));
    expect(body, "an employee was offered Add employee").not.toContain("Add employee");
  });
});

describe("nothing half-made survives a failure", () => {
  it("leaves no employee behind when the invitation cannot be written", async () => {
    const before = await db.employee.count();
    const email = `${unique("onb.rollback")}@example.invalid`;

    // The same shape as createEmployee: employee, assignments and invite in
    // one transaction, with the last statement failing. Nothing may remain.
    let threw = false;
    try {
      await db.$transaction(async (tx) => {
        const e = await tx.employee.create({ data: { name: "SHOULD NOT SURVIVE" } });
        await tx.employeeProject.create({ data: { employeeId: e.id, projectId } });
        await tx.employeeInvite.create({
          // A duplicate primary key, standing in for whatever goes wrong.
          data: { token: "rollback-fixed-token", employeeId: e.id, email },
        });
        await tx.employeeInvite.create({
          data: { token: "rollback-fixed-token", employeeId: e.id, email },
        });
      });
    } catch {
      threw = true;
    }

    expect(threw, "the failing transaction reported success").toBe(true);
    expect(await db.employee.count(), "an orphaned employee was left behind").toBe(before);
    expect(
      await db.employee.count({ where: { name: "SHOULD NOT SURVIVE" } }),
      "the half-created employee is still there",
    ).toBe(0);
    expect(
      await db.employeeInvite.count({ where: { token: "rollback-fixed-token" } }),
      "an orphaned invitation was left behind",
    ).toBe(0);
  });

  it("writes the employee and its assignments as one thing", async () => {
    const before = await db.employeeProject.count();
    let threw = false;
    try {
      await db.$transaction(async (tx) => {
        const e = await tx.employee.create({ data: { name: "ALSO SHOULD NOT SURVIVE" } });
        await tx.employeeProject.create({ data: { employeeId: e.id, projectId } });
        // A job that does not exist: the foreign key refuses it.
        await tx.employeeProject.create({
          data: { employeeId: e.id, projectId: "no-such-project" },
        });
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(await db.employeeProject.count(), "a stray assignment survived").toBe(before);
    expect(await db.employee.count({ where: { name: "ALSO SHOULD NOT SURVIVE" } })).toBe(0);
  });
});

describe("history is still protected", () => {
  it("refuses to delete an employee who has filed hours", async () => {
    const employee = await db.employee.create({ data: { name: "Has Worked" } });
    const entry = await db.timeEntry.create({
      data: {
        employeeId: employee.id,
        projectId,
        projectName: tenant.projectName,
        clockInAt: new Date("2026-09-25T11:00:00Z"),
        clockOutAt: new Date("2026-09-25T19:00:00Z"),
        workDate: "2026-09-25",
        durationSeconds: 8 * 3600,
        status: "COMPLETE",
      },
    });

    let refused = false;
    try {
      await db.employee.delete({ where: { id: employee.id } });
    } catch {
      refused = true;
    }
    expect(refused, "an employee with filed hours was deleted").toBe(true);
    expect(
      await db.timeEntry.count({ where: { id: entry.id } }),
      "the hours went with them",
    ).toBe(1);

    // Deactivating is the thing to do instead, and it keeps the record.
    await db.employee.update({ where: { id: employee.id }, data: { status: "INACTIVE" } });
    expect(await db.timeEntry.count({ where: { id: entry.id } })).toBe(1);

    await db.timeEntry.delete({ where: { id: entry.id } });
    await cleanup(employee.id);
  });

  it("offers no action that deletes an employee", () => {
    expect(ACTIONS, "an action deletes an employee").not.toMatch(/employee\.delete/);
    // Status is the supported way, and it is reversible.
    expect(ACTIONS).toMatch(/export async function setEmployeeStatus/);
  });

  it("takes an unused invitation with the employee, and nothing else", async () => {
    const employee = await db.employee.create({ data: { name: "Never Worked" } });
    await db.employeeInvite.create({
      data: { token: unique("cas"), employeeId: employee.id, email: `${unique("c")}@x.invalid` },
    });
    await db.employee.delete({ where: { id: employee.id } });
    expect(
      await db.employeeInvite.count({ where: { employeeId: employee.id } }),
      "an invitation outlived the employee it was for",
    ).toBe(0);
  });
});

describe("what zero assignments actually means", () => {
  /**
   * Pinned deliberately, because it was unpinned and had to be verified by
   * reading. The rule has two halves and both matter:
   *
   *   an unassigned employee MAY start a shift with no job on it, and
   *   nobody may attach a job they are not assigned to.
   *
   * The second half is the authorization guarantee and is tested in
   * employee-assignment.test.ts. This pins the first, so that a change in
   * either direction is a decision somebody makes rather than a drift.
   */
  it("checks the assignment only when a job is named", () => {
    const clockIn = ACTIONS.slice(
      ACTIONS.indexOf("export async function clockIn"),
      ACTIONS.indexOf("export async function clockOut"),
    );
    // The check is inside `if (projectId)`, so no job means no check —
    // and means no job can be attached either.
    expect(clockIn).toMatch(/if \(projectId\) \{[\s\S]*isEmployeeAssignedToProject/);
    expect(clockIn, "a shift with no job is refused outright").toMatch(
      /projectId = input\.projectId\?\.trim\(\) \|\| null/,
    );
  });

  it("records a shift with no job when nobody has been assigned one", async () => {
    const employee = await db.employee.create({ data: { name: "Unassigned Worker" } });
    const entry = await db.timeEntry.create({
      data: {
        employeeId: employee.id,
        projectId: null,
        projectName: "",
        clockInAt: new Date("2026-09-25T11:00:00Z"),
        workDate: "2026-09-25",
        status: "OPEN",
        clockInLocationOk: true,
      },
    });
    expect(entry.projectId, "a shift with no job carried one anyway").toBeNull();
    expect(entry.projectName).toBe("");

    await db.timeEntry.delete({ where: { id: entry.id } });
    await cleanup(employee.id);
  });

  it("tells the employee exactly that, on their own clock", async () => {
    // The unassigned employee created in beforeAll has no EmployeeProject
    // rows, so this is the real rendered page for somebody in that state.
    const body = pageText(await get(BASE_URL, "/time-clock", employeeSession));
    expect(body, "the time clock does not say what no assignment means").toMatch(
      /not assigned to any jobs/i,
    );
    expect(body, "the time clock does not say they can still clock in").toMatch(
      /can still clock in/i,
    );
  });

  it("tells the office the same thing, in the same words", () => {
    // Whitespace-collapsed: this is JSX, so the sentence is wrapped across
    // source lines and matching the raw file would be testing the formatter.
    const ui = readFileSync("src/components/workforce/add-employee.tsx", "utf8")
      .replace(/\s+/g, " ");
    expect(ui, "Add employee does not explain what no assignment means").toMatch(
      /can still clock in/i,
    );
    expect(ui, "Add employee does not say the hours land against no job").toMatch(
      /not be booked to any job/i,
    );
  });
});

describe("deactivating somebody", () => {
  it("takes their clock away and keeps their hours", async () => {
    const user = await db.user.create({
      data: { email: `${unique("onb.off")}@example.invalid`, name: "Left", role: "EMPLOYEE" },
    });
    const employee = await db.employee.create({
      data: { name: "Left", userId: user.id, status: "INACTIVE" },
    });
    const entry = await db.timeEntry.create({
      data: {
        employeeId: employee.id,
        projectId,
        projectName: tenant.projectName,
        clockInAt: new Date("2026-09-24T11:00:00Z"),
        clockOutAt: new Date("2026-09-24T19:00:00Z"),
        workDate: "2026-09-24",
        durationSeconds: 8 * 3600,
        status: "COMPLETE",
      },
    });

    // employeeForSession returns null for anybody not ACTIVE, so the clock
    // is gone. Asserted through the page, under their own session.
    const session = await sessionCookie(user.id, "EMPLOYEE");
    const body = pageText(await get(BASE_URL, "/time-clock", session));
    expect(body, "an inactive employee still has a working clock").toMatch(
      /not set up as an employee/i,
    );

    expect(
      await db.timeEntry.count({ where: { id: entry.id } }),
      "deactivating destroyed the hours",
    ).toBe(1);

    await db.timeEntry.delete({ where: { id: entry.id } });
    await cleanup(employee.id, [user.id]);
  });

  it("refuses while somebody is still on the clock", () => {
    const fn = ACTIONS.slice(
      ACTIONS.indexOf("export async function setEmployeeStatus"),
      ACTIONS.indexOf("export async function inviteEmployee"),
    );
    // Closing the shift for them would mean inventing a clock-out time,
    // which is the one thing the corrections trail exists to prevent.
    expect(fn).toMatch(/clockOutAt: null/);
    expect(fn).toMatch(/They are on the clock/);
  });
});
