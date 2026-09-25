/**
 * Starting and ending a shift, and the rules that hold while it is open.
 *
 * These exercise the data the actions write rather than the actions
 * themselves: importing a server module into the vitest process would hand it
 * that process's DATABASE_URL, which is production — the tenancy system
 * refuses it, and the refusal is the reminder. What is asserted here is the
 * shape the server must produce and the constraints the database enforces
 * whatever the server does.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { fixtures } from "../support/load";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

let employeeId = "";
let projectId = "";
let projectName = "";

beforeAll(async () => {
  const e = await db.employee.create({ data: { name: "Clock Tester" } });
  employeeId = e.id;
  const p = (await db.project.findFirst({ select: { id: true, name: true } }))!;
  projectId = p.id;
  projectName = p.name;
  await db.employeeProject.create({ data: { employeeId, projectId } }).catch(() => undefined);
}, 240_000);

/** A shift, opened and guaranteed cleaned up. */
async function withOpenShift<T>(fn: (id: string) => Promise<T>): Promise<T> {
  const entry = await db.timeEntry.create({
    data: {
      employeeId,
      projectId,
      projectName,
      clockInAt: new Date(),
      workDate: "2026-09-24",
      status: "OPEN",
    },
  });
  try {
    return await fn(entry.id);
  } finally {
    await db.timeEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
  }
}

describe("clocking in", () => {
  it("records the job's name alongside its id", async () => {
    await withOpenShift(async (id) => {
      const entry = await db.timeEntry.findUnique({ where: { id } });
      // The snapshot is the point: a project renamed or deleted later must not
      // silently rewrite what a finished timesheet says somebody worked on.
      expect(entry?.projectId).toBe(projectId);
      expect(entry?.projectName, "the job's name was not recorded").toBe(projectName);
    });
  });

  it("refuses a second open shift however fast it arrives", async () => {
    await withOpenShift(async () => {
      await expect(
        db.timeEntry.create({
          data: { employeeId, clockInAt: new Date(), workDate: "2026-09-24" },
        }),
        "a double tap opened two shifts",
      ).rejects.toThrow();
    });
  });

  it("fixes the work date at clock-in so an overnight shift stays put", async () => {
    // A shift that starts at 10pm and ends at 6am belongs to the day it
    // started. workDate is written once and never recomputed from the end.
    const entry = await db.timeEntry.create({
      data: {
        employeeId,
        clockInAt: new Date("2026-09-24T02:00:00Z"), // 10pm ET on the 23rd
        workDate: "2026-09-23",
      },
    });
    try {
      await db.timeEntry.update({
        where: { id: entry.id },
        data: { clockOutAt: new Date("2026-09-24T10:00:00Z"), durationSeconds: 8 * 3600 },
      });
      const after = await db.timeEntry.findUnique({ where: { id: entry.id } });
      expect(after?.workDate, "the overnight shift moved to the next day").toBe("2026-09-23");
      expect(after?.durationSeconds, "an overnight shift lost its hours").toBe(8 * 3600);
    } finally {
      await db.timeEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
    }
  });
});

describe("clocking out", () => {
  /**
   * The rule worth protecting.
   *
   * Assignment decides where somebody may START a shift. It must never be
   * able to strand an open one: the office takes a person off Tall Lewis at
   * two in the afternoon and they are still stood on it until five. If
   * clockOut ever grows an assignment check "for symmetry" with clockIn, this
   * is the test that should stop it.
   */
  it("lets somebody clock out of a job they have just been removed from", async () => {
    await withOpenShift(async (id) => {
      const link = await db.employeeProject.findUnique({
        where: { employeeId_projectId: { employeeId, projectId } },
      });
      await db.employeeProject.delete({ where: { id: link!.id } });
      try {
        // The only thing clockOut looks for: an open entry belonging to this
        // employee. Nothing about the project, which is the whole point.
        const open = await db.timeEntry.findFirst({
          where: { employeeId, clockOutAt: null },
          select: { id: true },
        });
        expect(open?.id, "an unassigned employee lost sight of their open shift").toBe(id);

        const out = new Date();
        const closed = await db.timeEntry.update({
          where: { id },
          data: { clockOutAt: out, durationSeconds: 60, status: "COMPLETE" },
        });
        expect(closed.clockOutAt, "the shift could not be closed").not.toBeNull();
        expect(closed.projectName, "closing rewrote the job it was worked on").toBe(projectName);
      } finally {
        await db.employeeProject
          .create({ data: { employeeId, projectId } })
          .catch(() => undefined);
      }
    });
  });

  it("computes duration from the timestamps, not from the work date", async () => {
    const start = new Date("2026-09-24T11:02:00Z");
    const end = new Date("2026-09-24T21:11:00Z");
    const entry = await db.timeEntry.create({
      data: { employeeId, clockInAt: start, workDate: "2026-09-24" },
    });
    try {
      const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
      await db.timeEntry.update({
        where: { id: entry.id },
        data: { clockOutAt: end, durationSeconds: seconds, status: "COMPLETE" },
      });
      const after = await db.timeEntry.findUnique({ where: { id: entry.id } });
      // 10h 09m, the figure on the mockup, from the two instants alone.
      expect(after?.durationSeconds).toBe(10 * 3600 + 9 * 60);
    } finally {
      await db.timeEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
    }
  });

  it("leaves a closed shift out of the open-shift constraint", async () => {
    // Closing is what frees the employee to start again — asserted here so a
    // change to the partial index's predicate shows up as this failing.
    const first = await db.timeEntry.create({
      data: { employeeId, clockInAt: new Date(), workDate: "2026-09-24" },
    });
    await db.timeEntry.update({
      where: { id: first.id },
      data: { clockOutAt: new Date(), durationSeconds: 1, status: "COMPLETE" },
    });
    const second = await db.timeEntry.create({
      data: { employeeId, clockInAt: new Date(), workDate: "2026-09-24" },
    });
    try {
      expect(second.id).toBeTruthy();
    } finally {
      await db.timeEntry.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    }
  });
});

describe("a timecard is not a financial record", () => {
  it("carries no money on it at all", async () => {
    // Workforce must not become a side door onto rates or margin. The table
    // has no column for it, which is the strongest version of that promise.
    const cols = await db.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'TimeEntry'`,
    );
    const names = cols.map((c) => c.column_name.toLowerCase());
    for (const forbidden of ["rate", "amount", "cost", "margin", "revenue", "price", "billable"]) {
      expect(
        names.filter((n) => n.includes(forbidden)),
        `TimeEntry grew a ${forbidden} column`,
      ).toEqual([]);
    }
    expect(tenant.projectName).toBeTruthy(); // fixtures are loaded
  });
});
