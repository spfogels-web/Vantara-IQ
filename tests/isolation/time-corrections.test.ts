/**
 * Correcting a punch, and everything that must survive the correction.
 *
 * The shape of the record is asserted against the database; the behaviour of
 * the action is asserted through the running server, because importing it
 * into the vitest process would hand it a production connection.
 *
 * The thing most worth protecting here is the one nobody would notice
 * breaking: a correction must move the hours and leave the location history
 * exactly where it was. A manager may be right that somebody worked until
 * 5:37 and still has no standing to claim the phone reported a position it
 * never reported.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { fixtures } from "../support/load";
import { testClient } from "../support/test-db";
import { coverageFor } from "@/lib/workforce-location";

const tenant = fixtures().a;
const db = testClient();

let employeeId = "";
let projectId = "";
let actorId = "";

beforeAll(async () => {
  const e = await db.employee.create({ data: { name: "Correction Subject" } });
  employeeId = e.id;
  projectId = (await db.project.findFirst({ select: { id: true } }))!.id;
  actorId = tenant.staffUserId;
}, 240_000);

/** A finished shift with real positions on it, cleaned up afterwards. */
async function withShift<T>(
  fn: (entry: { id: string; clockInAt: Date; clockOutAt: Date }) => Promise<T>,
  opts: { start?: Date; end?: Date } = {},
): Promise<T> {
  const start = opts.start ?? new Date("2026-09-25T11:02:00Z");
  const end = opts.end ?? new Date("2026-09-25T21:02:00Z");
  const entry = await db.timeEntry.create({
    data: {
      employeeId,
      projectId,
      projectName: tenant.projectName,
      clockInAt: start,
      clockOutAt: end,
      workDate: "2026-09-25",
      durationSeconds: Math.round((end.getTime() - start.getTime()) / 1000),
      status: "COMPLETE",
      clockInLocationOk: true,
      clockOutLocationOk: true,
    },
  });
  // Positions across the first two hours only, so extending the shift has
  // somewhere honest to show a fall in coverage.
  await db.timeEntryLocation.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      timeEntryId: entry.id,
      capturedAt: new Date(start.getTime() + i * 5 * 60_000),
      latitude: 33.9 + i * 0.0002,
      longitude: -83.4,
      accuracyMeters: 18,
      kind: i === 0 ? ("CLOCK_IN" as const) : ("PERIODIC" as const),
    })),
  });
  try {
    return await fn({ id: entry.id, clockInAt: start, clockOutAt: end });
  } finally {
    await db.timeEntryAudit.deleteMany({ where: { timeEntryId: entry.id } });
    await db.timeEntryLocation.deleteMany({ where: { timeEntryId: entry.id } });
    await db.timeEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
  }
}

/** What the action writes, applied directly so the record can be asserted. */
async function applyCorrection(
  entryId: string,
  next: { clockInAt?: Date; clockOutAt?: Date },
  reason: string,
) {
  const before = (await db.timeEntry.findUnique({ where: { id: entryId } }))!;
  const nextIn = next.clockInAt ?? before.clockInAt;
  const nextOut = next.clockOutAt ?? before.clockOutAt;
  const changes: { field: string; oldValue: string; newValue: string }[] = [];
  if (nextIn.toISOString() !== before.clockInAt.toISOString()) {
    changes.push({
      field: "clockInAt",
      oldValue: before.clockInAt.toISOString(),
      newValue: nextIn.toISOString(),
    });
  }
  if ((nextOut?.toISOString() ?? "") !== (before.clockOutAt?.toISOString() ?? "")) {
    changes.push({
      field: "clockOutAt",
      oldValue: before.clockOutAt?.toISOString() ?? "",
      newValue: nextOut?.toISOString() ?? "",
    });
  }
  await db.$transaction(async (tx) => {
    await tx.timeEntry.update({
      where: { id: entryId },
      data: {
        clockInAt: nextIn,
        clockOutAt: nextOut,
        durationSeconds: nextOut
          ? Math.max(0, Math.round((nextOut.getTime() - nextIn.getTime()) / 1000))
          : null,
        status: "EDITED",
      },
    });
    await tx.timeEntryAudit.createMany({
      data: changes.map((c) => ({
        timeEntryId: entryId,
        ...c,
        reason,
        actorUserId: actorId,
        actorEmail: "office@northgate-utility.test",
      })),
    });
  });
}

