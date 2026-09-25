/**
 * A disposable copy of the application schema, in its own Postgres schema.
 *
 * There is no second database available here — no Docker, no local Postgres,
 * no Neon API key — so the suite runs inside a `vq_test_*` schema in the same
 * Neon instance. `prisma/_test-schema-probe.ts` proves that is genuinely
 * separate: `?schema=` is honoured, an unqualified `"Project"` does not resolve
 * to production's table, and writes land only in the test schema.
 *
 * Everything below is written on the assumption that the guard is the only
 * thing standing between a test run and the live database, so it refuses
 * loudly rather than trying to be clever.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

/**
 * The schema this run owns. One per run, so two runs cannot collide.
 *
 * Shared through a file rather than a module constant. Vitest loads the global
 * setup and each test file as separate module instances, so a constant
 * generated at import time gives every file a *different* name — and a test
 * that connects to a schema nobody built sees an empty database and fails for
 * a reason that has nothing to do with what it is testing. That is exactly
 * what happened, and it made a genuinely-failing assertion look like it was
 * failing for the right reason.
 */
const SCHEMA_FILE = join(process.cwd(), "tests", ".schema");
const SCHEMA_FILE_B = join(process.cwd(), "tests", ".schema-b");

function schemaForThisRun(file: string, prefix: string): string {
  try {
    const named = readFileSync(file, "utf8").trim();
    if (named) return named;
  } catch {
    /* the global setup has not written it yet — we are the one creating it */
  }
  return `${prefix}${randomBytes(4).toString("hex")}`;
}

export const TEST_SCHEMA = schemaForThisRun(SCHEMA_FILE, "vq_test_");

/**
 * A second, wholly separate copy of the application schema.
 *
 * The organisation proxy routes between two *databases* in production. There is
 * only one database reachable from here, so the proxy's routing is proved
 * between two schemas instead: the registry is pointed at both, and a row
 * written under one organisation has to be invisible under the other. That
 * tests the thing step 2 actually introduces — which connection a call lands
 * on — without needing Apex to have a schema, which this phase forbids.
 *
 * Step 1's gate already proved the two real Neon projects cannot see each
 * other. This proves the code picks the right one. Neither proof covers the
 * other, so both exist.
 *
 * Named with the same `vq_test_` prefix so the production guard applies to it
 * unchanged.
 */
export const TEST_SCHEMA_B = schemaForThisRun(SCHEMA_FILE_B, "vq_test_b_");

/** Called once by the global setup, so every test file resolves the same names. */
export function publishSchemaName(): void {
  writeFileSync(SCHEMA_FILE, TEST_SCHEMA);
  writeFileSync(SCHEMA_FILE_B, TEST_SCHEMA_B);
}

export function clearSchemaName(): void {
  for (const f of [SCHEMA_FILE, SCHEMA_FILE_B]) {
    try {
      rmSync(f, { force: true });
    } catch {
      /* nothing to clean */
    }
  }
}

/**
 * The tests use the POOLED endpoint, and that is not interchangeable.
 *
 * `?schema=` is honoured on the pooled endpoint — `search_path` becomes the
 * named schema alone, and an unqualified `"Project"` cannot see production's.
 * On the direct endpoint the parameter is **ignored**: `search_path` stays
 * `"$user", public`, so every unqualified read and write lands on the live
 * data. That is not a subtle difference and it is not documented anywhere the
 * connection string can tell you about.
 *
 * It was found the hard way. A rehearsal script pointed at the direct endpoint
 * created three projects and three subcontractors in production before anyone
 * noticed, because the schema parameter it was relying on did nothing.
 *
 * So: pooled here, and `assertIsolated` below proves it on every run rather
 * than trusting this comment.
 */
/**
 * Neon endpoints that hold a live business, by their endpoint id.
 *
 * Kept here as well as in prisma/provision/targets.ts on purpose: a test run
 * must refuse on its own evidence rather than by importing a module that a
 * future refactor could quietly drop.
 */
const PRODUCTION_MARKS: { mark: string; who: string }[] = [
  { mark: "damp-mouse", who: "Fortitude Infrastructure (production)" },
  { mark: "aged-dew", who: "Apex Construction Group (demonstration tenant)" },
];

