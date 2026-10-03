/**
 * The schema is checked against the database it will actually meet.
 *
 * Every other test in this suite runs against a schema built FROM
 * `prisma/schema.prisma`, which means none of them can see a disagreement
 * between that file and production. That is not a hypothetical gap. A stray
 * `sed` put `subcontractorName` on the `User` model as well as the one it was
 * aimed at; no migration created the column; the whole suite passed. The first
 * symptom would have been sign-in failing in production, because the generated
 * client selects every declared field.
 *
 * So this one talks to production, read-only, and asks three questions:
 *
 *   Does anything in `prisma/pending` claim to be appliable without having been
 *   reviewed?
 *   Does production differ from the committed schema in any way the pending
 *   migration does not explain?
 *   Would reconciling production require removing or rewriting anything?
 *
 * It writes nothing. `prisma migrate diff` introspects and returns SQL.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PENDING as PENDING_MIGRATIONS, REVIEWED } from "../../prisma/release/apply-production";
import { formatReport, objectsCreatedBy, reportFor, sha256Of } from "../../prisma/release/production-diff";

const PENDING = "prisma/pending";

/** Migration files, as `NNN-name.sql`. Helper scripts in the folder are not. */
function migrationFiles(): string[] {
  return readdirSync(PENDING)
    .filter((f) => /^\d{3}-.*\.sql$/.test(f))
    .sort();
}

/**
 * Production's direct endpoint, or null.
 *
 * Null is never silently treated as a pass — see the first test, which fails
 * when it is missing. A gate that quietly skips itself when a credential is
 * absent is a gate that will be absent on the day it matters.
 */
function productionUrl(): string | null {
  const raw = process.env.DATABASE_URL_UNPOOLED;
  if (!raw) return null;
  const u = new URL(raw);
  if (u.host.includes("-pooler")) return null;
  return raw;
}