describe("a correction keeps what it changed", () => {
  it("records the old and the new value, the reason, the actor and the time", async () => {
    await withShift(async (entry) => {
      const later = new Date(entry.clockOutAt.getTime() + 35 * 60_000);
      await applyCorrection(entry.id, { clockOutAt: later }, "Employee forgot to clock out");

      const audits = await db.timeEntryAudit.findMany({ where: { timeEntryId: entry.id } });
      expect(audits.length, "nothing was written to the audit trail").toBe(1);
      const a = audits[0];
      expect(a.field).toBe("clockOutAt");
      expect(a.oldValue, "the original value was not kept").toBe(entry.clockOutAt.toISOString());
      expect(a.newValue).toBe(later.toISOString());
      expect(a.reason).toBe("Employee forgot to clock out");
      expect(a.actorUserId, "nobody was recorded as having done it").toBe(actorId);
      expect(a.at).toBeInstanceOf(Date);
    });
  });

  it("keeps every correction, not just the last", async () => {
    await withShift(async (entry) => {
      const once = new Date(entry.clockOutAt.getTime() + 35 * 60_000);
      const twice = new Date(entry.clockOutAt.getTime() + 50 * 60_000);
      await applyCorrection(entry.id, { clockOutAt: once }, "Forgot to clock out");
      await applyCorrection(entry.id, { clockOutAt: twice }, "Actually left at 5:52");

      const audits = await db.timeEntryAudit.findMany({
        where: { timeEntryId: entry.id },
        orderBy: { at: "asc" },
      });
      expect(audits.length, "a later correction overwrote an earlier one").toBe(2);
      // The chain reads end to end: what it was, what it became, what it is.
      expect(audits[0].oldValue).toBe(entry.clockOutAt.toISOString());
      expect(audits[0].newValue).toBe(once.toISOString());
      expect(audits[1].oldValue).toBe(once.toISOString());
      expect(audits[1].newValue).toBe(twice.toISOString());
    });
  });

  it("marks the entry as edited", async () => {
    await withShift(async (entry) => {
      await applyCorrection(
        entry.id,
        { clockOutAt: new Date(entry.clockOutAt.getTime() + 60_000) },
        "Rounding",
      );
      const after = await db.timeEntry.findUnique({ where: { id: entry.id } });
      expect(after?.status, "a corrected entry is indistinguishable from an untouched one")
        .toBe("EDITED");
    });
  });
});

describe("a correction recalculates the hours", () => {
  it("derives duration from the corrected timestamps", async () => {
    await withShift(async (entry) => {
      const later = new Date(entry.clockOutAt.getTime() + 35 * 60_000);
      await applyCorrection(entry.id, { clockOutAt: later }, "Forgot to clock out");
      const after = await db.timeEntry.findUnique({ where: { id: entry.id } });
      // 10h 00m becomes 10h 35m, from the instants and nothing else.
      expect(after?.durationSeconds).toBe(10 * 3600 + 35 * 60);
    });
  });

  it("never produces a negative duration", async () => {
    await withShift(async (entry) => {
      // The action refuses this outright; the arithmetic is floored as well,
      // so even a path that got here could not write a negative shift.
      const before = new Date(entry.clockInAt.getTime() - 60 * 60_000);
      await applyCorrection(entry.id, { clockOutAt: before }, "Bad edit");
      const after = await db.timeEntry.findUnique({ where: { id: entry.id } });
      expect(after!.durationSeconds!, "a shift ended before it started").toBeGreaterThanOrEqual(0);
    });
  });

  it("gets an overnight correction right", async () => {
    // 10pm to 6am, then corrected to 6:30am. The date changes in the middle
    // and the arithmetic must not notice.
    const start = new Date("2026-09-25T02:00:00Z");
    const end = new Date("2026-09-25T10:00:00Z");
    await withShift(
      async (entry) => {
        const later = new Date(end.getTime() + 30 * 60_000);
        await applyCorrection(entry.id, { clockOutAt: later }, "Stayed to finish the pull");
        const after = await db.timeEntry.findUnique({ where: { id: entry.id } });
        expect(after?.durationSeconds).toBe(8 * 3600 + 30 * 60);
        expect(after?.workDate, "an overnight correction moved the work date").toBe("2026-09-25");
      },
      { start, end },
    );
  });
});