/**
 * Where the suite is allowed to build its disposable schemas.
 *
 * This used to be DATABASE_URL, which meant every run created and dropped
 * schemas inside Fortitude's production database. The schema guards held —
 * public was never touched — but "the guard held" is the wrong thing to be
 * relying on, and twelve schemas left by failed drops are still sitting in
 * that database because of it.
 *
 * So the address is its own variable now, and a production endpoint is
 * refused by identity whichever variable supplies it. A suite that cannot
 * find a safe database must stop, not fall back to the live one.
 */
function baseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "No test database configured. Set TEST_DATABASE_URL to a database that is not production.",
    );
  }

  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    throw new Error("The test database URL is not a URL this can identify. Refusing.");
  }

  for (const { mark, who } of PRODUCTION_MARKS) {
    if (host.includes(mark)) {
      throw new Error(
        `Refusing to run: that endpoint is ${who}. The suite creates and drops schemas, ` +
          "which must never happen in a live tenant's database. Set TEST_DATABASE_URL to a " +
          "separate Neon project or branch.",
      );
    }
  }
  return url;
}

/**
 * Prove the connection cannot see production before writing a single row.
 *
 * Two independent checks, both of which must hold: the resolved schema search
 * path is exactly the test schema and nothing else, and `public."Project"` —
 * a table that certainly exists on the live database — is not reachable by an
 * unqualified name.
 */
export async function assertIsolated(schema = TEST_SCHEMA): Promise<void> {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl(schema) } } });
  try {
    const rows = await db.$queryRawUnsafe<{ s: string[] }[]>(`SELECT current_schemas(false) AS s`);
    const path = rows[0].s;
    if (path.length !== 1 || path[0] !== schema) {
      throw new Error(
        `Refusing to run: schema path resolved to [${path.join(", ")}], not [${schema}] alone. ` +
          `The ?schema= parameter is being ignored — check this is the pooled endpoint.`,
      );
    }
    let reachedProduction = false;
    try {
      await db.$queryRawUnsafe(`SELECT 1 FROM "Project" LIMIT 1`);
      reachedProduction = true;
    } catch {
      /* the only acceptable outcome: no such table in this schema */
    }
    if (reachedProduction) {
      throw new Error(
        'Refusing to run: an unqualified "Project" resolved to a real table before the ' +
          "test schema was built. This connection can see production.",
      );
    }
  } finally {
    await db.$disconnect();
  }
}

/** The connection string the application under test is given. */
export function testDatabaseUrl(schema = TEST_SCHEMA): string {
  const u = new URL(baseUrl());
  u.searchParams.set("schema", schema);
  return u.toString();
}

/**
 * Refuse to run anywhere that could be production.
 *
 * Three independent conditions, all of which must hold. Any one of them
 * failing stops the run — a test suite that quietly points at the live
 * database is worse than no test suite.
 */
export function assertNotProduction(url: string): void {
  const u = new URL(url);
  const schema = u.searchParams.get("schema");

  if (!schema) {
    throw new Error("Refusing to run: the connection string names no schema, so it would use public.");
  }
  if (!schema.startsWith("vq_test_")) {
    throw new Error(`Refusing to run: schema "${schema}" is not a vq_test_* schema.`);
  }
  if (schema === "public") {
    throw new Error("Refusing to run against the public schema.");
  }
}

/** Connected as the owner, against `public`, only to create and drop schemas. */
function ownerClient() {
  return new PrismaClient({ datasources: { db: { url: baseUrl() } } });
}

export async function publicTableCount(): Promise<number> {
  const owner = ownerClient();
  try {
    const r = await owner.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    return Number(r[0].n);
  } finally {
    await owner.$disconnect();
  }
}

/**
 * Stand the application schema up in the test schema.
 *
 * `db push` rather than `migrate deploy` because there is no migrations folder
 * yet — adopting one is itself a Phase 0 task. `--accept-data-loss` is
 * deliberately NOT passed: against an empty schema nothing can be lost, and if
 * the schema parameter were ever ignored the command would refuse rather than
 * reshape production.
 */
