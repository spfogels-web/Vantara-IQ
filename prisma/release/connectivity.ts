/**
 * Can the local credentials reach production, and is the leaked one dead?
 *
 * Two questions, and the second matters more. If the password that was exposed
 * in a transcript still authenticates, rotating Vercel changed nothing about
 * the exposure — anybody holding that string can still reach a live business's
 * database. That is the finding this script exists to surface quickly.
 *
 * Prints no connection string, no password, and no password fragment. Hosts
 * and row counts only.
 */
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

async function probe(label: string, url: string | undefined) {
  if (!url) {
    console.log(`${label.padEnd(22)} not configured`);
    return null;
  }
  let host = "unparseable";
  try {
    host = new URL(url).host.split(".")[0];
  } catch {
    /* reported as unparseable */
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const r = await db.$queryRawUnsafe<Row[]>(
      `select current_database() as d, current_schema() as s, current_user as u`,
    );
    const sp = await db.$queryRawUnsafe<Row[]>(`show search_path`);
    console.log(
      `${label.padEnd(22)} CONNECTS  host=${host} db=${String(r[0]?.d)} user=${String(r[0]?.u)} current_schema=${String(r[0]?.s)} search_path=${String(sp[0]?.search_path)}`,
    );
    return db;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const kind = /Authentication failed/i.test(msg)
      ? "AUTH REJECTED"
      : /Can't reach|timed out|ECONN/i.test(msg)
        ? "UNREACHABLE"
        : "ERROR";
    console.log(`${label.padEnd(22)} ${kind}  host=${host}`);
    await db.$disconnect().catch(() => undefined);
    return null;
  }
}

async function main() {
  const pooled = await probe("DATABASE_URL", process.env.DATABASE_URL);
  if (pooled) await pooled.$disconnect();

  const direct = await probe("DATABASE_URL_UNPOOLED", process.env.DATABASE_URL_UNPOOLED);
  if (!direct) {
    console.log("\nNo direct connection. Nothing further can be verified.");
    return;
  }

  // Does the direct connection reach Fortitude's real data in public?
  console.log("");
  const counts: [string, number][] = [];
  for (const t of ["Project", "ProjectPhoto", "DailySheet", "Daily", "Customer", "Subcontractor", "User", "CustomerRate"]) {
    const r = await direct.$queryRawUnsafe<Row[]>(`select count(*)::int as n from "public"."${t}"`);
    counts.push([t, Number(r[0]?.n ?? 0)]);
  }
  console.log("public schema row counts (direct):");
  for (const [t, n] of counts) console.log(`  ${t.padEnd(16)} ${n}`);

  await direct.$disconnect();
}

main().catch((e) => {
  console.error(`ABORTED: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  process.exit(1);
});
