/**
 * The invariants Workforce rests on, checked against a real database.
 *
 * Two of these cannot be checked any other way. The partial unique index does
 * not exist in schema.prisma — Prisma has no syntax for it — so nothing about
 * the model file proves it is there; and "an employee is not staff" is a claim
 * about a function that a new enum value could silently falsify.
 *
 * The suite runs against a schema built by `db push` plus the one statement
 * installPartialIndexes() copies out of 007. If that installer ever stops
 * working, the double-clock-in test below is the one that notices.
 */
import { describe, expect, it } from "vitest";

import { isStaff } from "@/lib/auth";
import { TEST_SCHEMA, testClient } from "../support/test-db";

const db = testClient();

/** A throwaway employee, and everything that hangs off them, removed after. */
async function withEmployee<T>(name: string, fn: (id: string) => Promise<T>): Promise<T> {
  const e = await db.employee.create({ data: { name } });
  try {
    return await fn(e.id);
  } finally {
    await db.timeEntry.deleteMany({ where: { employeeId: e.id } }).catch(() => undefined);
    await db.employee.delete({ where: { id: e.id } }).catch(() => undefined);
  }
}

describe("an employee is not staff", () => {
  it("does not let EMPLOYEE through isStaff", () => {
    // The whole permission model rests on this being false. Adding a value to
    // the Role enum is exactly the change that could make it true by accident.
    expect(isStaff("EMPLOYEE" as never), "EMPLOYEE was admitted as staff").toBe(false);
  });

  it("still admits the four roles that are staff", () => {
    for (const role of ["ADMIN", "PM", "OFFICE", "SUPERVISOR"] as const) {
      expect(isStaff(role), `${role} stopped being staff`).toBe(true);
    }
  });

  it("still refuses a subcontractor", () => {
    expect(isStaff("SUBCONTRACTOR")).toBe(false);
  });
});

describe("one open shift per employee", () => {
  it("has the partial unique index the migration installs", async () => {
    const rows = await db.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = $1 AND indexname = 'TimeEntry_one_open_per_employee'`,
      TEST_SCHEMA,
    );
    expect(rows.length, "the partial unique index is missing from the test schema").toBe(1);
    // Partial, and on the right predicate. A plain unique index on employeeId
    // would pass a "does it exist" check and break every second shift.
    expect(rows[0].indexdef).toMatch(/UNIQUE/i);
    expect(rows[0].indexdef).toMatch(/WHERE \("?clockOutAt"? IS NULL\)/i);
  });

  it("refuses a second open shift for the same employee", async () => {
    await withEmployee("Double Tap", async (employeeId) => {
      await db.timeEntry.create({
        data: { employeeId, clockInAt: new Date(), workDate: "2026-09-24" },
      });
      // The database decides this, not the action. A double-tapped button
      // races any check written in application code.
      await expect(
        db.timeEntry.create({
          data: { employeeId, clockInAt: new Date(), workDate: "2026-09-24" },
        }),
        "a second open shift was accepted",
      ).rejects.toThrow();
    });
  });

  it("lets two employees each hold their own open shift", async () => {
    await withEmployee("First", async (a) => {
      await withEmployee("Second", async (b) => {
        await db.timeEntry.create({ data: { employeeId: a, clockInAt: new Date(), workDate: "2026-09-24" } });
        const second = await db.timeEntry.create({
          data: { employeeId: b, clockInAt: new Date(), workDate: "2026-09-24" },
        });
        expect(second.id, "one employee's shift blocked another's").toBeTruthy();
      });
    });
  });

  it("lets the same employee clock in again once the shift is closed", async () => {
    await withEmployee("Back Tomorrow", async (employeeId) => {
      const first = await db.timeEntry.create({
        data: { employeeId, clockInAt: new Date(), workDate: "2026-09-24" },
      });
      await db.timeEntry.update({
        where: { id: first.id },
        data: { clockOutAt: new Date(), status: "COMPLETE" },
      });
      const next = await db.timeEntry.create({
        data: { employeeId, clockInAt: new Date(), workDate: "2026-09-25" },
      });
      expect(next.id, "a closed shift still blocked the next one").toBeTruthy();
    });
  });
});

describe("what the shape guarantees", () => {
  it("cannot delete an employee who has hours behind them", async () => {
    const e = await db.employee.create({ data: { name: "Has History" } });
    await db.timeEntry.create({
      data: { employeeId: e.id, clockInAt: new Date(), workDate: "2026-09-24" },
    });
    try {
      // RESTRICT. A timecard is what somebody is owed; deleting a person must
      // not be able to delete it.
      await expect(db.employee.delete({ where: { id: e.id } })).rejects.toThrow();
    } finally {
      await db.timeEntry.deleteMany({ where: { employeeId: e.id } });
      await db.employee.delete({ where: { id: e.id } }).catch(() => undefined);
    }
  });

  it("gives a location point no way to name an employee", async () => {
    // Deliberate: a point reaches its employee only through its entry, so
    // there is no second copy of that answer to drift out of agreement.
    const cols = await db.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'TimeEntryLocation'`,
      TEST_SCHEMA,
    );
    const names = cols.map((c) => c.column_name);
    expect(names, "a location point can now claim its own employee").not.toContain("employeeId");
    expect(names).toContain("timeEntryId");
  });

  it("ties one login to at most one employee", async () => {
    const cols = await db.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'Employee'`,
      TEST_SCHEMA,
    );
    expect(
      cols.map((c) => c.indexname),
      "Employee.userId is not unique — one login could hold two timecards",
    ).toContain("Employee_userId_key");
  });
});
