/**
 * Exactly how many historical daily photo entries exist, and on how many sheets.
 *
 * The earlier backfill dry run reported 71 sheets and 141 entries; a coarser
 * query here reported 13 sheets. Both cannot be right, and the backfill's
 * census is the number that decides whether its result is correct — so this
 * counts the JSON itself rather than testing the column for emptiness.
 *
 * Read-only. Prints no credential.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url || !url.includes("damp-mouse")) throw new Error("Not Fortitude production. Refusing.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const q = (sql: string) => db.$queryRawUnsafe<Row[]>(sql);

  const type = await q(
    `select data_type from information_schema.columns
      where table_schema='public' and table_name='DailySheet' and column_name='photos'`,
  );
  console.log(`DailySheet.photos type: ${String(type[0]?.data_type)}`);

  const shape = await q(
    `select jsonb_typeof(photos::jsonb) as kind, count(*)::int as n
       from "public"."DailySheet" group by 1 order by 2 desc`,
  );
  console.log("shape of the photos column across all sheets:");
  for (const r of shape) console.log(`  ${String(r.kind ?? "SQL NULL").padEnd(10)} ${r.n} sheets`);
  console.log("");

  // Sheets holding at least one element, and the total number of elements.
  const totals = await q(
    `select count(*) filter (where jsonb_array_length(photos::jsonb) > 0)::int as sheets,
            coalesce(sum(jsonb_array_length(photos::jsonb)) filter (where jsonb_typeof(photos::jsonb)='array'),0)::int as entries
       from "public"."DailySheet"
      where jsonb_typeof(photos::jsonb) = 'array'`,
  );
  console.log(`sheets with >= 1 photo entry : ${Number(totals[0]?.sheets ?? 0)}`);
  console.log(`total photo entries          : ${Number(totals[0]?.entries ?? 0)}`);
  console.log("");

  // What one entry looks like, so the backfill's field mapping can be checked.
  const sample = await q(
    `select jsonb_object_keys(e) as k, count(*)::int as n
       from "public"."DailySheet" s,
            lateral jsonb_array_elements(s.photos::jsonb) e
      where jsonb_typeof(s.photos::jsonb)='array'
      group by 1 order by 2 desc`,
  );
  console.log("keys present across all entries (and how many entries have each):");
  for (const r of sample) console.log(`  ${String(r.k).padEnd(20)} ${r.n}`);
  console.log("");

  // How many entries could carry a coordinate or a real capture time.
  const facts = await q(
    `select
       count(*)::int as entries,
       count(*) filter (where e ? 'url' and length(e->>'url') > 0)::int as with_url,
       count(*) filter (where e ? 'lat' and e->>'lat' is not null)::int as with_lat,
       count(*) filter (where e ? 'capturedAt' and e->>'capturedAt' is not null)::int as with_captured
     from "public"."DailySheet" s,
          lateral jsonb_array_elements(s.photos::jsonb) e
     where jsonb_typeof(s.photos::jsonb)='array'`,
  );
  const f = facts[0] ?? {};
  console.log(`entries total        : ${Number(f.entries ?? 0)}`);
  console.log(`  with a blob url    : ${Number(f.with_url ?? 0)}`);
  console.log(`  with a latitude    : ${Number(f.with_lat ?? 0)}`);
  console.log(`  with a capturedAt  : ${Number(f.with_captured ?? 0)}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message.split("\n").slice(0, 4).join(" | ") : String(e)}`);
  process.exit(1);
});
