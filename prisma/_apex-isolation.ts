/**
 * Phase One · Step 1 gate — prove Apex and Fortitude cannot see each other.
 *
 * Run before anything is built on top of the separation, and again after the
 * Apex schema exists. It is the gate, not a formality: two of the three things
 * I assumed about database connections in this codebase turned out to be wrong
 * in production and right locally, and one of them wrote test rows into live
 * data. Nothing here is taken on trust.
 *
 * STRICTLY READ-ONLY AGAINST FORTITUDE. Every Fortitude statement below is a
 * SELECT. The only writes are a marker row in Apex, which is ours and empty,
 * and its removal afterwards.
 *
 *   FORTITUDE: DATABASE_URL          (existing, read-only here)
 *   APEX:      APEX_DATABASE_URL     (new, provisioned separately)
 *
 *   npx tsx prisma/_apex-isolation.ts
 */
import { PrismaClient } from "@prisma/client";

const FORT_URL = process.env.DATABASE_URL;
const APEX_URL = process.env.APEX_DATABASE_URL;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

/** Host and database name, without ever printing credentials. */
function identity(url: string) {
  const u = new URL(url);
  return { host: u.host, database: u.pathname.replace(/^\//, ""), user: u.username };
}

async function main() {
  if (!FORT_URL) throw new Error("DATABASE_URL is not set.");
  if (!APEX_URL) {
    console.error(
      "\nAPEX_DATABASE_URL is not set.\n\n" +
        "Step 1 needs an empty Neon project for Apex. I cannot provision one:\n" +
        "there is no Neon API key here, and `vercel integration add` would install\n" +
        "into the Vercel project that serves Fortitude production.\n\n" +
        "Create it in the Neon console as a SEPARATE PROJECT, then put its pooled\n" +
        "connection string in .env.local as APEX_DATABASE_URL and re-run this.\n",
    );
    process.exitCode = 1;
    return;
  }

  const fortId = identity(FORT_URL);
  const apexId = identity(APEX_URL);

  console.log("Phase One · Step 1 — isolation proof\n");
  console.log(`  Fortitude  host ${fortId.host}  db ${fortId.database}  role ${fortId.user}`);
  console.log(`  Apex       host ${apexId.host}  db ${apexId.database}  role ${apexId.user}\n`);

  /* ---------- 1. distinct identity ---------- */

  console.log("=== They are genuinely different databases ===");
  check(
    "connection strings are not the same",
    FORT_URL !== APEX_URL,
    FORT_URL === APEX_URL ? "IDENTICAL — stop immediately" : "",
  );
  check(
    "not the same host and database",
    !(fortId.host === apexId.host && fortId.database === apexId.database),
    fortId.host === apexId.host && fortId.database === apexId.database
      ? "same host AND database — this is one database, not two"
      : "",
  );
  check(
    "separate Neon projects, not two databases in one",
    fortId.host !== apexId.host,
    fortId.host === apexId.host
      ? "same host — this is one Neon project; the plan calls for two"
      : "",
  );
  check("credentials differ", fortId.user !== apexId.user || fortId.host !== apexId.host);

  const fort = new PrismaClient({ datasources: { db: { url: FORT_URL } } });
  const apex = new PrismaClient({ datasources: { db: { url: APEX_URL } } });

  try {
    const fortDb = await fort.$queryRawUnsafe<{ d: string }[]>(`SELECT current_database() AS d`);
    const apexDb = await apex.$queryRawUnsafe<{ d: string }[]>(`SELECT current_database() AS d`);
    console.log(`  reported database names: ${fortDb[0].d} / ${apexDb[0].d}`);

    /* ---------- 2. Fortitude is intact and is what we think ---------- */

    console.log("\n=== Fortitude is untouched and correctly identified ===");
    const fortTables = await fort.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`,
    );
    check("Fortitude still has its 80 tables", fortTables[0].n === 80, `found ${fortTables[0].n}`);

    const fortOrg = await fort.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM public."Organization" LIMIT 1`,
    );
    check(
      "Fortitude's organisation row reads as Fortitude",
      /fortitude/i.test(fortOrg[0]?.name ?? ""),
      fortOrg[0]?.name ?? "none",
    );

    /* ---------- 3. Apex is empty, or is Apex ---------- */

    console.log("\n=== Apex is a fresh database, not a second window onto Fortitude ===");
    const apexTables = await apex.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`,
    );
    const schemaBuilt = apexTables[0].n > 0;
    console.log(`  Apex public tables: ${apexTables[0].n}${schemaBuilt ? "" : " (schema not pushed yet)"}`);

    let sawFortitudeData = false;
    try {
      const rows = await apex.$queryRawUnsafe<{ name: string }[]>(
        `SELECT name FROM public."Organization" LIMIT 5`,
      );
      sawFortitudeData = rows.some((r) => /fortitude/i.test(r.name ?? ""));
    } catch {
      // No such table — the correct answer for a fresh database.
    }
    check(
      "Apex cannot see Fortitude's organisation",
      !sawFortitudeData,
      sawFortitudeData ? "FORTITUDE DATA VISIBLE FROM APEX — stop immediately" : "",
    );

    /* ---------- 4. two-way proof with a real row ---------- */

    console.log("\n=== Mutual invisibility, proven with a row rather than inferred ===");
    const marker = `apex_isolation_marker_${Date.now()}`;
    await apex.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${marker}" (id text PRIMARY KEY)`);
    await apex.$executeRawUnsafe(`INSERT INTO "${marker}" (id) VALUES ('proof')`);

    const apexSees = await apex.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "${marker}"`,
    );
    check("Apex can read its own marker", apexSees[0].n === 1);

    let fortSeesMarker = false;
    try {
      await fort.$queryRawUnsafe(`SELECT 1 FROM "${marker}" LIMIT 1`);
      fortSeesMarker = true;
    } catch {
      // Expected: no such table on the Fortitude side.
    }
    check(
      "Fortitude cannot see a table created in Apex",
      !fortSeesMarker,
      fortSeesMarker ? "APEX TABLE VISIBLE FROM FORTITUDE — stop immediately" : "",
    );

    // And the other direction, without writing anything to Fortitude: a table
    // that certainly exists there must not exist here.
    let apexSeesFortTable = false;
    try {
      await apex.$queryRawUnsafe(`SELECT 1 FROM public."Subcontractor" LIMIT 1`);
      apexSeesFortTable = true;
    } catch {
      // Expected until the Apex schema is pushed; after that the table exists
      // but is empty, which the row check below distinguishes.
    }
    if (schemaBuilt) {
      const apexSubs = await apex
        .$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM public."Subcontractor"`)
        .catch(() => [{ n: -1 }]);
      check(
        "Apex's Subcontractor table holds none of Fortitude's crews",
        apexSubs[0].n === 0,
        `${apexSubs[0].n} rows — expected 0 before seeding`,
      );
    } else {
      check("Apex has no Fortitude tables yet", !apexSeesFortTable);
    }

    await apex.$executeRawUnsafe(`DROP TABLE IF EXISTS "${marker}"`);
    const cleaned = await apex.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_name = '${marker}'`,
    );
    check("marker removed", cleaned[0].n === 0);

    /* ---------- 5. Fortitude unchanged by all of the above ---------- */

    console.log("\n=== Fortitude after the proof ===");
    const after = await fort.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`,
    );
    check("Fortitude table count unchanged", after[0].n === fortTables[0].n, `${after[0].n}`);
    const counts = await fort.$queryRawUnsafe<{ p: number; s: number; o: number }[]>(
      `SELECT (SELECT count(*)::int FROM public."Project") AS p,
              (SELECT count(*)::int FROM public."Subcontractor") AS s,
              (SELECT count(*)::int FROM public."Organization") AS o`,
    );
    console.log(
      `  Fortitude: ${counts[0].p} projects, ${counts[0].s} subcontractors, ${counts[0].o} organisation`,
    );
  } finally {
    await fort.$disconnect();
    await apex.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\nSTEP 1 GATE NOT PASSED. Do not proceed to step 2.");
    process.exitCode = 1;
  } else {
    console.log("\nStep 1 gate passed: the two databases cannot see each other.");
  }
}

main().catch((e) => {
  console.error("\nISOLATION PROOF FAILED TO RUN:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
