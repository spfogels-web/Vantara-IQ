/**
 * Rehearse the ProjectCrew migration before it goes near production.
 *
 * Builds the schema as it stands on the database *today* inside a disposable
 * schema, puts assignments in the implicit join table, runs
 * prisma/pending/001-project-crew.sql against it, and checks every assignment
 * came across with the right project and the right crew.
 *
 * It also proves the safety check bites: a second pass deliberately orphans a
 * row and the migration must refuse rather than quietly drop it.
 *
 *   npx tsx prisma/_rehearse-001.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const owner = new PrismaClient();
const SCHEMA = `vq_rehearse_${randomBytes(3).toString("hex")}`;
const MIGRATION = readFileSync(join("prisma", "pending", "001-project-crew.sql"), "utf8");
const OLD_SCHEMA_FILE = join("prisma", `_old-${SCHEMA}.prisma`);

/**
 * The POOLED url, deliberately.
 *
 * ?schema= is honoured on the pooled endpoint and ignored on the direct one,
 * where search_path stays "", public. An earlier version of this script
 * used the direct endpoint and created three projects and three
 * subcontractors in production before anyone noticed.
 */
function urlFor(schema: string) {
  const base = process.env.DATABASE_URL!;
  const u = new URL(base);
  u.searchParams.set("schema", schema);
  return u.toString();
}

/** The schema as it is on the database now — i.e. before this migration. */
function writeOldSchema() {
  const current = execFileSync("git", ["show", "HEAD:prisma/schema.prisma"], { encoding: "utf8" });
  writeFileSync(OLD_SCHEMA_FILE, current);
}

function ddlFor(schemaFile: string): string {
  return execFileSync(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      schemaFile,
      "--script",
    ],
    { encoding: "utf8", env: { ...process.env } },
  )
    .split("\n")
    .filter((l) => !l.startsWith("warn ") && !l.includes("prisma-config"))
    .join("\n");
}

/**
 * Apply a whole script.
 *
 * Through `prisma db execute` rather than by splitting on semicolons and
 * feeding the driver one statement at a time: the migration contains a
 * `DO $$ … $$` block whose body is full of semicolons, and a naive split
 * tears it apart. This is also how the migration would really be applied,
 * which is the point of a rehearsal.
 */
function run(schema: string, sql: string, label: string) {
  const file = join("prisma", `_run-${label}.sql`);
  writeFileSync(file, sql);
  try {
    execFileSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "db", "execute", "--file", file, "--url", urlFor(schema)],
      { stdio: "pipe", env: { ...process.env } },
    );
  } finally {
    rmSync(file, { force: true });
  }
}

/**
 * Refuse to touch anything until the connection has proved it cannot see the
 * live data. Asserted rather than assumed, because assuming it is what wrote
 * test rows into production the first time this script ran.
 */
async function assertIsolated(db: PrismaClient, schema: string, when: string) {
  const rows = await db.$queryRawUnsafe<{ s: string[] }[]>(`SELECT current_schemas(false) AS s`);
  const path = rows[0].s;
  if (path.length !== 1 || path[0] !== schema) {
    throw new Error(
      `${when}: schema path is [${path.join(", ")}], not [${schema}] alone — this connection can reach production.`,
    );
  }
  let reached = false;
  try {
    await db.$queryRawUnsafe(`SELECT 1 FROM "Project" LIMIT 1`);
    reached = true;
  } catch {
    /* expected: nothing built here yet */
  }
  if (reached) throw new Error(`${when}: "Project" already resolves to a real table.`);
  console.log(`  isolation checked (${when}): only ${schema} is reachable`);
}

