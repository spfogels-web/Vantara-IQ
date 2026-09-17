/**
 * Apply 001-project-crew.sql to production, behind gates.
 *
 * Every step is checked and the run stops on the first difference. Nothing here
 * is best-effort: a partial application of this migration is a permissions
 * outage, because the assignment it moves is the authority on what a
 * subcontractor can see.
 *
 * Order:
 *   1. Pre-conditions — right database, right schema, old table present, new
 *      table absent.
 *   2. Snapshot every assignment pair and the baseline row counts to disk,
 *      alongside a restore script that puts _ProjectCrews back exactly.
 *   3. Apply, inside the migration's own transaction.
 *   4. Verify the pairs came across as an exact set — same count, same pairs,
 *      nothing added, nothing lost.
 *   5. Verify the baseline counts are untouched and the constraints exist.
 *
 *   npx tsx prisma/_apply-001.ts          # checks, snapshot, then stops
 *   npx tsx prisma/_apply-001.ts --apply  # actually applies
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const OUT = join("prisma", "pending");
const MIGRATION = join(OUT, "001-project-crew.sql");

/**
 * The direct endpoint, which resolves to `public` — which is what we want
 * here, and is exactly why every pre-condition below is checked explicitly.
 */
const URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!;
const db = new PrismaClient({ datasources: { db: { url: URL } } });

const BASELINE_TABLES = [
  "Organization",
  "Project",
  "Subcontractor",
  "Customer",
  "User",
  "Daily",
  "DailySheet",
  "Invoice",
  "SubInvoice",
  "LocateTicket",
] as const;

type Pair = { A: string; B: string };

