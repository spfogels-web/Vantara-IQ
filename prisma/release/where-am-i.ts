/**
 * Which schema does a connection to production actually resolve to?
 *
 * The preflight found `Project` listed in `information_schema` under `public`
 * and then failed to select from an unqualified `"Project"`. Those two facts
 * cannot both be about the same search path, and a migration written in
 * unqualified names would land wherever this question answers — so it gets
 * answered before anything is applied, not after.
 *
 * Read-only, and prints no connection string: the last diagnostic that echoed
 * one put a live password in a transcript.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes("damp-mouse")) {
    throw new Error("Not Fortitude production. Refusing.");
  }

  const db = new PrismaClient({ datasources: { db: { url } } });

  const one = async (sql: string) =>
    (await db.$queryRawUnsafe<Row[]>(sql))[0] ?? {};

  console.log("current_database :", String((await one("select current_database() n")).n));
  console.log("current_schema   :", String((await one("select current_schema() n")).n));
  console.log("search_path      :", String((await one("show search_path")).search_path));
  console.log("current_user     :", String((await one("select current_user n")).n));
  console.log("");

  // Every schema that holds a Project table, and how much is in each.
  const where = await db.$queryRawUnsafe<Row[]>(`
    select table_schema, count(*)::int as tables
    from information_schema.tables
    where table_name in ('Project','ProjectPhoto','DailySheet','Customer')
    group by table_schema order by table_schema
  `);
  console.log("schemas holding the application's tables:");
  for (const r of where) console.log(`  ${String(r.table_schema).padEnd(24)} ${r.tables} of 4`);
  console.log("");

  // Count through fully-qualified names, which do not depend on search_path.
  for (const r of where) {
    const s = String(r.table_schema);
    try {
      const n = await db.$queryRawUnsafe<Row[]>(
        `select count(*)::int as n from "${s}"."Project"`,
      );
      const p = await db.$queryRawUnsafe<Row[]>(
        `select count(*)::int as n from "${s}"."ProjectPhoto"`,
      );
      console.log(`  ${s}: Project=${n[0]?.n} ProjectPhoto=${p[0]?.n}`);
    } catch (e) {
      console.log(`  ${s}: could not read (${e instanceof Error ? e.message.split("\n")[0] : e})`);
    }
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
