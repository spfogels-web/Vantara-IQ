/**
 * Would 004 actually run? Checked without running it.
 *
 * Two ways a seed like this fails on first contact with production, both
 * invisible to reading it:
 *
 *   - ON CONFLICT ("id") needs a unique constraint on that column. Without
 *     one Postgres raises "there is no unique or exclusion constraint
 *     matching the ON CONFLICT specification" and the whole file aborts.
 *   - A NOT NULL column with no default that the INSERT does not name will
 *     fail the insert, and column lists drift from schemas.
 *
 * Read-only: this inspects the catalogue and parses the SQL file. It executes
 * nothing and writes nothing.
 */
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url || !url.includes("damp-mouse")) throw new Error("Not Fortitude production. Refusing.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const q = (sql: string, ...a: unknown[]) => db.$queryRawUnsafe<Row[]>(sql, ...a);

  const sql = readFileSync("prisma/pending/004-fortitude-configuration.sql", "utf8");

  // Columns each INSERT names, pulled from the file itself rather than retyped.
  function namedColumns(table: string): string[] {
    const m = new RegExp(`INSERT INTO "public"\\."${table}"\\s*\\(([^)]*)\\)`, "i").exec(sql);
    if (!m) return [];
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }

  for (const table of ["OrgSettings", "Market"]) {
    console.log(`=== ${table} ===`);

    const uniques = await q(
      `select c.conname, c.contype, pg_get_constraintdef(c.oid) as def
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
        where n.nspname='public' and t.relname=$1 and c.contype in ('p','u')`,
      table,
    );
    // Postgres prints the constraint as PRIMARY KEY (id) — unquoted, because
    // the identifier needs no quoting. An earlier version of this check looked
    // for ("id") exactly and reported a perfectly good primary key as missing,
    // which would have sent a non-existent defect into a release report.
    const onId = uniques.some((u) => /\(\s*"?id"?\s*\)/.test(String(u.def)));
    console.log(`  ON CONFLICT ("id") supported : ${onId ? "yes" : "NO — would abort"}`);
    for (const u of uniques) console.log(`    ${String(u.contype)} ${String(u.def)}`);

    const required = await q(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name=$1
          and is_nullable='NO' and column_default is null`,
      table,
    );
    const need = required.map((r) => String(r.column_name));
    const named = namedColumns(table);
    const missing = need.filter((c) => !named.includes(c));
    console.log(`  NOT NULL without default     : ${need.join(", ") || "(none)"}`);
    console.log(`  named by the INSERT          : ${named.join(", ") || "(none)"}`);
    console.log(`  missing from the INSERT      : ${missing.length ? missing.join(", ") + "  <-- WOULD FAIL" : "none"}`);

    // Any column the INSERT names that does not exist would also abort.
    const all = (
      await q(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name=$1`,
        table,
      )
    ).map((r) => String(r.column_name));
    const unknown = named.filter((c) => !all.includes(c));
    console.log(`  named but not in the table   : ${unknown.length ? unknown.join(", ") + "  <-- WOULD FAIL" : "none"}`);
    console.log("");
  }

  // The UPDATE's blast radius, measured rather than asserted.
  const wouldTouch = await q(
    `select count(*)::int as n from "public"."Customer"
      where "name" = 'GLOBE COMMUNICATIONS' and coalesce("crewNumber",'') = ''`,
  );
  const others = await q(
    `select count(*)::int as n from "public"."Customer" where "name" <> 'GLOBE COMMUNICATIONS'`,
  );
  console.log("=== Customer UPDATE ===");
  console.log(`  rows it would change        : ${Number(wouldTouch[0]?.n ?? 0)}`);
  console.log(`  rows it cannot reach        : ${Number(others[0]?.n ?? 0)} (every non-Globe customer)`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message.split("\n").slice(0, 4).join(" | ") : String(e)}`);
  process.exit(1);
});
