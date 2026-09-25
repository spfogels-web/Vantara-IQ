/**
 * What the location record will and will not accept.
 *
 * Asserted against the database rather than by importing the action, for the
 * reason established earlier in this work: a server module imported into the
 * vitest process is handed that process's DATABASE_URL, which is production.
 * What is checked here is the shape the action must produce and the rules the
 * schema enforces whatever any caller does.
 *
 * The throttle and the range checks live in workforce-location.ts and are
 * exercised directly in location-coverage.test.ts; this file is about
 * ownership and lifecycle — whose points these are, and when they may exist.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { testClient } from "../support/test-db";

const db = testClient();

let mine = "";
let theirs = "";

beforeAll(async () => {
  const a = await db.employee.create({ data: { name: "Points Mine" } });
  const b = await db.employee.create({ data: { name: "Points Theirs" } });
  mine = a.id;
  theirs = b.id;
}, 240_000);

/** An open shift for one employee, cleaned up afterwards. */
async function withShift<T>(employeeId: string, fn: (id: string) => Promise<T>): Promise<T> {
  const entry = await db.timeEntry.create({
    data: { employeeId, clockInAt: new Date(), workDate: "2026-09-25", status: "OPEN" },
  });
  try {
    return await fn(entry.id);
  } finally {
    await db.timeEntryLocation.deleteMany({ where: { timeEntryId: entry.id } });
    await db.timeEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
  }
}

describe("a point belongs to exactly one shift", () => {
  it("reaches its employee only through its entry", async () => {
    await withShift(mine, async (timeEntryId) => {
      const p = await db.timeEntryLocation.create({
        data: {
          timeEntryId,
          capturedAt: new Date(),
          latitude: 33.9,
          longitude: -83.4,
          accuracyMeters: 18,
          kind: "CLOCK_IN",
        },
      });
      const back = await db.timeEntryLocation.findUnique({
        where: { id: p.id },
        select: { timeEntry: { select: { employeeId: true } } },
      });
      // There is no employeeId on the point to disagree with this one.
      expect(back?.timeEntry.employeeId).toBe(mine);
    });
  });

  it("cannot be attached to a shift that does not exist", async () => {
    await expect(
      db.timeEntryLocation.create({
        data: {
          timeEntryId: "not-a-real-entry",
          capturedAt: new Date(),
          latitude: 33.9,
          longitude: -83.4,
          kind: "PERIODIC",
        },
      }),
      "a point was written against an invented shift id",
    ).rejects.toThrow();
  });

  it("goes with its shift and takes nothing else", async () => {
    // CASCADE. A deleted entry must not leave orphan positions behind that
    // belong to nobody and can never be explained.
    const entry = await db.timeEntry.create({
      data: { employeeId: mine, clockInAt: new Date(), workDate: "2026-09-25" },
    });
    await db.timeEntryLocation.create({
      data: {
        timeEntryId: entry.id,
        capturedAt: new Date(),
        latitude: 33.9,
        longitude: -83.4,
        kind: "PERIODIC",
      },
    });
    await db.timeEntry.delete({ where: { id: entry.id } });
    const orphans = await db.timeEntryLocation.count({ where: { timeEntryId: entry.id } });
    expect(orphans, "deleting a shift left its positions behind").toBe(0);
  });
});

describe("two employees' histories do not mix", () => {
  it("keeps each shift's points to itself", async () => {
    await withShift(mine, async (a) => {
      await withShift(theirs, async (b) => {
        await db.timeEntryLocation.createMany({
          data: [
            { timeEntryId: a, capturedAt: new Date(), latitude: 33.9, longitude: -83.4, kind: "CLOCK_IN" },
            { timeEntryId: a, capturedAt: new Date(), latitude: 33.91, longitude: -83.4, kind: "PERIODIC" },
            { timeEntryId: b, capturedAt: new Date(), latitude: 34.5, longitude: -84.0, kind: "CLOCK_IN" },
          ],
        });

        const forA = await db.timeEntryLocation.findMany({ where: { timeEntryId: a } });
        const forB = await db.timeEntryLocation.findMany({ where: { timeEntryId: b } });
        expect(forA.length).toBe(2);
        expect(forB.length).toBe(1);
        // The point that matters: nothing of B's is reachable from A's shift.
        expect(forA.every((p) => p.latitude < 34), "another employee's position appeared")
          .toBe(true);
      });
    });
  });
});