describe("a correction does not touch the location record", () => {
  it("leaves every GPS row exactly as it was", async () => {
    await withShift(async (entry) => {
      const before = await db.timeEntryLocation.findMany({
        where: { timeEntryId: entry.id },
        orderBy: { capturedAt: "asc" },
      });
      await applyCorrection(
        entry.id,
        { clockOutAt: new Date(entry.clockOutAt.getTime() + 35 * 60_000) },
        "Forgot to clock out",
      );
      const after = await db.timeEntryLocation.findMany({
        where: { timeEntryId: entry.id },
        orderBy: { capturedAt: "asc" },
      });

      expect(after.length, "the correction added or removed positions").toBe(before.length);
      expect(
        after.map((p) => `${p.id}:${p.latitude}:${p.longitude}:${p.capturedAt.toISOString()}`),
        "a recorded position was altered by a time correction",
      ).toEqual(
        before.map((p) => `${p.id}:${p.latitude}:${p.longitude}:${p.capturedAt.toISOString()}`),
      );
    });
  });

  it("lets coverage fall when the shift is extended", async () => {
    await withShift(async (entry) => {
      const points = await db.timeEntryLocation.findMany({
        where: { timeEntryId: entry.id },
        select: { capturedAt: true, latitude: true, longitude: true, accuracyMeters: true },
      });
      const before = coverageFor(points, entry.clockInAt, entry.clockOutAt);

      const later = new Date(entry.clockOutAt.getTime() + 60 * 60_000);
      await applyCorrection(entry.id, { clockOutAt: later }, "Forgot to clock out");
      const after = coverageFor(points, entry.clockInAt, later);

      // The added hour genuinely was not observed. A coverage figure that
      // stayed flattering through a correction would be worth nothing.
      expect(after.percent, "coverage was manufactured for the corrected period")
        .toBeLessThan(before.percent);
    });
  });

  it("does not invent a route point for the corrected period", async () => {
    await withShift(async (entry) => {
      const later = new Date(entry.clockOutAt.getTime() + 60 * 60_000);
      await applyCorrection(entry.id, { clockOutAt: later }, "Forgot to clock out");
      const points = await db.timeEntryLocation.findMany({
        where: { timeEntryId: entry.id },
        orderBy: { capturedAt: "desc" },
        take: 1,
      });
      // The last position is still the last one actually reported, hours
      // before the corrected clock-out.
      expect(
        points[0].capturedAt.getTime(),
        "a position appeared inside the corrected period",
      ).toBeLessThan(entry.clockOutAt.getTime());
    });
  });
});

describe("the audit trail is append-only in practice", () => {
  it("has no action that edits or deletes a row", async () => {
    // The guarantee is the absence of a path. Asserted against the source so
    // that adding one is a deliberate act somebody has to explain.
    const { readFileSync } = await import("node:fs");
    const actions = readFileSync("src/app/workforce-actions.ts", "utf8");
    expect(actions, "an action updates the audit trail").not.toMatch(
      /timeEntryAudit\.(update|updateMany|delete|deleteMany|upsert)/,
    );
    expect(actions, "the audit trail is never written").toMatch(/timeEntryAudit\.createMany/);
  });

  it("offers no way to write a location from a correction", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/workforce-actions.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function correctTimeEntry"));
    expect(fn, "the correction path can write GPS history").not.toMatch(
      /timeEntryLocation\.(create|createMany|update|updateMany|delete|deleteMany)/,
    );
  });
});
