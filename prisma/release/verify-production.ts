/**
 * Check production against the values the rehearsal produced, and say plainly
 * whether each one holds.
 *
 * Every line is an expectation with a source: the approved configuration, or a
 * count measured before the release began. Anything that does not match is a
 * reason to stop rather than a reason to look again — which is why this prints
 * PASS/FAIL per item and exits non-zero on any failure, instead of printing
 * state for a person to eyeball at the end of a long night.
 *
 * Read-only. Prints no credential.
 *
 *   npx tsx prisma/release/verify-production.ts config
 *   npx tsx prisma/release/verify-production.ts evidence
 *   npx tsx prisma/release/verify-production.ts backfill
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(42)} ${String(actual)}${ok ? "" : `   (expected ${String(expected)})`}`,
  );
}

async function main() {
  const stage = process.argv[2] ?? "all";
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url || !url.includes("damp-mouse")) throw new Error("Not Fortitude production. Refusing.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const q = (sql: string) => db.$queryRawUnsafe<Row[]>(sql);
  const n = async (sql: string) => Number((await q(sql))[0]?.n ?? 0);

  console.log(`verifying: ${stage}\n`);

  if (stage === "config" || stage === "all") {
    console.log("STEP 1 — configuration");
    const org = await q(`select * from "public"."OrgSettings"`);
    check("OrgSettings rows", org.length, 1);
    const s = org[0] ?? {};
    check("legalName", s.legalName, "Fortitude Infrastructure LLC");
    check("shortName", s.shortName, "Fortitude");
    check("isDemo", s.isDemo, false);
    check("smsEnabled", s.smsEnabled, true);
    check("assistantEnabled", s.assistantEnabled, false);
    check("customerTerms", s.customerTerms, "Net 30");
    check("subTerms", s.subTerms, "Net 21");
    check("retainagePct", s.retainagePct, 0);
    check("locateProvider", s.locateProvider, "GA811");
    check("defaultState", s.defaultState, "GA");
    check("smsAllowed (smsEnabled && !isDemo)", Boolean(s.smsEnabled) && !s.isDemo, true);

    const mk = await q(`select id,label,prime,state,hint from "public"."Market" order by id`);
    check("Market rows", mk.length, 2);
    const north = mk.find((m) => m.id === "north-ga") ?? {};
    const south = mk.find((m) => m.id === "south-ga") ?? {};
    check("north-ga label", north.label, "North Georgia");
    check("north-ga prime", north.prime, "GLOBE COMMUNICATIONS");
    check("north-ga state", north.state, "GA");
    check("north-ga hint", north.hint, "North Georgia projects");
    check("south-ga label", south.label, "South Georgia");
    check("south-ga prime", south.prime, "Trawick Construction");
    check("south-ga state", south.state, "GA");
    check("south-ga hint", south.hint, "South Georgia projects");

    const cust = await q(`select name,"crewNumber" from "public"."Customer" order by name`);
    const globe = cust.find((c) => String(c.name).toUpperCase().includes("GLOBE")) ?? {};
    const other = cust.find((c) => !String(c.name).toUpperCase().includes("GLOBE")) ?? {};
    check("Globe crewNumber", globe.crewNumber, "24208171927-A27-311");
    check("Trawick crewNumber stays blank", String(other.crewNumber ?? ""), "");
    console.log("");
  }

  if (stage === "evidence" || stage === "all") {
    console.log("STEP 2 — evidence schema");
    const enums = await q(
      `select t.typname n from pg_type t join pg_namespace s on s.oid=t.typnamespace
        where s.nspname='public' and t.typtype='e'
          and t.typname in ('EvidenceStage','EvidenceCategory','PreConStatus')`,
    );
    check("evidence enums", enums.length, 3);
    const pc = await q(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='ProjectPhoto'
          and column_name in ('stage','category','existingDamage','damageNote','dailySheetId',
                              'dailyId','subcontractorId','uploadedByUserId','uploadedAt')`,
    );
    check("new ProjectPhoto columns", pc.length, 9);
    const prj = await q(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='Project'
          and column_name in ('preConStatus','preConCompletedBy','preConCompletedAt')`,
    );
    check("new Project columns", prj.length, 3);
    const idx = await q(
      `select indexname from pg_indexes where schemaname='public'
        and indexname in ('ProjectPhoto_projectId_stage_createdAt_idx',
                          'ProjectPhoto_projectId_existingDamage_idx',
                          'ProjectPhoto_dailySheetId_idx','ProjectPhoto_lat_lng_idx')`,
    );
    check("new indexes", idx.length, 4);
    const loc = await q(
      `select data_type, is_nullable from information_schema.columns
        where table_schema='public' and table_name='ProjectPhoto' and column_name='locationSource'`,
    );
    check("locationSource type", loc[0]?.data_type, "text");
    check("locationSource NOT NULL", loc[0]?.is_nullable, "NO");
    /**
     * The invariant is "the 116 rows that existed before the release are still
     * there" — not "the table holds 116 rows", which stops being true the
     * moment the backfill runs and made a correct database report a failure.
     * Rows the backfill created are the ones carrying a dailySheetId, so the
     * originals are what remain when those are set aside.
     */
    const photoTotal = await n(`select count(*)::int n from "public"."ProjectPhoto"`);
    const photoLinked = await n(
      `select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null`,
    );
    check("pre-existing ProjectPhoto rows intact", photoTotal - photoLinked, 116);
    console.log("");
  }

  if (stage === "backfill" || stage === "all") {
    console.log("STEP 3 — backfill result");
    const total = await n(`select count(*)::int n from "public"."ProjectPhoto"`);
    const linked = await n(
      `select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null`,
    );
    check("ProjectPhoto total", total, 257);
    check("rows linked to a daily sheet", linked, 141);
    check("pre-existing rows intact", total - linked, 116);
    check(
      "backfilled with a capturedAt",
      await n(`select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null and "capturedAt" is not null`),
      0,
    );
    check(
      "backfilled with a coordinate",
      await n(`select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null and (lat is not null or lng is not null)`),
      0,
    );
    check(
      "backfilled with a locationSource",
      await n(`select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null and coalesce("locationSource",'') <> ''`),
      0,
    );
    check(
      "backfilled missing a blob url",
      await n(`select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null and coalesce(url,'') = ''`),
      0,
    );
    check(
      "orphaned from a project",
      await n(`select count(*)::int n from "public"."ProjectPhoto" ph
               left join "public"."Project" p on p.id = ph."projectId" where p.id is null`),
      0,
    );
    check(
      "urls traced back to their sheet",
      await n(`select count(*)::int n from "public"."ProjectPhoto" ph
               where ph."dailySheetId" is not null and exists (
                 select 1 from "public"."DailySheet" s, lateral jsonb_array_elements(s.photos::jsonb) e
                  where s.id = ph."dailySheetId" and e->>'url' = ph.url)`),
      141,
    );
    console.log("");
  }

  // The counts that must not move, whatever step we are on.
  console.log("core data");
  check("Project", await n(`select count(*)::int n from "public"."Project"`), 12);
  check("DailySheet", await n(`select count(*)::int n from "public"."DailySheet"`), 71);
  check("Daily", await n(`select count(*)::int n from "public"."Daily"`), 34);
  check("Customer", await n(`select count(*)::int n from "public"."Customer"`), 2);
  check("CustomerRate", await n(`select count(*)::int n from "public"."CustomerRate"`), 2531);
  check("Subcontractor", await n(`select count(*)::int n from "public"."Subcontractor"`), 13);
  check("User", await n(`select count(*)::int n from "public"."User"`), 15);

  await db.$disconnect();

  console.log("");
  if (failures) {
    console.log(`${failures} CHECK(S) FAILED — STOP.`);
    process.exit(1);
  }
  console.log("all checks passed.");
}

main().catch((e) => {
  console.error(`VERIFY ABORTED: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  process.exit(1);
});