describe("a migration cannot be applied unless it has been reviewed", () => {
  it("knows about every migration file on disk, or deliberately does not", () => {
    /**
     * The reviewed set is an allowlist, and the point of an allowlist is that
     * adding a file to the folder is not enough. This does not demand that
     * every file be reviewed — 001 through 011 are applied and historical — it
     * demands that the set never names a file that is not there, which is how
     * an allowlist rots into a list of paths nobody can resolve.
     */
    for (const [key, entry] of Object.entries(REVIEWED)) {
      const name = entry.file.replace(/^prisma\/pending\//, "");
      expect(migrationFiles(), `${key} points at a file that does not exist`).toContain(name);
    }
  });

  it("refuses a name that is not in the set", () => {
    expect(REVIEWED["014"]).toBeUndefined();
    expect(REVIEWED[""]).toBeUndefined();
    // The applier reads REVIEWED[key] and throws when it is undefined; this
    // holds the shape that makes that true.
    expect(Object.keys(REVIEWED).every((k) => /^\d{3}$/.test(k))).toBe(true);
  });

  it("pins the bytes of every reviewed migration", () => {
    /**
     * A reviewed migration is reviewed as a specific sequence of statements. A
     * file edited after review — by a rebase, a merge, a well-meant tidy — is a
     * different migration wearing a reviewed name, and nothing else in the
     * applier would notice.
     */
    /**
     * Every reviewed file, applied or not.
     *
     * The hash does not stop mattering once a migration has gone in — it is how
     * anybody later proves what production actually received, against a file
     * that has sat in the tree through a dozen rebases since.
     */
    for (const [key, entry] of Object.entries(REVIEWED)) {
      if (!entry.sha256) continue;
      expect(sha256Of(entry.file), key + " has been edited since it was reviewed").toBe(entry.sha256);
    }

    // The two applied on 2 October, named outright so a careless edit to
    // REVIEWED cannot quietly re-point them.
    expect(REVIEWED["012"].sha256).toBe(
      "762ab58196f1130bb0d24a6f6bdb13e31e7d04a871982704e9e2060f6731fcd2",
    );
    expect(REVIEWED["013"].sha256).toBe(
      "4328b1527a35aca697a49abc833ea55eabae7e0e29c3cd893bcbd7ca31473b56",
    );
  });

  it("creates nothing destructive in the pending migration itself", () => {
    const sql = readFileSync(join(PENDING, "012-incidents.sql"), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");

    for (const pattern of [
      /\bDROP\s+TABLE\b/i,
      /\bDROP\s+COLUMN\b/i,
      /\bTRUNCATE\b/i,
      /\bDELETE\s+FROM\b/i,
      /\bALTER\s+COLUMN\b[\s\S]*\bSET\s+NOT\s+NULL\b/i,
    ]) {
      expect(sql, `012 contains ${pattern}`).not.toMatch(pattern);
    }
  });

  it("names the objects it creates, so a diff can be matched against it", () => {
    const sql = readFileSync(join(PENDING, "012-incidents.sql"), "utf8");
    const created = objectsCreatedBy(sql);
    for (const name of [
      "incident",
      "incidentevent",
      "incidentnotification",
      "counter",
      "incidenttype",
      "projectphoto.incidentid",
      "conversation.incidentid",
    ]) {
      expect(created, `012 does not create ${name}`).toContain(name);
    }
  });
});

/**
 * Everything not yet applied, as one body of SQL.
 *
 * The committed schema is ahead of production by the sum of the pending
 * migrations, not by any single one of them. Checking against only the newest
 * would report every earlier pending change as drift, and checking against only
 * the oldest would report the newest as drift — both of which teach people to
 * ignore this test, which is worse than not having it.
 */
const PENDING_KEYS = PENDING_MIGRATIONS;

function pendingSql(): string {
  return PENDING_KEYS.map((k) => readFileSync(REVIEWED[k].file, "utf8")).join("\n");
}

describe("the committed schema against production", () => {
  const url = productionUrl();

  it("has a production endpoint to check against", () => {
    /**
     * Deliberately a failure rather than a skip. The defect this file exists
     * for was invisible to a suite that had no production connection, and a
     * gate that turns itself off when a credential is missing provides exactly
     * the confidence it did then.
     *
     * Set DATABASE_URL_UNPOOLED. It must be the direct endpoint: a pooled
     * session can carry an earlier session's search_path, and introspection
     * through one has already been measured returning the wrong answer here.
     */
    expect(
      url,
      "DATABASE_URL_UNPOOLED is unset or points at a pooled endpoint — the production diff cannot run",
    ).toBeTruthy();
  });

  it("differs from production only in ways the pending migration explains", () => {
    if (!url) return; // the test above has already failed
    const report = reportFor(url, pendingSql());

    expect(
      report.unexpected.map((s) => s.sql.replace(/\s+/g, " ").slice(0, 140)),
      `production does not match the committed schema:\n${formatReport(report)}`,
    ).toEqual([]);
  });

  it("would need nothing destructive to reconcile", () => {
    if (!url) return;
    const report = reportFor(url, pendingSql());

    expect(
      report.destructive.map((s) => s.sql.replace(/\s+/g, " ").slice(0, 140)),
      "reconciling production would remove or rewrite something",
    ).toEqual([]);
  });

  it("agrees with the pending list about what is outstanding", () => {
    if (!url) return;
    const report = reportFor(url, pendingSql());

    /**
     * The pending list and the database have to tell the same story.
     *
     * Empty list, clean database: production is level with the schema, which is
     * the state after a rollout. A non-empty list means there is work the
     * database has not had yet, and the diff should show it.
     *
     * The two failures this catches are the ones people actually make: applying
     * a migration and forgetting to take it out of PENDING, and adding one to
     * REVIEWED without ever listing it — the second of which would let the
     * whole production-diff check pass vacuously, because nothing would be
     * expected and nothing unexpected.
     */
    if (PENDING_MIGRATIONS.length === 0) {
      expect(
        report.statements.length,
        `nothing is listed as pending, but production is ${report.statements.length} statement(s) behind the schema`,
      ).toBe(0);
    } else {
      expect(
        report.expected.length,
        `${PENDING_MIGRATIONS.join(", ")} listed as pending, but production already matches — were they applied without being removed from PENDING?`,
      ).toBeGreaterThan(0);
    }
  });
});