describe("the shift's lifecycle bounds the record", () => {
  it("has no points before clock-in, because there is no shift to hold them", async () => {
    // The structural version of "no off-shift tracking": a position needs a
    // timeEntryId, and before somebody clocks in there is not one.
    const before = await db.timeEntryLocation.count({
      where: { timeEntry: { employeeId: mine, clockOutAt: null } },
    });
    expect(before).toBe(0);
  });

  it("keeps the closing point on the shift it closed", async () => {
    const entry = await db.timeEntry.create({
      data: { employeeId: mine, clockInAt: new Date(), workDate: "2026-09-25" },
    });
    try {
      await db.timeEntryLocation.create({
        data: {
          timeEntryId: entry.id,
          capturedAt: new Date(),
          latitude: 33.9,
          longitude: -83.4,
          kind: "CLOCK_OUT",
        },
      });
      await db.timeEntry.update({
        where: { id: entry.id },
        data: { clockOutAt: new Date(), durationSeconds: 60, status: "COMPLETE", clockOutLocationOk: true },
      });
      const after = await db.timeEntry.findUnique({
        where: { id: entry.id },
        select: { clockOutLocationOk: true, locations: { select: { kind: true } } },
      });
      expect(after?.clockOutLocationOk).toBe(true);
      expect(after?.locations.map((l) => l.kind)).toContain("CLOCK_OUT");
    } finally {
      await db.timeEntryLocation.deleteMany({ where: { timeEntryId: entry.id } });
      await db.timeEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
    }
  });

  it("records honestly when the closing fix never came", async () => {
    // The shift closes, and the record says the final capture failed rather
    // than borrowing the last periodic point to stand in for it.
    const entry = await db.timeEntry.create({
      data: { employeeId: mine, clockInAt: new Date(), workDate: "2026-09-25" },
    });
    try {
      await db.timeEntryLocation.create({
        data: {
          timeEntryId: entry.id,
          capturedAt: new Date(),
          latitude: 33.9,
          longitude: -83.4,
          kind: "PERIODIC",
        },
      });
      await db.timeEntry.update({
        where: { id: entry.id },
        data: {
          clockOutAt: new Date(),
          durationSeconds: 60,
          status: "COMPLETE",
          clockOutLocationOk: false,
        },
      });
      const after = await db.timeEntry.findUnique({
        where: { id: entry.id },
        select: { clockOutAt: true, clockOutLocationOk: true, locations: { select: { kind: true } } },
      });
      expect(after?.clockOutAt, "a failed final fix trapped the shift open").not.toBeNull();
      expect(after?.clockOutLocationOk).toBe(false);
      expect(
        after?.locations.filter((l) => l.kind === "CLOCK_OUT"),
        "a closing position was invented from a periodic one",
      ).toEqual([]);
    } finally {
      await db.timeEntryLocation.deleteMany({ where: { timeEntryId: entry.id } });
      await db.timeEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
    }
  });
});

describe("location carries nothing financial", () => {
  it("has no money column on it", async () => {
    const cols = await db.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'TimeEntryLocation'`,
    );
    const names = cols.map((c) => c.column_name.toLowerCase());
    for (const forbidden of ["rate", "amount", "cost", "margin", "revenue", "price"]) {
      expect(names.filter((n) => n.includes(forbidden)), `a ${forbidden} column appeared`).toEqual([]);
    }
    expect(names).toEqual(
      expect.arrayContaining(["timeentryid", "capturedat", "latitude", "longitude", "kind"]),
    );
  });
});
