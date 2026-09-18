/**
 * Step 2 spike — does a lazy proxy actually survive this codebase's usage?
 *
 * The blueprint proposes a Proxy over the Prisma client that resolves the
 * organisation per request. Resolution has to be asynchronous, because the
 * organisation travels on a request header and `headers()` is async. That
 * means the proxy hands back functions returning plain promises rather than
 * Prisma's own promise type.
 *
 * Nine call sites use `$transaction([...])`, the array form, which Prisma
 * documents as taking its own promises. If plain promises silently execute
 * outside the transaction, that is a correctness break in nine write paths and
 * the design needs changing before a line of it ships.
 *
 * Runs against the empty Apex database on a temporary table. Creates nothing
 * permanent and never touches Fortitude.
 *
 *   npx tsx prisma/_proxy-spike.ts
 */
import { PrismaClient } from "@prisma/client";

const APEX = process.env.APEX_DATABASE_URL;
if (!APEX) {
  console.error("APEX_DATABASE_URL is not set.");
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url: APEX } } });
const T = `proxy_spike_${Date.now()}`;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function rows(): Promise<number> {
  const r = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${T}"`);
  return r[0].n;
}

async function main() {
  await db.$executeRawUnsafe(`CREATE TABLE "${T}" (id text PRIMARY KEY)`);
  console.log(`Spike table ${T} in the Apex database\n`);

  /* ---- 1. the array form with Prisma's own promises: the baseline ---- */

  console.log("=== $transaction([...]) with PrismaPromises — how it behaves today ===");
  try {
    await db.$transaction([
      db.$executeRawUnsafe(`INSERT INTO "${T}" (id) VALUES ('a1')`),
      db.$executeRawUnsafe(`INSERT INTO "${T}" (id) VALUES ('a2')`),
    ]);
    check("both rows committed", (await rows()) === 2, `${await rows()} rows`);
  } catch (e) {
    check("array form works at all", false, (e as Error).message.slice(0, 90));
  }

  // And that it is genuinely atomic: a failing second statement must roll the
  // first one back.
  try {
    await db.$transaction([
      db.$executeRawUnsafe(`INSERT INTO "${T}" (id) VALUES ('b1')`),
      db.$executeRawUnsafe(`INSERT INTO "${T}" (id) VALUES ('a1')`), // duplicate key
    ]);
  } catch {
    /* expected */
  }
  check("a failure rolls the whole array back", (await rows()) === 2, `${await rows()} rows — b1 must not be there`);

  /* ---- 2. the array form with plain promises: the proxy's shape ---- */

  console.log("\n=== $transaction([...]) with PLAIN promises — what a lazy proxy produces ===");
  const lazy = (sql: string) => (async () => db.$executeRawUnsafe(sql))();

  let threw = "";
  try {
    await (db.$transaction as unknown as (a: unknown[]) => Promise<unknown>)([
        lazy(`INSERT INTO "${T}" (id) VALUES ('c1')`),
      ]);
  } catch (e) {
    threw = (e as Error).message.split("\n")[0];
  }
  const afterPlain = await rows();
  console.log(`  threw: ${threw || "no"}`);
  console.log(`  rows now: ${afterPlain}`);
  check(
    "plain promises are rejected rather than silently escaping the transaction",
    threw !== "",
    threw === "" ? "ACCEPTED SILENTLY — the write happened outside any transaction" : "",
  );

  /* ---- 3. does the atomicity survive, if it is accepted at all? ---- */

  if (!threw) {
    console.log("\n=== Is it still atomic when it accepts them? ===");
    const before = await rows();
    try {
      await (db.$transaction as unknown as (a: unknown[]) => Promise<unknown>)([
        lazy(`INSERT INTO "${T}" (id) VALUES ('d1')`),
        lazy(`INSERT INTO "${T}" (id) VALUES ('a1')`),
      ]);
    } catch {
      /* expected */
    }
    const after = await rows();
    check(
      "a failure still rolls back",
      after === before,
      after !== before ? `${before} -> ${after}: d1 survived a failed transaction` : "",
    );
  }

  /* ---- 4. the callback form with a plain wrapper: the fallback design ---- */

  console.log("\n=== $transaction(async tx => …) — the callback form ===");
  const start = await rows();
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO "${T}" (id) VALUES ('e1')`);
      await tx.$executeRawUnsafe(`INSERT INTO "${T}" (id) VALUES ('a1')`); // duplicate
    });
  } catch {
    /* expected */
  }
  check("callback form rolls back correctly", (await rows()) === start);

  await db.$executeRawUnsafe(`DROP TABLE "${T}"`);
  const left = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = '${T}'`,
  );
  check("spike table removed", left[0].n === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error("SPIKE FAILED:", e);
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${T}"`).catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
