/**
 * The one backfill in 002, executed rather than read.
 *
 * It moves the crew number Globe issued out of the sheet component and onto the
 * Globe customer row. That is a write against an existing production row, so
 * the question is not whether it works — it is whether it can reach anything
 * else. A statement that assigns one prime's billing identifier to the wrong
 * customer does not look wrong on the paperwork.
 *
 * The statement is read out of 002-org-settings.sql, not retyped here, so this
 * tests the SQL that will actually run. It executes against the test schema,
 * never production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TEST_SCHEMA, testClient } from "../support/test-db";

const GLOBE_NUMBER = "24208171927-A27-311";

/**
 * The UPDATE from the migration, re-aimed at the test schema.
 *
 * The statement is schema-qualified — `"public"."Customer"` — because that is
 * what it must say to run against the real database. A qualified name ignores
 * `search_path`, so executing it verbatim from here would reach straight past
 * the test schema and into production's own tables, on the same Neon database.
 * The first version of this file did exactly that. It failed closed, because
 * 002 is unapplied and the column it names does not exist there yet — but
 * "saved by the thing we have not done yet" is not a safety property.
 *
 * So every `"public".` is rewritten to this run's schema, and nothing else is
 * touched: the guards, the value and the table are the migration's own. The
 * assertion below refuses to hand back anything still pointing at public.
 */
function backfillSql(): string {
  const sql = readFileSync(resolve(process.cwd(), "prisma/pending/002-org-settings.sql"), "utf8");
  const m = /UPDATE "public"\."Customer" c[\s\S]*?;/.exec(sql);
  if (!m) throw new Error("the backfill statement was not found in 002-org-settings.sql");

  const aimed = m[0].replace(/"public"\./g, `"${TEST_SCHEMA}".`);
  if (aimed.includes('"public".')) {
    throw new Error("the backfill statement still names the public schema — refusing to run it");
  }
  return aimed;
}

const db = testClient(TEST_SCHEMA);

/** Rows this file created, removed however it ends. */
const madeCustomers: string[] = [];
const madeOrgs: string[] = [];

afterEach(async () => {
  if (madeCustomers.length) {
    await db.customer.deleteMany({ where: { id: { in: madeCustomers.splice(0) } } });
  }
  if (madeOrgs.length) {
    await db.organization.deleteMany({ where: { id: { in: madeOrgs.splice(0) } } });
  }
});

async function customer(name: string, crewNumber = "") {
  const c = await db.customer.create({
    data: {
      name,
      shortCode: name.slice(0, 3).toUpperCase(),
      industry: "Telecom",
      tone: "info",
      status: "Active",
      logoTint: "#3b6ea5",
      location: "Invented County",
      crewNumber,
    },
  });
  madeCustomers.push(c.id);
  return c;
}

async function organisation(name: string) {
  const o = await db.organization.create({ data: { name, plan: "Enterprise" } });
  madeOrgs.push(o.id);
  return o;
}

const numberOf = async (id: string) =>
  (await db.customer.findUnique({ where: { id }, select: { crewNumber: true } }))?.crewNumber;

describe("the Globe crew-number backfill", () => {
  it("does nothing in a database that is not this contractor's", async () => {
    // The fixtures' organisations are Northgate and Barrow. No Fortitude, so
    // the guard fails even though the customer name matches exactly.
    const globe = await customer("GLOBE COMMUNICATIONS");
    await db.$executeRawUnsafe(backfillSql());

    expect(
      await numberOf(globe.id),
      "a customer named GLOBE COMMUNICATIONS was given the number in another organisation's database",
    ).toBe("");
  });

  it("sets it for Globe once the database is this contractor's", async () => {
    // The positive control. Without this the test above would pass against a
    // statement that never does anything at all.
    await organisation("Fortitude Infrastructure");
    const globe = await customer("GLOBE COMMUNICATIONS");
    await db.$executeRawUnsafe(backfillSql());

    expect(await numberOf(globe.id), "the backfill did not set Globe's number").toBe(GLOBE_NUMBER);
  });

  it("leaves Trawick and every other customer alone", async () => {
    await organisation("Fortitude Infrastructure");
    const globe = await customer("GLOBE COMMUNICATIONS");
    const trawick = await customer("Trawick Construction");
    const third = await customer("Halvern Networks");

    await db.$executeRawUnsafe(backfillSql());

    expect(await numberOf(globe.id)).toBe(GLOBE_NUMBER);
    expect(await numberOf(trawick.id), "Trawick was given Globe's crew number").toBe("");
    expect(await numberOf(third.id), "an unrelated customer was given Globe's crew number").toBe("");
  });

  it("never overwrites a number somebody has already set", async () => {
    await organisation("Fortitude Infrastructure");
    const globe = await customer("GLOBE COMMUNICATIONS", "CORRECTED-IN-APP-0001");

    await db.$executeRawUnsafe(backfillSql());

    expect(
      await numberOf(globe.id),
      "the backfill overwrote a crew number that had been corrected in the application",
    ).toBe("CORRECTED-IN-APP-0001");
  });

  it("is safe to run twice", async () => {
    await organisation("Fortitude Infrastructure");
    const globe = await customer("GLOBE COMMUNICATIONS");

    await db.$executeRawUnsafe(backfillSql());
    await db.$executeRawUnsafe(backfillSql());

    expect(await numberOf(globe.id)).toBe(GLOBE_NUMBER);
  });

  it("touches nothing but that one column", async () => {
    await organisation("Fortitude Infrastructure");
    await customer("GLOBE COMMUNICATIONS");

    const before = await Promise.all([
      db.customerRate.count(),
      db.daily.count(),
      db.dailySheet.count(),
      db.invoice.count(),
      db.project.count(),
    ]);
    await db.$executeRawUnsafe(backfillSql());
    const after = await Promise.all([
      db.customerRate.count(),
      db.daily.count(),
      db.dailySheet.count(),
      db.invoice.count(),
      db.project.count(),
    ]);

    expect(after, "the backfill changed a row count outside Customer").toEqual(before);
  });

  it("is aimed at this run's schema and never at production", async () => {
    // The guard that makes everything above safe to execute at all.
    const aimed = backfillSql();
    expect(aimed.includes('"public".'), "the statement under test names the public schema").toBe(false);
    expect(aimed.includes(`"${TEST_SCHEMA}"."Customer"`), "the statement was not re-aimed").toBe(true);
  });

  it("is the only statement in 002 that writes to an existing row", async () => {
    // A second UPDATE or a DELETE appearing here later would slip past every
    // test above, because they only ever execute the one statement they find.
    const sql = readFileSync(resolve(process.cwd(), "prisma/pending/002-org-settings.sql"), "utf8");
    const code = sql.replace(/^\s*--.*$/gm, "");

    expect((code.match(/\bUPDATE\b/gi) ?? []).length, "002 gained another UPDATE").toBe(1);
    expect((code.match(/\bDELETE\b/gi) ?? []).length, "002 contains a DELETE").toBe(0);
    expect((code.match(/\bDROP\b/gi) ?? []).length, "002 contains a DROP").toBe(0);
    expect((code.match(/\bTRUNCATE\b/gi) ?? []).length, "002 contains a TRUNCATE").toBe(0);
  });
});