/** After the DDL, the tables must exist *in the test schema*, not elsewhere. */
async function assertBuiltHere(db: PrismaClient, schema: string) {
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM information_schema.tables
      WHERE table_schema = '${schema}' AND table_name IN ('Project', 'Subcontractor', '_ProjectCrews')`,
  );
  if (Number(rows[0].n) !== 3) {
    throw new Error(
      `The schema was not built in ${schema} — found ${rows[0].n} of 3 expected tables. ` +
        `The DDL went somewhere else; stop before writing any rows.`,
    );
  }
  console.log(`  schema built inside ${schema}`);
}

async function main() {
  console.log(`Rehearsing in ${SCHEMA}\n`);
  await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await owner.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA}`);
  writeOldSchema();

  const db = new PrismaClient({ datasources: { db: { url: urlFor(SCHEMA) } } });

  await assertIsolated(db, SCHEMA, "before building");

  console.log("  building today's schema…");
  run(SCHEMA, ddlFor(OLD_SCHEMA_FILE), "ddl");

  // And again once the tables exist: the DDL goes through a separate CLI
  // process with its own connection, and it is exactly that second path that
  // failed to isolate the first time.
  await assertBuiltHere(db, SCHEMA);

  console.log("  seeding projects, crews and assignments…");
  const pairs: { p: string; s: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const p = `proj_${i}`;
    const s = `sub_${i}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "Project" (id, name, client, location, status, tone, "createdAt")
       VALUES ('${p}', 'Job ${i}', 'Client ${i}', 'Somewhere', 'Active', 'info', '2026-01-0${i}')`,
    );
    await db.$executeRawUnsafe(`INSERT INTO "Subcontractor" (id, company) VALUES ('${s}', 'Crew ${i}')`);
    pairs.push({ p, s });
  }
  // Crew 1 is on two jobs, so the copy has to carry more than one row per crew.
  await db.$executeRawUnsafe(`INSERT INTO "_ProjectCrews" ("A","B") VALUES ('proj_1','sub_1')`);
  await db.$executeRawUnsafe(`INSERT INTO "_ProjectCrews" ("A","B") VALUES ('proj_2','sub_1')`);
  await db.$executeRawUnsafe(`INSERT INTO "_ProjectCrews" ("A","B") VALUES ('proj_2','sub_2')`);
  await db.$executeRawUnsafe(`INSERT INTO "_ProjectCrews" ("A","B") VALUES ('proj_3','sub_3')`);

  const before = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "_ProjectCrews"`,
  );
  console.log(`  ${before[0].n} assignments before\n`);

  console.log("  applying prisma/pending/001-project-crew.sql…");
  run(SCHEMA, MIGRATION, "mig");

  const rows = await db.$queryRawUnsafe<{ projectId: string; subcontractorId: string; assignedAt: Date }[]>(
    `SELECT "projectId", "subcontractorId", "assignedAt" FROM "ProjectCrew" ORDER BY "projectId", "subcontractorId"`,
  );
  const got = rows.map((r) => `${r.projectId}/${r.subcontractorId}`).join(" ");
  const want = "proj_1/sub_1 proj_2/sub_1 proj_2/sub_2 proj_3/sub_3";
  console.log(`  after: ${got}`);
  console.log(`  ${got === want ? "every assignment carried across, on the right pair" : "!!! MISMATCH — wanted " + want}`);

  // In UTC. The seeded projects are stamped 2026-01-0N midnight UTC, and read
  // back in a timezone behind UTC that is the last day of December — which is
  // the assertion failing, not the migration.
  const backdated = rows.every(
    (r) => r.assignedAt.getUTCFullYear() === 2026 && r.assignedAt.getUTCMonth() === 0,
  );
  console.log(`  assignedAt backdated to the project rather than stamped now: ${backdated ? "yes" : "!!! no"}`);

  const gone = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM information_schema.tables
      WHERE table_schema = '${SCHEMA}' AND table_name = '_ProjectCrews'`,
  );
  console.log(`  old table removed: ${Number(gone[0].n) === 0 ? "yes" : "!!! still there"}`);

  // The unique constraint must actually hold afterwards.
  let duped = false;
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "ProjectCrew" (id, "projectId", "subcontractorId") VALUES ('dupe','proj_1','sub_1')`,
    );
    duped = true;
  } catch {
    /* expected */
  }
  console.log(`  one assignment per crew per job enforced: ${duped ? "!!! DUPLICATE ACCEPTED" : "yes"}`);

  await db.$disconnect();

  /* ---- and now prove the guard refuses a lossy run ---- */

  console.log("\n  second pass: an assignment pointing at a deleted project…");
  const SCHEMA2 = `${SCHEMA}_b`;
  await owner.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA2}`);
  const db2 = new PrismaClient({ datasources: { db: { url: urlFor(SCHEMA2) } } });
  await assertIsolated(db2, SCHEMA2, "second pass");
  run(SCHEMA2, ddlFor(OLD_SCHEMA_FILE), "ddl2");
  await assertBuiltHere(db2, SCHEMA2);
  await db2.$executeRawUnsafe(
    `INSERT INTO "Project" (id, name, client, location, status, tone) VALUES ('p1','J','C','S','Active','info')`,
  );
  await db2.$executeRawUnsafe(`INSERT INTO "Subcontractor" (id, company) VALUES ('s1','Crew')`);
  await db2.$executeRawUnsafe(`INSERT INTO "_ProjectCrews" ("A","B") VALUES ('p1','s1')`);
  // Drop the foreign key so an orphan can exist at all, then orphan it.
  await db2.$executeRawUnsafe(`ALTER TABLE "_ProjectCrews" DROP CONSTRAINT "_ProjectCrews_A_fkey"`);
  await db2.$executeRawUnsafe(`INSERT INTO "_ProjectCrews" ("A","B") VALUES ('ghost','s1')`);
  await db2.$executeRawUnsafe(`ALTER TABLE "_ProjectCrews" ADD CONSTRAINT "_ProjectCrews_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Project"(id) ON DELETE CASCADE ON UPDATE CASCADE NOT VALID`);

  let refused = false;
  let message = "";
  try {
    run(SCHEMA2, MIGRATION, "mig2");
  } catch (e) {
    refused = true;
    message = (e as Error).message.split("\n").find((l) => l.includes("would lose rows")) ?? "";
  }
  console.log(`  migration refused a lossy copy: ${refused ? "yes" : "!!! IT PROCEEDED"}`);
  if (message) console.log(`    ${message.trim()}`);

  await db2.$disconnect();

  console.log("\nCleaning up…");
  await owner.$executeRawUnsafe(`DROP SCHEMA ${SCHEMA} CASCADE`);
  await owner.$executeRawUnsafe(`DROP SCHEMA ${SCHEMA2} CASCADE`);
  rmSync(OLD_SCHEMA_FILE, { force: true });
  console.log("  done.");
}

main()
  .catch(async (e) => {
    console.error("\nREHEARSAL FAILED:", e);
    await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => {});
    await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA}_b CASCADE`).catch(() => {});
    rmSync(OLD_SCHEMA_FILE, { force: true });
    process.exitCode = 1;
  })
  .finally(() => owner.$disconnect());
