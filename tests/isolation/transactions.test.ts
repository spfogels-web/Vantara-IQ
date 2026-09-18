/**
 * The nine converted write paths, each forced to fail halfway.
 *
 * `$transaction([...])` was converted to `$transaction(async tx => …)` because
 * the array form cannot survive a proxy that resolves the organisation
 * asynchronously — a spike showed plain promises are rejected by Prisma *and*
 * have already written their row by the time the rejection arrives.
 *
 * The conversion has to be behaviour-identical, and the behaviour that matters
 * is atomicity: if the second statement fails, the first must not survive. Each
 * test below reproduces one converted path's exact statement shape against real
 * models and real constraints, forces the second statement to fail the way it
 * would fail in production, and asserts nothing was left behind.
 *
 * What this does not do is call the nine server actions themselves — they open
 * with `requireStaff()` and need a request context vitest has no way to give
 * them. Those wrappers are unchanged by the conversion; the transaction inside
 * them is what changed, and that is what is tested here.
 *
 * Runs in the disposable test schema, like the rest of the suite. Fortitude's
 * data is never touched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixtures } from "../support/load";
import { testClient } from "../support/test-db";

const f = fixtures();
const db = testClient();

/** An id that certainly matches nothing, to make the second statement fail. */
const GHOST = "ghost_id_that_does_not_exist";

afterAll(async () => {
  await db.$disconnect();
});

/** Every path is "first statement succeeds, second throws, nothing remains". */
async function expectRollback(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false; // it did not throw — the test's premise is broken
  } catch {
    return true;
  }
}

describe("1 · removing a crew and its logins", () => {
  it("keeps the logins when deleting the crew fails", async () => {
    const sub = f.a.crews[1];
    const before = await db.user.count({ where: { subcontractorId: sub.subcontractorId } });
    expect(before, "fixture problem: that crew has no logins to lose").toBeGreaterThan(0);

    const threw = await expectRollback(() =>
      db.$transaction(async (tx) => {
        await tx.user.deleteMany({ where: { subcontractorId: sub.subcontractorId } });
        await tx.subcontractor.delete({ where: { id: GHOST } });
      }),
    );

    expect(threw, "the forced failure did not happen").toBe(true);
    expect(
      await db.user.count({ where: { subcontractorId: sub.subcontractorId } }),
      "logins were deleted even though the crew delete failed",
    ).toBe(before);
  });
});

describe("2 · reassigning a crew's projects", () => {
  it("leaves the existing assignments when the new ones fail", async () => {
    const crew = f.a.crews[0];
    const before = await db.projectCrew.findMany({
      where: { subcontractorId: crew.subcontractorId },
      select: { projectId: true },
    });
    expect(before.length, "fixture problem: crew has no assignments").toBeGreaterThan(0);

    const threw = await expectRollback(() =>
      db.$transaction(async (tx) => {
        await tx.projectCrew.deleteMany({ where: { subcontractorId: crew.subcontractorId } });
        // A project that does not exist — the foreign key refuses it.
        await tx.projectCrew.createMany({
          data: [{ subcontractorId: crew.subcontractorId, projectId: GHOST }],
        });
      }),
    );

    expect(threw).toBe(true);
    const after = await db.projectCrew.findMany({
      where: { subcontractorId: crew.subcontractorId },
      select: { projectId: true },
    });
    expect(
      after.map((r) => r.projectId).sort(),
      "the crew was left unassigned — they would be locked out of their own jobs",
    ).toEqual(before.map((r) => r.projectId).sort());
  });
});

describe("3 · recording a payment against a statement", () => {
  it("records no payment when marking the statement paid fails", async () => {
    const stmt = f.a.crews[0];
    const before = await db.subPayment.count({ where: { invoiceId: stmt.subInvoiceId } });

    const threw = await expectRollback(() =>
      db.$transaction(async (tx) => {
        await tx.subPayment.create({
          data: { invoiceId: stmt.subInvoiceId, amount: 1234.56, paidOn: "2026-09-17" },
        });
        await tx.subInvoice.update({ where: { id: GHOST }, data: { status: "PAID" } });
      }),
    );

    expect(threw).toBe(true);
    expect(
      await db.subPayment.count({ where: { invoiceId: stmt.subInvoiceId } }),
      "a payment was recorded against a statement that was never marked paid",
    ).toBe(before);
  });
});

