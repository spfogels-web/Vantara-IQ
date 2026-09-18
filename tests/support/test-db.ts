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

function schemaForThisRun(): string {
  try {
    const named = readFileSync(SCHEMA_FILE, "utf8").trim();
    if (named) return named;
  } catch {
    /* the global setup has not written it yet — we are the one creating it */
  }
  return `vq_test_${randomBytes(4).toString("hex")}`;
}

export const TEST_SCHEMA = schemaForThisRun();

/** Called once by the global setup, so every test file resolves the same name. */
export function publishSchemaName(): void {
  writeFileSync(SCHEMA_FILE, TEST_SCHEMA);
}

export function clearSchemaName(): void {
  try {
    rmSync(SCHEMA_FILE, { force: true });
  } catch {
    /* nothing to clean */
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
function baseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Tests need it to reach Neon.");
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
export async function assertIsolated(): Promise<void> {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
  try {
    const rows = await db.$queryRawUnsafe<{ s: string[] }[]>(`SELECT current_schemas(false) AS s`);
    const path = rows[0].s;
    if (path.length !== 1 || path[0] !== TEST_SCHEMA) {
      throw new Error(
        `Refusing to run: schema path resolved to [${path.join(", ")}], not [${TEST_SCHEMA}] alone. ` +
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
export async function createTestSchema(): Promise<void> {
  const url = testDatabaseUrl();
  assertNotProduction(url);

  const before = await publicTableCount();

  const owner = ownerClient();
  try {
    await owner.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
  } finally {
    await owner.$disconnect();
  }

  // Before anything is written, prove the connection cannot reach production.
  await assertIsolated();

  // Run Prisma's entrypoint under this Node rather than through npx: current
  // Node refuses to spawn a .cmd shim on Windows (EINVAL), and going through a
  // shell to work around that would mean the connection string — which carries
  // the database password — passes through a command line.
  execFileSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate"],
    { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url }, stdio: "pipe" },
  );

  const after = await publicTableCount();
  if (after !== before) {
    throw new Error(
      `Tripwire: the public schema went from ${before} tables to ${after}. Something escaped the test schema.`,
    );
  }
}

export async function dropTestSchema(): Promise<void> {
  const owner = ownerClient();
  try {
    await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
  } finally {
    await owner.$disconnect();
  }
}

/** A client bound to the test schema, for seeding and for asserting on state. */
export function testClient(): PrismaClient {
  const url = testDatabaseUrl();
  assertNotProduction(url);
  return new PrismaClient({ datasources: { db: { url } } });
}
