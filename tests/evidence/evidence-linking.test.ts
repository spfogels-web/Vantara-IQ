/**
 * What a daily is allowed to claim as its own.
 *
 * Evidence is written the moment a photograph is taken, before the sheet it
 * was taken on has an id. So there is a window in which a real record exists
 * with no daily attached, and a later save has to reach back and claim it.
 * That reaching-back is the part worth testing: it takes ids from a browser,
 * and a browser can send any ids it likes.
 *
 * These run against a real database rather than a stub, because the guard
 * *is* a query — a test that reimplemented the condition in JavaScript would
 * pass no matter what the query actually did.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { linkableEvidenceWhere } from "../../src/lib/evidence";
import { fixtures } from "../support/load";
import { testClient } from "../support/test-db";

const db = testClient();

/** Two projects, so "belongs to another project" is a real row, not a fiction. */
let projectId = "";
let otherProjectId = "";
let sheetId = "";
let otherSheetId = "";

/** One capture per situation the action has to tell apart. */
let loose = ""; // captured on a draft, not yet claimed
let mine = ""; // already on this sheet
let theirs = ""; // already on a different sheet
let elsewhere = ""; // on another project entirely

async function evidence(project: string, sheet: string | null) {
  const row = await db.projectPhoto.create({
    data: {
      projectId: project,
      url: `https://example.invalid/${Math.random().toString(36).slice(2)}.jpg`,
      mediaType: "image/jpeg",
      sizeBytes: 1,
      kind: "PHOTO",
      source: "CAMERA",
      stage: "WORK_RECORD",
      purpose: "RECORD",
      category: "OTHER",
      dailySheetId: sheet,
    },
    select: { id: true },
  });
  return row.id;
}

beforeAll(async () => {
  // The seeded tenant already has two projects and a filed daily on the first
  // of them. Reusing them keeps this test about linking rather than about
  // whatever a project needs to exist.
  const tenant = fixtures().a;
  projectId = tenant.projectId;
  otherProjectId = tenant.project2Id;
  sheetId = tenant.dailySheetId;

  const second = await db.dailySheet.create({
    data: {
      projectId,
      projectName: tenant.projectName,
      workDate: "2026-09-02",
      status: "Draft",
    },
    select: { id: true },
  });
  otherSheetId = second.id;

  loose = await evidence(projectId, null);
  mine = await evidence(projectId, sheetId);
  theirs = await evidence(projectId, otherSheetId);
  elsewhere = await evidence(otherProjectId, null);
});

afterAll(async () => {
  await db.$disconnect();
});

/** The action's own selection, run against the rows above. */
async function linkable(ids: string[]) {
  const rows = await db.projectPhoto.findMany({
    where: linkableEvidenceWhere({ ids, projectId, dailySheetId: sheetId }),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

describe("a daily claims the evidence captured against its draft", () => {
  it("claims a capture that has no daily yet", async () => {
    expect(await linkable([loose])).toEqual([loose]);
  });

  it("claims what it already has, so saving twice changes nothing", async () => {
    // The sheet autosaves as the crew types. Every save after the first sends
    // the same ids, and every one of them must be a no-op rather than an error
    // or a second link.
    expect(await linkable([mine])).toEqual([mine]);
    expect(await linkable([mine])).toEqual([mine]);
  });
});

describe("a daily cannot claim evidence that is not its to claim", () => {
  it("refuses evidence belonging to another project", async () => {
    // The id is real and the row exists — it is simply somebody else's. This
    // is the case a crafted request would use.
    expect(await linkable([elsewhere])).toEqual([]);
  });

  it("refuses evidence already filed on a different daily", async () => {
    expect(await linkable([theirs])).toEqual([]);
  });

  it("refuses an id that does not exist at all", async () => {
    expect(await linkable(["clnotarealidatall000000"])).toEqual([]);
  });

  it("takes the ones it may have and leaves the rest, rather than all or nothing", async () => {
    // A stale browser can hold a mix. The legitimate captures still get
    // linked; the others are counted as refused and reported, not silently
    // dropped and not allowed through on the strength of their neighbours.
    const got = await linkable([loose, elsewhere, theirs]);
    expect(got).toEqual([loose]);
  });
});

describe("evidence outlives the daily it was captured for", () => {
  it("keeps a capture from an abandoned draft on the project", async () => {
    // Nothing here deletes it: a sheet that is never saved leaves its
    // photographs on the project, unlinked, where the office can still find
    // them. The viewer labels them so they are not mistaken for filed work.
    const still = await db.projectPhoto.findUnique({
      where: { id: loose },
      select: { projectId: true, dailySheetId: true },
    });
    expect(still?.projectId).toBe(projectId);
    expect(still?.dailySheetId).toBeNull();
  });
});