export async function createTestSchema(schema = TEST_SCHEMA): Promise<void> {
  const url = testDatabaseUrl(schema);
  assertNotProduction(url);

  const before = await publicTableCount();

  const owner = ownerClient();
  try {
    await owner.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  } finally {
    await owner.$disconnect();
  }

  // Before anything is written, prove the connection cannot reach production.
  await assertIsolated(schema);

  // Run Prisma's entrypoint under this Node rather than through npx: current
  // Node refuses to spawn a .cmd shim on Windows (EINVAL), and going through a
  // shell to work around that would mean the connection string — which carries
  // the database password — passes through a command line.
  /**
   * `db push`, retried on one specific transient failure.
   *
   * Occasionally the schema engine comes back with
   *
   *     ERROR: no schema has been selected to create in
   *
   * on a schema that demonstrably exists — the assertion above has just read
   * rows through it. It is the pooler: the engine is a separate process that
   * opens its own connection, and a reused backend does not always get the
   * `?schema=` startup parameter applied, so it arrives with an empty
   * `search_path` and cannot create anything.
   *
   * This is the same family as the production incident earlier in this work,
   * and the honest response is the same: do not paper over it, name it. Two
   * retries, only for this message, and anything else fails immediately. A
   * `db push` that has genuinely broken should still stop the run on the first
   * attempt.
   *
   * Using the direct endpoint instead would be the obvious fix and is the
   * wrong one: it ignores `?schema=` entirely, which is how a rehearsal script
   * once wrote test data into live tables.
   */
  const POOLER_LOST_SEARCH_PATH = "no schema has been selected to create in";
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync(
        process.execPath,
        [require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate"],
        { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url }, stdio: "pipe" },
      );
      break;
    } catch (e) {
      const detail = `${(e as { stdout?: Buffer }).stdout ?? ""}${(e as { stderr?: Buffer }).stderr ?? ""}`;
      if (attempt >= 3 || !detail.includes(POOLER_LOST_SEARCH_PATH)) throw e;

      /**
       * Start the schema again before retrying.
       *
       * The failed attempt is not a no-op: it gets far enough to create the
       * enums before the statement that needs a search path fails, so a plain
       * retry dies on `type "…" already exists` — which is a confusing error
       * about a real problem that has already been solved. The schema is
       * disposable and holds nothing at this point, so the honest reset is to
       * drop it.
       */
      console.log(`  the pooler dropped the schema path; starting ${schema} again (${attempt}/2)…`);
      const owner = ownerClient();
      try {
        await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await owner.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
      } finally {
        await owner.$disconnect();
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  await installPartialIndexes(schema);

  const after = await publicTableCount();
  if (after !== before) {
    throw new Error(
      `Tripwire: the public schema went from ${before} tables to ${after}. Something escaped the test schema.`,
    );
  }
}

/**
 * The constraints `db push` cannot create.
 *
 * Prisma's schema language has no partial index, so this one lives only in
 * prisma/pending/007-workforce.sql — and `db push` builds the test schema
 * from schema.prisma. Without this the suite would run against a database
 * missing the single invariant Workforce depends on most, and a test proving
 * an employee cannot open two shifts at once would pass for the wrong reason,
 * or fail for one.
 *
 * Kept deliberately small: it mirrors one statement from 007 and nothing
 * else. Anything larger belongs in the migration, not here.
 *
 * Fails the run if it cannot be created. A test environment that quietly
 * differs from production on the constraint under test is worse than no test
 * environment, because it produces evidence nobody can use.
 */
async function installPartialIndexes(schema: string): Promise<void> {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl(schema) } } });
  try {
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntry_one_open_per_employee"
         ON "TimeEntry"("employeeId") WHERE "clockOutAt" IS NULL`,
    );
    const rows = await db.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname = 'TimeEntry_one_open_per_employee'`,
    );
    if (rows.length !== 1) {
      throw new Error("the partial unique index was not created");
    }
  } catch (e) {
    throw new Error(
      "Could not install TimeEntry_one_open_per_employee into the test schema. " +
        "Production enforces one open shift per employee with this index and the suite " +
        "must run against the same rule. Refusing to continue. " +
        (e instanceof Error ? e.message : String(e)),
    );
  } finally {
    await db.$disconnect();
  }
}

export async function dropTestSchema(schema = TEST_SCHEMA): Promise<void> {
  const owner = ownerClient();
  try {
    await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    await owner.$disconnect();
  }
}

/** A client bound to the test schema, for seeding and for asserting on state. */
export function testClient(schema = TEST_SCHEMA): PrismaClient {
  const url = testDatabaseUrl(schema);
  assertNotProduction(url);
  return new PrismaClient({ datasources: { db: { url } } });
}
