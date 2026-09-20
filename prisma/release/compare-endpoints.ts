/**
 * Pooled versus direct: do they agree about which schema unqualified SQL hits?
 *
 * The pooled endpoint reported `search_path = vq_test_421e7678` — a schema that
 * no longer exists — while no role or database carries that as a persistent
 * setting. The likely explanation is PgBouncer handing back a server
 * connection on which an earlier session had issued `SET search_path`, which
 * is exactly the hazard that makes unqualified DDL unsafe through a pooler.
 *
 * 003 creates its three enum types unqualified, so this decides whether the
 * migration can run as written and through which endpoint.
 *
 * Read-only. Prints no connection string.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function probe(label: string, url: string | undefined) {
  if (!url) {
    console.log(`${label}: not configured`);
    return;
  }
  if (!url.includes("damp-mouse")) throw new Error(`${label} is not Fortitude production. Refusing.`);
  const pooled = url.includes("-pooler");
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const sp = String((await db.$queryRawUnsafe<Row[]>("show search_path"))[0]?.search_path ?? "");
    const cs = (await db.$queryRawUnsafe<Row[]>("select current_schema() as s"))[0]?.s;
    console.log(`${label} (${pooled ? "pooled" : "direct"})`);
    console.log(`  search_path    : ${sp}`);
    console.log(`  current_schema : ${cs === null ? "NULL — unqualified DDL has no target" : String(cs)}`);

    // Can this connection see the real tables without qualification?
    try {
      const n = await db.$queryRawUnsafe<Row[]>(`select count(*)::int as n from "Project"`);
      console.log(`  unqualified "Project" : ${n[0]?.n} rows`);
    } catch (e) {
      console.log(`  unqualified "Project" : FAILS (${e instanceof Error ? (e.message.match(/Message: `([^`]+)`/)?.[1] ?? "error") : "error"})`);
    }
    // Qualified always works and is what the application itself generates.
    const q = await db.$queryRawUnsafe<Row[]>(`select count(*)::int as n from "public"."Project"`);
    console.log(`  qualified public."Project" : ${q[0]?.n} rows`);
  } finally {
    await db.$disconnect();
  }
  console.log("");
}

async function main() {
  await probe("DATABASE_URL", process.env.DATABASE_URL);
  await probe("DATABASE_URL_UNPOOLED", process.env.DATABASE_URL_UNPOOLED);
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
