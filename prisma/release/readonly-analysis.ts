/**
 * The four questions left open before the release, answered from production.
 *
 * Strictly read-only: no DDL, no writes, no transactions that could hold a
 * lock. It discovers which columns exist before querying them, because the
 * last diagnostic that assumed a column name reported a schema mismatch that
 * turned out to be its own bug.
 *
 * Prints no connection string and no credential.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url || !url.includes("damp-mouse")) throw new Error("Not Fortitude production. Refusing.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const q = (sql: string, ...a: unknown[]) => db.$queryRawUnsafe<Row[]>(sql, ...a);

  const cols = await q(
    `select table_name, column_name from information_schema.columns where table_schema='public'`,
  );
  const has = (t: string, c: string) =>
    cols.some((x) => x.table_name === t && x.column_name === c);
  const columnsOf = (t: string) =>
    cols.filter((x) => x.table_name === t).map((x) => String(x.column_name));

  // ---- 1. stray test schemas, counted and dated, changed not at all ----
  console.log("=== stray vq_test_* schemas (READ ONLY) ===");
  const strays = await q(
    `select n.nspname,
            (select count(*) from information_schema.tables t where t.table_schema = n.nspname)::int as tables
     from pg_namespace n where n.nspname like 'vq\\_test%' order by n.nspname`,
  );
  console.log(`count: ${strays.length}`);
  for (const s of strays) console.log(`  ${String(s.nspname).padEnd(22)} ${s.tables} tables`);
  const total = await q(
    `select count(*)::int as n from information_schema.tables where table_schema like 'vq\\_test%'`,
  );
  console.log(`total tables held by stray schemas: ${Number(total[0]?.n ?? 0)}`);
  console.log("");

  // ---- 2. Globe crew numbers, wherever they are recorded ----------------
  console.log("=== Globe crew-number census ===");
  const globe = await q(`select id, name from "public"."Customer" where name ilike '%globe%'`);
  console.log(`Customer rows matching 'globe': ${globe.length}`);
  for (const g of globe) console.log(`  id=${String(g.id)} name=${String(g.name)}`);
  const globeId = globe[0]?.id ? String(globe[0].id) : null;
  console.log("");

  for (const t of ["Project", "DailySheet", "Daily", "ProjectCrew"]) {
    const cs = columnsOf(t);
    if (!cs.length) {
      console.log(`${t}: table absent`);
      continue;
    }
    const crewish = cs.filter((c) => /crew/i.test(c));
    console.log(`${t}: crew-ish columns -> ${crewish.length ? crewish.join(", ") : "(none)"}`);
    if (has(t, "crewNumber")) {
      const rows = await q(
        `select coalesce(nullif("crewNumber",''),'(blank)') as v, count(*)::int as n
         from "public"."${t}" group by 1 order by 2 desc limit 15`,
      );
      for (const r of rows) console.log(`    crewNumber=${String(r.v).padEnd(18)} ${r.n} rows`);
    }
  }
  console.log("");

  // Crew numbers on sheets that belong to Globe's projects specifically.
  if (globeId && has("Project", "customerId") && has("DailySheet", "projectId") && has("DailySheet", "crewNumber")) {
    const rows = await q(
      `select coalesce(nullif(s."crewNumber",''),'(blank)') as v, count(*)::int as n
         from "public"."DailySheet" s
         join "public"."Project" p on p.id = s."projectId"
        where p."customerId" = $1
        group by 1 order by 2 desc`,
      globeId,
    );
    console.log("crew numbers on daily sheets for Globe's projects:");
    if (!rows.length) console.log("  (none)");
    for (const r of rows) console.log(`  ${String(r.v).padEnd(18)} ${r.n} sheets`);
  } else {
    console.log("could not join sheets to Globe (missing a column) — reporting unjoined only");
  }
  console.log("");

  // ---- 3. what the markets would need -----------------------------------
  console.log("=== markets in use ===");
  const mk = await q(
    `select coalesce(nullif(p.market,''),'(blank)') as market,
            count(*)::int as projects,
            min(p.location) as a_location,
            string_agg(distinct c.name, ' | ') as customers
       from "public"."Project" p
       left join "public"."Customer" c on c.id = p."customerId"
      group by 1 order by 2 desc`,
  );
  for (const r of mk) {
    console.log(`  ${String(r.market).padEnd(12)} ${String(r.projects).padStart(2)} projects  customers=${String(r.customers ?? "")}`);
    console.log(`               a location: ${String(r.a_location ?? "")}`);
  }
  const mrows = await q(`select count(*)::int as n from "public"."Market"`);
  console.log(`Market table rows: ${Number(mrows[0]?.n ?? 0)}`);
  console.log(`Market columns   : ${columnsOf("Market").join(", ")}`);
  console.log("");

  // ---- 4. integrity spot-checks ------------------------------------------
  console.log("=== integrity ===");
  const orphanPhotos = await q(
    `select count(*)::int as n from "public"."ProjectPhoto" ph
      left join "public"."Project" p on p.id = ph."projectId" where p.id is null`,
  );
  console.log(`ProjectPhoto rows with no project : ${Number(orphanPhotos[0]?.n ?? 0)}`);
  const purposes = await q(
    `select purpose, count(*)::int as n from "public"."ProjectPhoto" group by 1 order by 2 desc`,
  );
  console.log("ProjectPhoto.purpose distribution (what 003 translates into stage):");
  for (const r of purposes) console.log(`  ${String(r.purpose).padEnd(12)} ${r.n}`);
  const located = await q(
    `select count(*)::int as n from "public"."ProjectPhoto" where lat is not null and lng is not null`,
  );
  console.log(`ProjectPhoto rows carrying a coordinate: ${Number(located[0]?.n ?? 0)}`);
  const sheetsWithPhotos = await q(
    `select count(*)::int as n from "public"."DailySheet"
      where photos is not null and photos::text not in ('[]','null','""')`,
  );
  console.log(`DailySheets carrying photo entries: ${Number(sheetsWithPhotos[0]?.n ?? 0)}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message.split("\n").slice(0, 4).join(" | ") : String(e)}`);
  process.exit(1);
});
