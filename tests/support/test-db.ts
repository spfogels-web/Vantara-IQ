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

import { PrismaClient } from "@prisma/client";

/** The schema this run owns. One per run, so two runs cannot collide. */
export const TEST_SCHEMA = `vq_test_${randomBytes(4).toString("hex")}`;

/**
 * The tests deliberately use the UNPOOLED endpoint.
 *
 * Prisma pins `search_path` from the `?schema=` parameter as a session
 * setting. Neon's pooler hands a backend to the next client without clearing
 * that, so a test run left `search_path = vq_test_…` on a pooled connection
 * that a later process — using the plain production URL, with no schema
 * parameter at all — then inherited. It was still there after the schema had
 * been dropped.
 *
 * Prisma schema-qualifies the SQL it generates, so the application itself was
 * unaffected. The exposure is raw SQL, which resolves through `search_path`,
 * and there are two such sites in the codebase. Going direct keeps the test
 * run's session state out of the pool entirely.
 */
function baseUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Tests need it to reach Neon.");
  return url;
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
