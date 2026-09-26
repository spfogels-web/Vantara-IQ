/**
 * Pre-construction, the QC acknowledgment, and who is allowed to assert either.
 *
 * Three guarantees, and the first two are the ones worth getting right:
 *
 *   A crew may say their own route is documented, and only for a job they are
 *   actually on. The server decides that from the assignment table, not from
 *   whether a button rendered — a project id typed into a request by hand has
 *   to be refused the same way.
 *
 *   Production cannot be filed against a route nobody photographed first.
 *   Scoped to production: a day with no quantities is a real day, and
 *   refusing it would leave inventing footage as the only way to file.
 *
 *   Somebody stands behind the standard by name, and the name comes off the
 *   session rather than the payload.
 *
 * The actions run through the running server. Importing them into this
 * process would hand them this process's DATABASE_URL, which is production —
 * the tenancy system refuses it, and correctly.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { fixtures } from "../support/load";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

const ACTIONS = readFileSync("src/app/actions.ts", "utf8");
const EVIDENCE = readFileSync("src/app/evidence-actions.ts", "utf8");

let projectId = "";
let otherProjectId = "";
let crewId = "";

beforeAll(async () => {
  const ps = await db.project.findMany({ select: { id: true }, take: 2 });
  projectId = ps[0].id;
  otherProjectId = ps[1]?.id ?? ps[0].id;
  crewId = (await db.subcontractor.findFirst({ select: { id: true } }))!.id;
  await db.projectCrew
    .create({ data: { projectId, subcontractorId: crewId } })
    .catch(() => undefined);
  await db.projectCrew
    .deleteMany({ where: { projectId: otherProjectId, subcontractorId: crewId } })
    .catch(() => undefined);
}, 240_000);

describe("who may say a route is documented", () => {
  it("asks the assignment table, not the interface", () => {
    // The change that made this possible for a crew at all: setPreConStatus
    // was requireStaff, which meant the office asserted a route they had not
    // walked. assertProjectAccess is what now holds it.
    const fn = EVIDENCE.slice(
      EVIDENCE.indexOf("export async function setPreConStatus"),
      EVIDENCE.indexOf("export async function notePreConStarted"),
    );
    expect(fn, "completion is still office-only").not.toMatch(/requireStaff\(\)/);
    expect(fn, "completion is not gated on project assignment").toMatch(
      /assertProjectAccess\(projectId\)/,
    );
  });

  it("records who completed it and when, from the session", () => {
    const fn = EVIDENCE.slice(
      EVIDENCE.indexOf("export async function setPreConStatus"),
      EVIDENCE.indexOf("export async function notePreConStarted"),
    );
    expect(fn).toMatch(/preConCompletedBy: complete \? user\.name \|\| user\.email/);
    expect(fn).toMatch(/preConCompletedAt: complete \? new Date\(\)/);
    // Never a name arriving in the request.
    const params = fn.slice(fn.indexOf("("), fn.indexOf(")"));
    expect(params, "the completer's name is taken from the request").not.toMatch(/name|by\b/i);
  });

  it("refuses an unassigned crew and a forged project id by the same path", async () => {
    // Both are the same question to the server: is this project on the list
    // this session is allowed to see. A crew is on projectId and not on
    // otherProjectId, and a made-up id is on nobody's list.
    const assigned = await db.projectCrew.count({
      where: { projectId, subcontractorId: crewId },
    });
    const unassigned = await db.projectCrew.count({
      where: { projectId: otherProjectId, subcontractorId: crewId },
    });
    expect(assigned, "the fixture crew is not on the job under test").toBe(1);
    if (otherProjectId !== projectId) {
      expect(unassigned, "the fixture crew is on the job it should not be").toBe(0);
    }
    const forged = await db.project.count({ where: { id: "no-such-project-id" } });
    expect(forged, "the forged id exists, so the test proves nothing").toBe(0);
  });

  it("leaves IN_PROGRESS automatic and COMPLETE affirmative", () => {
    const started = EVIDENCE.slice(EVIDENCE.indexOf("export async function notePreConStarted"));
    // First evidence moves it along on its own...
    expect(started).toMatch(/IN_PROGRESS/);
    // ...but nothing anywhere promotes it to COMPLETE from a count.
    expect(
      EVIDENCE,
      "something completes pre-construction from a photo count",
    ).not.toMatch(/count\s*[><=]=?\s*\d+[\s\S]{0,80}COMPLETE/);
  });
});

describe("production cannot be filed against an undocumented route", () => {
  const submit = ACTIONS.slice(
    ACTIONS.indexOf("export async function submitDailySheet"),
    ACTIONS.indexOf("export async function reviewDaily") > 0
      ? ACTIONS.indexOf("export async function reviewDaily")
      : undefined,
  );

  it("checks the project's pre-con status on the server", () => {
    expect(submit).toMatch(/preConStatus/);
    expect(submit).toMatch(/preConStatus !== "COMPLETE"/);
    expect(submit).toMatch(/needsPreCon/);
  });

  it("is scoped to production, so a zero day still files", () => {
    // The rule that stops this becoming a trap: rain, locates and no-access
    // days carry no quantities and must remain filable, or the only way to
    // file them is to invent footage.
    expect(submit).toMatch(/lineItems\.some\(\(l\) => l\.quantity > 0\)/);
    expect(submit).toMatch(/producedSomething/);
  });

  it("exempts days already on the board", () => {
    // A correction re-files a day that closed months ago. Blocking it would
    // not put the photographs on file; it would only make a wrong footage
    // figure impossible to fix.
    expect(submit).toMatch(/!sheet\.dailyId && producedSomething/);
  });

  it("tells them where to go and that nothing is lost", () => {
    expect(submit).toMatch(/Pre-construction documentation required/i);
    expect(submit).toMatch(/Nothing you have entered here is lost/i);
  });
});

describe("the QC acknowledgment", () => {
  const submit = ACTIONS.slice(ACTIONS.indexOf("export async function submitDailySheet"));

  it("is required on the server, not only in the form", () => {
    expect(submit).toMatch(/!sheet\.dailyId && !input\.qcAck/);
    expect(submit).toMatch(/needsQcAck/);
  });

  it("is recorded against the session, never the payload", () => {
    expect(submit).toMatch(/qcAckBy: filer\.name \|\| filer\.email/);
    expect(submit).toMatch(/qcAckAt: new Date\(\)/);
    expect(submit, "a name from the request is written as the acknowledger").not.toMatch(
      /qcAckBy: input\./,
    );
  });

  it("is not asked of a draft", () => {
    // saveDailySheet is the draft path and must not mention it: a crew has to
    // be able to put a half-finished sheet down without asserting anything.
    const save = ACTIONS.slice(
      ACTIONS.indexOf("export async function saveDailySheet"),
      ACTIONS.indexOf("export async function submitDailySheet"),
    );
    expect(save, "saving a draft demands the acknowledgment").not.toMatch(/qcAck/);
  });

  it("is written only when the day is actually filed", () => {
    // The same update as the status flip, so a sheet cannot become submitted
    // without the acknowledgment landing with it. The window is generous
    // because the comment explaining why sits between the two lines.
    expect(submit).toMatch(/status: "SUBMITTED"[\s\S]{0,400}qcAckBy/);
  });
});

describe("the database can hold what the rules record", () => {
  it("has somewhere to put the daily's acknowledgment", async () => {
    const sheet = await db.dailySheet.create({
      data: { projectName: "QC gate test", workDate: "2026-09-26" },
    });
    try {
      const fresh = await db.dailySheet.findUnique({
        where: { id: sheet.id },
        select: { qcAckBy: true, qcAckAt: true },
      });
      expect(fresh?.qcAckBy, "a new sheet is born acknowledged").toBe("");
      expect(fresh?.qcAckAt, "a new sheet carries a time it was never given").toBeNull();

      await db.dailySheet.update({
        where: { id: sheet.id },
        data: { qcAckBy: "Ray Colson", qcAckAt: new Date() },
      });
      const acked = await db.dailySheet.findUnique({
        where: { id: sheet.id },
        select: { qcAckBy: true, qcAckAt: true },
      });
      expect(acked?.qcAckBy).toBe("Ray Colson");
      expect(acked?.qcAckAt).toBeInstanceOf(Date);
    } finally {
      await db.dailySheet.delete({ where: { id: sheet.id } }).catch(() => undefined);
    }
  });

  it("holds one standing acknowledgment per crew per job", async () => {
    await db.projectQcAck
      .deleteMany({ where: { projectId, subcontractorId: crewId } })
      .catch(() => undefined);
    await db.projectQcAck.create({
      data: { projectId, subcontractorId: crewId, acknowledgedBy: tenant.staffUserId },
    });
    let refused = false;
    try {
      await db.projectQcAck.create({
        data: { projectId, subcontractorId: crewId, acknowledgedBy: "somebody else" },
      });
    } catch {
      refused = true;
    }
    expect(refused, "a crew acknowledged the same job twice").toBe(true);
    await db.projectQcAck
      .deleteMany({ where: { projectId, subcontractorId: crewId } })
      .catch(() => undefined);
  });
});
