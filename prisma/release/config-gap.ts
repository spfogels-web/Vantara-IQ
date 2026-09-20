/**
 * Can the missing 002 configuration be derived, or would it have to be invented?
 *
 * Market and OrgSettings are both empty in production. The new code expects
 * them, so something has to fill them before it goes live — but the only
 * acceptable source is what Fortitude's own data already says. This reports
 * what is derivable and what is not, and decides nothing.
 *
 * Read-only, direct endpoint, prints no connection string.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url || !url.includes("damp-mouse")) throw new Error("Not Fortitude production. Refusing.");
  const db = new PrismaClient({ datasources: { db: { url } } });

  const q = (sql: string) => db.$queryRawUnsafe<Row[]>(sql);

  console.log("markets named by existing projects:");
  for (const r of await q(
    `select coalesce(nullif(market,''),'(blank)') as market, count(*)::int as projects
     from "public"."Project" group by 1 order by 2 desc`,
  )) {
    console.log(`  ${String(r.market).padEnd(28)} ${r.projects} projects`);
  }
  console.log("");

  const custCols = await q(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='Customer' order by ordinal_position`,
  );
  const names = custCols.map((c) => String(c.column_name));
  const label = names.includes("name") ? "name" : names.includes("company") ? "company" : names[1];
  console.log(`customers (labelled by "${label}"):`);
  for (const r of await q(
    `select "${label}" as label, "crewNumber" from "public"."Customer" order by 1`,
  )) {
    console.log(`  ${String(r.label).padEnd(34)} crewNumber="${String(r.crewNumber)}"`);
  }
  console.log("");

  // The Globe crew-number backfill must be able to identify its one target.
  const globe = await q(
    `select count(*)::int as n from "public"."Customer" where "${label}" ilike '%globe%'`,
  );
  console.log(`customers matching 'globe': ${Number(globe[0]?.n ?? 0)}`);
  console.log("");

  console.log("OrgSettings columns that would need values:");
  for (const c of await q(
    `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema='public' and table_name='OrgSettings' order by ordinal_position`,
  )) {
    const d = c.column_default === null ? "no default" : `default ${String(c.column_default)}`;
    console.log(
      `  ${String(c.column_name).padEnd(26)} ${String(c.data_type).padEnd(26)} ${c.is_nullable === "YES" ? "nullable" : "NOT NULL"}, ${d}`,
    );
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
