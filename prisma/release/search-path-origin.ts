/**
 * Is production's stray search_path a session quirk or persistent state?
 *
 * It matters because 003 creates its three enum types unqualified. An
 * unqualified CREATE TYPE lands wherever search_path points, and on this role
 * search_path currently names a dropped test schema — so the answer decides
 * whether the migration is safe to run at all.
 *
 * Read-only. Prints no connection string.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes("damp-mouse")) throw new Error("Not Fortitude production. Refusing.");

  const db = new PrismaClient({ datasources: { db: { url } } });

  // Persistent per-role / per-database settings live here. A row mentioning
  // search_path means somebody ran ALTER ROLE ... SET, and every future
  // connection inherits it.
  const settings = await db.$queryRawUnsafe<Row[]>(`
    select r.rolname, d.datname, s.setconfig
    from pg_db_role_setting s
    left join pg_roles r on r.oid = s.setrole
    left join pg_database d on d.oid = s.setdatabase
  `);
  console.log("persistent role/database settings:");
  if (!settings.length) console.log("  (none)");
  for (const s of settings) {
    console.log(`  role=${String(s.rolname ?? "*")} db=${String(s.datname ?? "*")} -> ${JSON.stringify(s.setconfig)}`);
  }
  console.log("");

  // Leftover test schemas still sitting in the production database.
  const leftovers = await db.$queryRawUnsafe<Row[]>(`
    select nspname from pg_namespace where nspname like 'vq\\_test%' order by nspname
  `);
  console.log(`leftover vq_test_* schemas in production: ${leftovers.length}`);
  for (const l of leftovers) console.log(`  ${String(l.nspname)}`);
  console.log("");

  // Does the schema search_path names still exist?
  const sp = String((await db.$queryRawUnsafe<Row[]>("show search_path"))[0]?.search_path ?? "");
  const named = sp.replace(/"/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const n of named) {
    const exists = await db.$queryRawUnsafe<Row[]>(
      `select 1 as x from pg_namespace where nspname = $1`, n,
    );
    console.log(`search_path entry "${n}": ${exists.length ? "exists" : "DOES NOT EXIST"}`);
  }
  console.log("");

  // The decisive question: where would an unqualified CREATE TYPE go?
  try {
    const target = await db.$queryRawUnsafe<Row[]>(
      `select current_schema() as s, pg_catalog.current_schemas(false) as paths`,
    );
    console.log("unqualified DDL would target:", JSON.stringify(target[0]));
  } catch (e) {
    console.log("could not resolve a target schema:", e instanceof Error ? e.message.split("\n")[0] : e);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
