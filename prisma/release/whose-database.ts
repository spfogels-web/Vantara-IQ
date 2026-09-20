/**
 * Whose data is this, in terms a person can recognise?
 *
 * Neon names a project one thing and its compute endpoint another, so
 * "violet-cave" and "damp-mouse" may be the same database or two different
 * ones, and no amount of staring at the console reliably settles it. The
 * fastest answer is not the topology — it is the content. Real job numbers and
 * real people are recognised in a second.
 *
 * Read-only. Prints no connection string and no password hash.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("No connection string configured.");
  const host = new URL(url).host;

  const db = new PrismaClient({ datasources: { db: { url } } });
  const q = (sql: string) => db.$queryRawUnsafe<Row[]>(sql);

  console.log(`endpoint host : ${host}`);
  console.log(`database      : ${String((await q("select current_database() n"))[0]?.n)}`);
  console.log("");

  console.log("projects on this database:");
  for (const r of await q(
    `select number, name, client, location, status
     from "public"."Project" order by number`,
  )) {
    console.log(
      `  ${String(r.number ?? "").padEnd(12)} ${String(r.name ?? "").padEnd(30)} ${String(r.client ?? "").padEnd(24)} ${String(r.location ?? "")}`,
    );
  }
  console.log("");

  console.log("people with logins:");
  for (const r of await q(
    `select email, name, role from "public"."User" order by role, email`,
  )) {
    console.log(`  ${String(r.email ?? "").padEnd(34)} ${String(r.name ?? "").padEnd(22)} ${String(r.role ?? "")}`);
  }
  console.log("");

  console.log("subcontractors:");
  for (const r of await q(
    `select company, lead, state from "public"."Subcontractor" order by company`,
  )) {
    console.log(`  ${String(r.company ?? "").padEnd(34)} ${String(r.lead ?? "").padEnd(20)} ${String(r.state ?? "")}`);
  }
  console.log("");

  const last = await q(
    `select max("updatedAt") as t from "public"."Project"`,
  );
  console.log(`most recent project update: ${String(last[0]?.t ?? "unknown")}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
