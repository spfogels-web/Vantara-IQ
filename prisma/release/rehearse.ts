/**
 * Rehearse 004 and 003 against the disposable branch, under the condition that
 * would have broken them in production.
 *
 * The defect this exists to catch: production reaches its database through a
 * connection pooler that can hand back a server connection still carrying an
 * earlier session's `SET search_path`. Measured on the live database, that
 * left `current_schema()` as NULL — so any unqualified DDL had no target at
 * all. The first rehearsal missed it because it ran inside a scratch schema
 * where the path and the tables happened to agree, which is the one condition
 * under which unqualified DDL looks fine.
 *
 * So this deliberately points search_path at a schema that does not exist,
 * through the connection string's `options` parameter, and applies the
 * migrations anyway. Qualified SQL does not care. Unqualified SQL fails, which
 * is the result worth having.
 *
 * Runs ONLY against TEST_DATABASE_URL, and refuses any endpoint that looks
 * like a live tenant. Prints no credential.
 *
 *   npx tsx prisma/release/rehearse.ts          # report state
 *   npx tsx prisma/release/rehearse.ts --apply  # apply 004 then 003, twice
 */
import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

const LIVE_MARKS = ["damp-mouse", "aged-dew"];
const APPLY = process.argv.includes("--apply");

/** The disposable branch, or nothing. */
function testUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set.");
  const host = new URL(url).host;
  for (const m of LIVE_MARKS) {
    if (host.includes(m)) throw new Error(`Refusing: ${host.split(".")[0]} is a live tenant.`);
  }
  return url;
}

/**
 * The same URL, but with search_path pointed at a schema that does not exist.
 *
 * This is the production hazard in its purest form: a session whose search_path
 * names nothing real. Postgres accepts the setting — it only resolves names
 * when a statement needs them — so the migration runs and either survives on
 * its own qualification or fails.
 */
function contaminatedUrl(): string {
  const u = new URL(testUrl());
  u.searchParams.set("options", "-c search_path=vq_does_not_exist");
  return u.toString();
}

async function state(label: string) {
  const db = new PrismaClient({ datasources: { db: { url: testUrl() } } });
  const q = (sql: string) => db.$queryRawUnsafe<Row[]>(sql);
  try {
    const enums = (
      await q(`select t.typname as n from pg_type t join pg_namespace s on s.oid=t.typnamespace
               where s.nspname='public' and t.typtype='e'
                 and t.typname in ('EvidenceStage','EvidenceCategory','PreConStatus')`)
    ).map((r) => String(r.n));
    const photoCols = (
      await q(`select column_name c from information_schema.columns
               where table_schema='public' and table_name='ProjectPhoto'
                 and column_name in ('stage','category','existingDamage','damageNote','dailySheetId',
                                     'dailyId','subcontractorId','uploadedByUserId','uploadedAt')`)
    ).length;
    const projCols = (
      await q(`select column_name c from information_schema.columns
               where table_schema='public' and table_name='Project'
                 and column_name in ('preConStatus','preConCompletedBy','preConCompletedAt')`)
    ).length;
    const idx = (
      await q(`select indexname from pg_indexes where schemaname='public'
               and indexname in ('ProjectPhoto_projectId_stage_createdAt_idx',
                                 'ProjectPhoto_projectId_existingDamage_idx',
                                 'ProjectPhoto_dailySheetId_idx','ProjectPhoto_lat_lng_idx')`)
    ).length;
    const org = Number((await q(`select count(*)::int n from "public"."OrgSettings"`))[0]?.n ?? 0);
    const mkt = Number((await q(`select count(*)::int n from "public"."Market"`))[0]?.n ?? 0);
    const photos = Number((await q(`select count(*)::int n from "public"."ProjectPhoto"`))[0]?.n ?? 0);
    const globe = (
      await q(`select "crewNumber" c from "public"."Customer" where name='GLOBE COMMUNICATIONS'`)
    )[0]?.c;

    console.log(`--- ${label} ---`);
    console.log(`  enums 3            : ${enums.length}  ${enums.sort().join(", ")}`);
    console.log(`  ProjectPhoto cols 9: ${photoCols}`);
    console.log(`  Project cols 3     : ${projCols}`);
    console.log(`  indexes 4          : ${idx}`);
    console.log(`  OrgSettings rows   : ${org}`);
    console.log(`  Market rows        : ${mkt}`);
    console.log(`  ProjectPhoto rows  : ${photos}`);
    console.log(`  Globe crewNumber   : "${String(globe ?? "")}"`);
    if (photoCols === 9) {
      const stages = await q(
        `select stage::text s, count(*)::int n from "public"."ProjectPhoto" group by 1 order by 2 desc`,
      );
      console.log(`  stage distribution : ${stages.map((r) => `${r.s}=${r.n}`).join(", ")}`);
    }
    console.log("");
  } finally {
    await db.$disconnect();
  }
}

function apply(file: string, pass: number) {
  const url = contaminatedUrl();
  process.stdout.write(`applying ${file} (pass ${pass}, search_path=vq_does_not_exist) ... `);
  try {
    // No shell. The connection string carries & and =, and cmd.exe splits on
    // & — which silently truncated the URL and made the failure look like a
    // migration error rather than a quoting one.
    // Prisma CLI invoked as plain JS, not through npx.
    //
    // npx.cmd needs shell:true on Windows, and a shell splits the connection
    // string on its & characters. Passing the URL as an argv entry to node
    // keeps it intact. It is also deliberately NOT passed through the
    // environment: Prisma loads .env after the shell, so an env override would
    // be replaced by the production URL — which is how a db push meant for a
    // demo tenant once reached a live business.
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "db", "execute", "--url", url, "--file", file],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    console.log("ok");
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer };
    console.log("FAILED");
    console.log(String(err.stderr ?? err.stdout ?? e).trim().split("\n").slice(0, 8).join("\n"));
    throw new Error(`${file} failed under a contaminated search_path`);
  }
}

async function main() {
  const host = new URL(testUrl()).host.split(".")[0];
  console.log(`rehearsal target: ${host} (disposable branch)\n`);

  await state("before");
  if (!APPLY) {
    console.log("report only. pass --apply to rehearse the migrations.");
    return;
  }

  // Config first, exactly as production will do it.
  apply("prisma/pending/004-fortitude-configuration.sql", 1);
  apply("prisma/pending/003-project-evidence.sql", 1);
  await state("after first pass");

  // Both must be no-ops the second time.
  apply("prisma/pending/004-fortitude-configuration.sql", 2);
  apply("prisma/pending/003-project-evidence.sql", 2);
  await state("after second pass (idempotency)");
}

main().catch((e) => {
  console.error(`REHEARSAL ABORTED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
