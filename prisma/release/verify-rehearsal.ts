/**
 * What the rehearsed migrations and backfill actually produced.
 *
 * Counts alone would not catch the failures that matter here — a row invented
 * with a plausible timestamp, or a coordinate borrowed from the project, looks
 * exactly like a good row until somebody relies on it in a damage claim. So
 * this asserts the *absence* of fabricated facts as firmly as the presence of
 * real ones.
 *
 * Disposable branch only. Prints no credential.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set.");
  const host = new URL(url).host;
  for (const m of ["damp-mouse", "aged-dew"]) {
    if (host.includes(m)) throw new Error("Refusing: that is a live tenant.");
  }

  const db = new PrismaClient({ datasources: { db: { url } } });
  const q = (sql: string) => db.$queryRawUnsafe<Row[]>(sql);
  const one = async (sql: string) => Number((await q(sql))[0]?.n ?? 0);

  console.log(`target: ${host.split(".")[0]} (disposable branch)\n`);

  const total = await one(`select count(*)::int n from "public"."ProjectPhoto"`);
  const backfilled = await one(
    `select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null`,
  );
  const original = total - backfilled;
  console.log("=== evidence rows ===");
  console.log(`  total              : ${total}`);
  console.log(`  pre-existing       : ${original}   (expected 116)`);
  console.log(`  created by backfill: ${backfilled} (expected 141)`);
  console.log("");

  console.log("=== the backfilled rows carry no invented facts ===");
  const withCaptured = await one(
    `select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null and "capturedAt" is not null`,
  );
  const withCoord = await one(
    `select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null and (lat is not null or lng is not null)`,
  );
  const withLocSrc = await one(
    `select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null and coalesce("locationSource",'') <> ''`,
  );
  const noUrl = await one(
    `select count(*)::int n from "public"."ProjectPhoto" where "dailySheetId" is not null and coalesce(url,'') = ''`,
  );
  const noProject = await one(
    `select count(*)::int n from "public"."ProjectPhoto" ph left join "public"."Project" p on p.id = ph."projectId"
      where ph."dailySheetId" is not null and p.id is null`,
  );
  console.log(`  with a capturedAt     : ${withCaptured}  (must be 0)`);
  console.log(`  with a coordinate     : ${withCoord}  (must be 0)`);
  console.log(`  with a locationSource : ${withLocSrc}  (must be 0)`);
  console.log(`  missing a blob url    : ${noUrl}  (must be 0)`);
  console.log(`  orphaned from project : ${noProject}  (must be 0)`);
  console.log("");

  const stages = await q(
    `select stage::text s, count(*)::int n from "public"."ProjectPhoto" group by 1 order by 2 desc`,
  );
  console.log(`  stage distribution    : ${stages.map((r) => `${r.s}=${r.n}`).join(", ")}`);

  // Blob URLs are reused, never re-uploaded: every backfilled row's url must
  // already appear in the sheet JSON it came from.
  const reused = await one(
    `select count(*)::int n
       from "public"."ProjectPhoto" ph
      where ph."dailySheetId" is not null
        and exists (
          select 1 from "public"."DailySheet" s,
               lateral jsonb_array_elements(s.photos::jsonb) e
           where s.id = ph."dailySheetId" and e->>'url' = ph.url)`,
  );
  console.log(`  urls traced back to their sheet : ${reused} of ${backfilled}`);
  console.log("");

  console.log("=== configuration ===");
  const org = await q(
    `select "legalName","shortName","isDemo","smsEnabled","assistantEnabled",
            "customerTerms","subTerms","retainagePct","locateProvider","defaultState"
       from "public"."OrgSettings"`,
  );
  if (!org.length) console.log("  NO OrgSettings ROW");
  for (const [k, v] of Object.entries(org[0] ?? {})) console.log(`  ${k.padEnd(18)} ${String(v)}`);
  // The gate every outbound text passes through.
  const s = org[0] ?? {};
  const smsAllowed = Boolean(s.smsEnabled) && !s.isDemo;
  console.log(`  -> smsAllowed      ${smsAllowed}  ${smsAllowed ? "(texting works)" : "(TEXTING WOULD BE OFF)"}`);
  console.log("");

  const mk = await q(`select id,label,prime,state,hint,"sortOrder" from "public"."Market" order by "sortOrder"`);
  console.log(`markets: ${mk.length}`);
  for (const m of mk) {
    console.log(`  ${String(m.id).padEnd(10)} ${String(m.label).padEnd(15)} ${String(m.prime).padEnd(24)} ${String(m.state)}  "${String(m.hint)}"`);
  }
  const cust = await q(`select name,"crewNumber" from "public"."Customer" order by name`);
  console.log("customers:");
  for (const c of cust) console.log(`  ${String(c.name).padEnd(26)} crewNumber="${String(c.crewNumber)}"`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message.split("\n").slice(0, 3).join(" | ") : String(e)}`);
  process.exit(1);
});