const one = async (sql: string) => (await db.$queryRawUnsafe<{ n: number }[]>(sql))[0].n;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of BASELINE_TABLES) {
    out[t] = await one(`SELECT count(*)::int AS n FROM public."${t}"`);
  }
  out.__tables = await one(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`,
  );
  return out;
}

function fail(message: string): never {
  console.error(`\nSTOPPED: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

async function main() {
  console.log(APPLY ? "APPLYING 001-project-crew.sql\n" : "DRY RUN — checks and snapshot only\n");

  /* ---------- 1. pre-conditions ---------- */

  const schemas = await db.$queryRawUnsafe<{ s: string[] }[]>(`SELECT current_schemas(false) AS s`);
  console.log(`  schema path: [${schemas[0].s.join(", ")}]`);
  if (!schemas[0].s.includes("public")) fail("this connection does not resolve to public");

  const hasOld = await one(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='_ProjectCrews'`,
  );
  const hasNew = await one(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='ProjectCrew'`,
  );
  if (hasOld !== 1) fail("_ProjectCrews is not there — has this already been applied?");
  if (hasNew !== 0) fail("ProjectCrew already exists — this migration has already run.");
  console.log("  pre-conditions: _ProjectCrews present, ProjectCrew absent");

  /* ---------- 2. snapshot ---------- */

  const before = await db.$queryRawUnsafe<Pair[]>(
    `SELECT "A", "B" FROM public."_ProjectCrews" ORDER BY "A", "B"`,
  );
  const beforeCounts = await counts();
  const key = (p: Pair) => `${p.A}|${p.B}`;
  const beforeKeys = before.map(key).sort();

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, "001-snapshot.json"),
    JSON.stringify({ takenAt: new Date().toISOString(), pairs: before, counts: beforeCounts }, null, 2),
  );

  // A restore that puts the old table back exactly as it was, for the case
  // where the migration succeeds and something else turns out to be wrong.
  const restore = [
    "-- Restore _ProjectCrews as it stood before 001-project-crew.sql.",
    "BEGIN;",
    'CREATE TABLE IF NOT EXISTS "_ProjectCrews" ("A" TEXT NOT NULL, "B" TEXT NOT NULL);',
    ...before.map((p) => `INSERT INTO "_ProjectCrews" ("A","B") VALUES ('${p.A}','${p.B}');`),
    'CREATE UNIQUE INDEX IF NOT EXISTS "_ProjectCrews_AB_unique" ON "_ProjectCrews"("A","B");',
    'CREATE INDEX IF NOT EXISTS "_ProjectCrews_B_index" ON "_ProjectCrews"("B");',
    'ALTER TABLE "_ProjectCrews" ADD CONSTRAINT "_ProjectCrews_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"(id) ON DELETE CASCADE ON UPDATE CASCADE;',
    'ALTER TABLE "_ProjectCrews" ADD CONSTRAINT "_ProjectCrews_B_fkey" FOREIGN KEY ("B") REFERENCES "Subcontractor"(id) ON DELETE CASCADE ON UPDATE CASCADE;',
    'DROP TABLE IF EXISTS "ProjectCrew";',
    "COMMIT;",
  ].join("\n");
  writeFileSync(join(OUT, "001-restore.sql"), restore);

  console.log(`\n  BEFORE`);
  console.log(`    assignments: ${before.length}`);
  for (const [k, v] of Object.entries(beforeCounts)) console.log(`    ${k.padEnd(16)} ${v}`);
  console.log(`    snapshot -> ${join(OUT, "001-snapshot.json")}`);
  console.log(`    restore  -> ${join(OUT, "001-restore.sql")}`);

  if (!APPLY) {
    console.log("\nDry run complete. Nothing was changed. Re-run with --apply.");
    return;
  }

  /* ---------- 3. apply ---------- */

  console.log("\n  applying…");
  execFileSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), "db", "execute", "--file", MIGRATION, "--url", URL],
    { stdio: "pipe", env: { ...process.env } },
  );

  /* ---------- 4. exact equality of the pairs ---------- */

  const after = await db.$queryRawUnsafe<{ A: string; B: string }[]>(
    `SELECT "projectId" AS "A", "subcontractorId" AS "B" FROM public."ProjectCrew" ORDER BY "projectId", "subcontractorId"`,
  );
  const afterKeys = after.map(key).sort();

  const lost = beforeKeys.filter((k) => !afterKeys.includes(k));
  const gained = afterKeys.filter((k) => !beforeKeys.includes(k));

  console.log(`\n  AFTER`);
  console.log(`    assignments: ${after.length}`);
  if (lost.length) console.log(`    LOST:   ${lost.join(", ")}`);
  if (gained.length) console.log(`    GAINED: ${gained.join(", ")}`);

  if (after.length !== before.length) {
    fail(`assignment count changed: ${before.length} before, ${after.length} after`);
  }
  if (lost.length || gained.length) fail("the set of assignment pairs is not identical");
  console.log("    every pair identical — none lost, none invented");

  /* ---------- 5. structure and baseline ---------- */

  const oldGone = await one(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='_ProjectCrews'`,
  );
  if (oldGone !== 0) fail("_ProjectCrews is still there — the migration did not complete");

  const idx = await db.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('ProjectCrew','Daily') ORDER BY indexname`,
  );
  console.log(`    indexes: ${idx.map((i) => i.indexname).join(", ")}`);
  for (const needed of [
    "ProjectCrew_projectId_subcontractorId_key",
    "ProjectCrew_subcontractorId_idx",
    "Daily_workDate_idx",
  ]) {
    if (!idx.some((i) => i.indexname === needed)) fail(`missing index ${needed}`);
  }

  const afterCounts = await counts();
  const drifted = Object.keys(beforeCounts).filter((k) => beforeCounts[k] !== afterCounts[k]);
  for (const [k, v] of Object.entries(afterCounts)) {
    const was = beforeCounts[k];
    console.log(`    ${k.padEnd(16)} ${v}${was === v ? "" : `   !! was ${was}`}`);
  }
  if (drifted.length) fail(`row counts changed for: ${drifted.join(", ")}`);
  console.log("    baseline counts unchanged");

  console.log("\nMigration applied and verified.");
}

main()
  .catch((e) => {
    if (!process.exitCode) {
      console.error("\nFAILED:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  })
  .finally(() => db.$disconnect());
