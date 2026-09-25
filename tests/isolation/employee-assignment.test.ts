/**
 * Where an employee may book hours, and where they may not.
 *
 * Assignment is authorization. EmployeeProject answers one question — may
 * this person put time against this job — and the server asks it again when
 * the punch arrives rather than trusting the id that comes back from a page
 * it rendered earlier. An assignment can be withdrawn between the two, and a
 * request need never have come from that page at all.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { get, pageText, sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

let employeeId = "";
let otherEmployeeId = "";
let assignedProjectId = "";
let unassignedProjectId = "";
let assignedProjectName = "";
let unassignedProjectName = "";
let employeeSession = "";
let unassignedSession = "";

beforeAll(async () => {
  const u = await db.user.create({
    data: { email: `asg.${Date.now()}@example.invalid`, name: "Assigned", role: "EMPLOYEE" },
  });
  const me = await db.employee.create({ data: { name: "Assigned", userId: u.id } });
  const them = await db.employee.create({ data: { name: "Unassigned" } });
  employeeId = me.id;
  otherEmployeeId = them.id;

  // One job they are on, and one they are not.
  const projects = await db.project.findMany({ select: { id: true, name: true }, take: 2 });
  assignedProjectId = projects[0].id;
  assignedProjectName = projects[0].name;
  unassignedProjectId = projects[1]?.id ?? projects[0].id;
  unassignedProjectName = projects[1]?.name ?? "";

  await db.employeeProject.create({
    data: { employeeId: me.id, projectId: assignedProjectId, assignedBy: "test" },
  });

  // A second login with an employee record and no assignments at all.
  const u2 = await db.user.create({
    data: { email: `noasg.${Date.now()}@example.invalid`, name: "Unassigned", role: "EMPLOYEE" },
  });
  await db.employee.update({ where: { id: them.id }, data: { userId: u2.id } });

  employeeSession = await sessionCookie(u.id, "EMPLOYEE");
  unassignedSession = await sessionCookie(u2.id, "EMPLOYEE");
  await get(BASE_URL, "/time-clock", employeeSession);
}, 240_000);

describe("the assignment decides the list", () => {
  /**
   * Through the running server, not by importing the module.
   *
   * These three were written as direct imports of workforce-authz and failed
   * closed with "No organisation on this request" — which is the tenancy
   * system working. Importing a server module into the vitest process gives
   * it that process's DATABASE_URL, and that is production. The same mistake
   * was made once already in this work and caught by the same refusal.
   *
   * So the page is asked instead. It runs in the server, under a real
   * session, against the test schema, and renders exactly what the employee
   * is allowed to choose from.
   */
  it("offers an employee only the jobs they are on", async () => {
    const body = pageText(await get(BASE_URL, "/time-clock", employeeSession));
    expect(body, "the assigned job is not offered").toContain(assignedProjectName);
    if (unassignedProjectName && unassignedProjectName !== assignedProjectName) {
      expect(body, "an employee was offered a job nobody put them on")
        .not.toContain(unassignedProjectName);
    }
  });

  it("tells an employee with no assignments that they have none", async () => {
    const body = pageText(await get(BASE_URL, "/time-clock", unassignedSession));
    // Fail closed, and say so rather than render an empty dropdown.
    expect(body, "an unassigned employee was not told why there is no job list")
      .toContain("not assigned to any jobs");
    expect(body, "an unassigned employee was offered a job").not.toContain(assignedProjectName);
  });
});

describe("what the pairing guarantees", () => {
  it("refuses the same pairing twice", async () => {
    await expect(
      db.employeeProject.create({
        data: { employeeId, projectId: assignedProjectId },
      }),
      "an employee was assigned to the same job twice",
    ).rejects.toThrow();
  });

  it("allows many jobs per employee and many employees per job", async () => {
    if (unassignedProjectId === assignedProjectId) return; // one project seeded
    const second = await db.employeeProject.create({
      data: { employeeId, projectId: unassignedProjectId },
    });
    const shared = await db.employeeProject.create({
      data: { employeeId: otherEmployeeId, projectId: assignedProjectId },
    });
    try {
      expect(second.id).toBeTruthy();
      expect(shared.id).toBeTruthy();
    } finally {
      await db.employeeProject.delete({ where: { id: second.id } }).catch(() => undefined);
      await db.employeeProject.delete({ where: { id: shared.id } }).catch(() => undefined);
    }
  });

  it("leaves hours alone when an assignment is removed", async () => {
    // The whole point of keeping projectId and projectName on the entry:
    // taking somebody off a job is a change to what they may do next, not a
    // rewrite of what they already did.
    const entry = await db.timeEntry.create({
      data: {
        employeeId,
        projectId: assignedProjectId,
        projectName: tenant.projectName,
        clockInAt: new Date(),
        clockOutAt: new Date(),
        workDate: "2026-09-24",
        durationSeconds: 3600,
        status: "COMPLETE",
      },
    });
    const link = await db.employeeProject.findUnique({
      where: { employeeId_projectId: { employeeId, projectId: assignedProjectId } },
    });
    try {
      await db.employeeProject.delete({ where: { id: link!.id } });
      const after = await db.timeEntry.findUnique({ where: { id: entry.id } });
      expect(after?.projectId, "unassigning rewrote a finished timecard").toBe(assignedProjectId);
      expect(after?.projectName).toBe(tenant.projectName);
    } finally {
      await db.timeEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
      await db.employeeProject
        .create({ data: { employeeId, projectId: assignedProjectId } })
        .catch(() => undefined);
    }
  });
});