describe("4, 5, 6, 9 · the prospect paths", () => {
  let prospectId = "";

  beforeAll(async () => {
    const p = await db.prospect.create({ data: { name: "Transaction Test Crew", kind: "SUBCONTRACTOR" } });
    prospectId = p.id;
  });

  it("4 · leaves the stage alone when logging the move fails", async () => {
    const before = await db.prospect.findUnique({ where: { id: prospectId }, select: { stage: true } });

    const threw = await expectRollback(() =>
      db.$transaction(async (tx) => {
        await tx.prospect.update({ where: { id: prospectId }, data: { stage: "BID_SUBMITTED" } });
        await tx.prospectActivity.create({ data: { prospectId: GHOST, kind: "stage", body: "x" } });
      }),
    );

    expect(threw).toBe(true);
    const after = await db.prospect.findUnique({ where: { id: prospectId }, select: { stage: true } });
    expect(after?.stage, "the stage moved with no activity recording why").toBe(before?.stage);
  });

  it("5 · records no activity when stamping last contact fails", async () => {
    const before = await db.prospectActivity.count({ where: { prospectId } });

    const threw = await expectRollback(() =>
      db.$transaction(async (tx) => {
        await tx.prospectActivity.create({ data: { prospectId, kind: "note", body: "called" } });
        await tx.prospect.update({ where: { id: GHOST }, data: { lastContact: "2026-09-17" } });
      }),
    );

    expect(threw).toBe(true);
    expect(await db.prospectActivity.count({ where: { prospectId } })).toBe(before);
  });

  it("6 · does not mark a prospect converted when the activity fails", async () => {
    const before = await db.prospect.findUnique({
      where: { id: prospectId },
      select: { stage: true, convertedSubcontractorId: true },
    });

    const threw = await expectRollback(() =>
      db.$transaction(async (tx) => {
        await tx.prospect.update({
          where: { id: prospectId },
          data: { stage: "WON", convertedSubcontractorId: f.a.crews[0].subcontractorId, convertedAt: new Date() },
        });
        await tx.prospectActivity.create({ data: { prospectId: GHOST, kind: "stage", body: "x" } });
      }),
    );

    expect(threw).toBe(true);
    const after = await db.prospect.findUnique({
      where: { id: prospectId },
      select: { stage: true, convertedSubcontractorId: true },
    });
    expect(after?.stage, "prospect was marked won with no record of the conversion").toBe(before?.stage);
    expect(after?.convertedSubcontractorId).toBe(before?.convertedSubcontractorId);
  });

  it("9 · leaves availability unchanged when the history entry fails", async () => {
    const before = await db.prospect.findUnique({
      where: { id: prospectId },
      select: { availableCrews: true, earliestStart: true },
    });

    const threw = await expectRollback(() =>
      db.$transaction(async (tx) => {
        await tx.prospect.update({
          where: { id: prospectId },
          data: { availableCrews: 9, earliestStart: "2026-10-01" },
        });
        await tx.prospectAvailabilityEntry.create({ data: { prospectId: GHOST, status: "AVAILABLE_SOON", crews: 9 } });
      }),
    );

    expect(threw).toBe(true);
    const after = await db.prospect.findUnique({
      where: { id: prospectId },
      select: { availableCrews: true, earliestStart: true },
    });
    expect(
      after?.availableCrews,
      "availability changed with nothing in the history to say when or why",
    ).toBe(before?.availableCrews);
    expect(after?.earliestStart).toBe(before?.earliestStart);
  });
});

describe("7 · deleting a daily and its billing lines", () => {
  it("keeps the invoice lines when deleting the daily fails", async () => {
    const dailyId = f.a.dailyId;
    await db.invoiceLine.create({
      data: { invoiceId: f.a.invoiceId, dailyId, code: "BFOV12", quantity: 100 },
    });
    const before = await db.invoiceLine.count({ where: { dailyId } });
    expect(before).toBeGreaterThan(0);

    const threw = await expectRollback(() =>
      db.$transaction(async (tx) => {
        await tx.invoiceLine.deleteMany({ where: { dailyId } });
        await tx.subInvoiceLine.deleteMany({ where: { dailyId } });
        await tx.dailySheet.updateMany({ where: { dailyId }, data: { dailyId: null, status: "DRAFT" } });
        await tx.daily.delete({ where: { id: GHOST } });
      }),
    );

    expect(threw).toBe(true);
    expect(
      await db.invoiceLine.count({ where: { dailyId } }),
      "billing lines were deleted for a daily that still exists — the invoice loses the money",
    ).toBe(before);

    await db.invoiceLine.deleteMany({ where: { dailyId } });
  });
});

describe("8 · accepting a crew invitation", () => {
  it("creates no account when the invitation turns out to be spent", async () => {
    const sub = f.a.crews[0].subcontractorId;
    const email = `tx-test-${Date.now()}@invite.test`;

    // The real-world case this guards: two people open the same forwarded link.
    const spent = await db.subUserInvite.create({
      data: { subcontractorId: sub, email, token: `tok_${Date.now()}`, used: true },
    });

    const threw = await expectRollback(() =>
      db.$transaction(async (tx) => {
        await tx.user.create({
          data: { email, name: "Second Opener", role: "SUBCONTRACTOR", subcontractorId: sub },
          select: { id: true },
        });
        // Matches nothing, because the invitation is already used.
        await tx.subUserInvite.update({
          where: { token: spent.token, used: false },
          data: { used: true },
        });
      }),
    );

    expect(threw, "a spent invitation was accepted a second time").toBe(true);
    expect(
      await db.user.count({ where: { email } }),
      "an account was created from an invitation that was already used",
    ).toBe(0);

    await db.subUserInvite.delete({ where: { token: spent.token } });
  });
});

describe("the conversion did not change what a successful path does", () => {
  it("commits both statements when nothing fails", async () => {
    const p = await db.prospect.create({ data: { name: "Commit Path Crew", kind: "SUBCONTRACTOR" } });

    await db.$transaction(async (tx) => {
      await tx.prospect.update({ where: { id: p.id }, data: { stage: "QUALIFYING" } });
      await tx.prospectActivity.create({ data: { prospectId: p.id, kind: "stage", body: "Moved" } });
    });

    const after = await db.prospect.findUnique({ where: { id: p.id }, select: { stage: true } });
    expect(after?.stage).toBe("QUALIFYING");
    expect(await db.prospectActivity.count({ where: { prospectId: p.id } })).toBe(1);
  });
});
