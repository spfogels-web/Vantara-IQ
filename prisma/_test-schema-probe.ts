/**
 * Before building an isolation suite on a throwaway schema, prove the schema
 * really is separate.
 *
 * The plan is to run the whole application schema inside `vq_test_*` in the
 * same Neon database, so the tests exercise the real routes and the real
 * authz code without going near the `public` schema the business runs on.
 * That is only safe if Prisma's `?schema=` parameter is actually honoured.
 *
 * This checks it, and checks the tripwire: if the parameter were ignored, a
 * client pointed at the test schema would be able to see production's tables.
 * It must not.
 *
 *   npx tsx prisma/_test-schema-probe.ts
 */
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const owner = new PrismaClient();
const SCHEMA = `vq_probe_${randomBytes(3).toString("hex")}`;

function urlWithSchema(schema: string) {
  const u = new URL(process.env.DATABASE_URL!);
  u.searchParams.set("schema", schema);
  return u.toString();
}

async function publicTableCount() {
  const r = await owner.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  return Number(r[0].n);
}

async function main() {
  const before = await publicTableCount();
  console.log(`public schema has ${before} tables before anything happens\n`);

  await owner.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA}`);
  const probe = new PrismaClient({ datasources: { db: { url: urlWithSchema(SCHEMA) } } });

  const cur = await probe.$queryRawUnsafe<{ s: string }[]>(`SELECT current_schema() AS s`);
  const honoured = cur[0].s === SCHEMA;
  console.log(`  current_schema() with ?schema=${SCHEMA}`);
  console.log(`    -> ${cur[0].s}   ${honoured ? "honoured" : "!!! IGNORED — do not proceed"}`);

  // The tripwire. Unqualified, this must not resolve to production's table.
  let sawProduction = false;
  try {
    await probe.$queryRawUnsafe(`SELECT count(*) FROM "Project"`);
    sawProduction = true;
  } catch {
    /* expected: no such table in the test schema */
  }
  console.log(
    `  unqualified "Project" from the test schema`,
  );
  console.log(
    `    -> ${sawProduction ? "!!! RESOLVED TO PRODUCTION" : "no such table (correctly isolated)"}`,
  );

  // And prove a write lands in the test schema and nowhere else.
  await probe.$executeRawUnsafe(`CREATE TABLE canary (id text PRIMARY KEY)`);
  const whereDidItLand = await owner.$queryRawUnsafe<{ table_schema: string }[]>(
    `SELECT table_schema FROM information_schema.tables WHERE table_name = 'canary'`,
  );
  console.log(`  a CREATE TABLE from that client landed in: ${whereDidItLand.map((r) => r.table_schema).join(", ")}`);

  await probe.$disconnect();
  await owner.$executeRawUnsafe(`DROP SCHEMA ${SCHEMA} CASCADE`);

  const after = await publicTableCount();
  console.log(`\npublic schema has ${after} tables afterwards   ${after === before ? "unchanged" : "!!! CHANGED"}`);

  const safe =
    honoured &&
    !sawProduction &&
    whereDidItLand.length === 1 &&
    whereDidItLand[0].table_schema === SCHEMA &&
    after === before;
  console.log(`\n${safe ? "SAFE to build the suite on a throwaway schema." : "NOT SAFE — stop."}`);
  if (!safe) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error("PROBE FAILED:", e);
    await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => owner.$disconnect());
