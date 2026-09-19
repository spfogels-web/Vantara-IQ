/**
 * Refuse to write to anything that is not Apex.
 *
 * Every write in Step 5 goes through here first. Not because the connection
 * string is likely to be wrong, but because the one time something in this
 * codebase wrote where it was not supposed to, the string looked right and the
 * assumption underneath it was wrong: a Neon endpoint quietly ignored the
 * schema it was handed and put test rows into live data.
 *
 * So the target is not trusted for being called APEX_DATABASE_URL. It has to
 * prove, against the database it actually reaches, that it is not Fortitude:
 *
 *   1. A different host from DATABASE_URL. Same host and database means the
 *      same rows however the variable is spelled.
 *   2. No Fortitude organisation in it. This is the check that would catch the
 *      real mistake — a correct-looking string pointed at the wrong project —
 *      because it asks the data who it is rather than asking the URL.
 *   3. No Fortitude customer in it. Globe and Trawick are Fortitude's primes;
 *      finding either means this is Fortitude's data whatever else says.
 *
 * Throws on any doubt, including on an error it cannot interpret. A guard that
 * fails open is not a guard.
 */
import { PrismaClient } from "@prisma/client";

export type ApexTarget = { host: string; database: string; tables: number };

/** Host and database, never credentials. */
function identity(url: string) {
  const u = new URL(url);
  return { host: u.host, database: u.pathname.replace(/^\//, ""), user: u.username };
}

export function apexUrl(kind: "pooled" | "direct" = "pooled"): string {
  const key = kind === "pooled" ? "APEX_DATABASE_URL" : "APEX_DATABASE_URL_UNPOOLED";
  const url = process.env[key];
  if (!url) throw new Error(`${key} is not set — refusing to guess a target`);
  return url;
}

/**
 * Proves the connection reaches Apex and not Fortitude, and hands back what it
 * found. Call this before the first write and let it throw.
 */
/**
 * @param onlyData skips the two URL comparisons so the data checks can be
 * proven to fire on their own. The preflight uses it to point the guard at
 * Fortitude and watch it refuse on the rows rather than on the string —
 * otherwise the check that would catch the real mistake is never exercised.
 */
export async function assertApexTarget(
  url: string,
  { onlyData = false }: { onlyData?: boolean } = {},
): Promise<ApexTarget> {
  const fort = process.env.DATABASE_URL;
  if (!fort) throw new Error("DATABASE_URL is not set — cannot prove the target is not Fortitude");

  const a = identity(url);
  const f = identity(fort);

  console.log(`  target   host ${a.host}  db ${a.database}`);
  console.log(`  fortitude host ${f.host}  db ${f.database}`);

  if (!onlyData) {
    if (url === fort) throw new Error("REFUSING: the target is Fortitude's own connection string");
    if (a.host === f.host && a.database === f.database) {
      throw new Error(`REFUSING: same host and database as Fortitude (${a.host}/${a.database})`);
    }
  }

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    // Ask the data who it is. An empty database answers "nobody", which is the
    // correct answer for Apex before it is built and is accepted as such.
    const orgs = await db
      .$queryRawUnsafe<{ name: string }[]>(`select "name" from "public"."Organization"`)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        // "table does not exist" is the expected state of a fresh Apex.
        if (/does not exist|relation .* does not exist/i.test(msg)) return [] as { name: string }[];
        throw e;
      });

    const fortitudeOrg = orgs.find((o) => /fortitude/i.test(o.name));
    if (fortitudeOrg) {
      throw new Error(
        `REFUSING: this database contains the organisation "${fortitudeOrg.name}" — it is Fortitude, not Apex`,
      );
    }

    const customers = await db
      .$queryRawUnsafe<{ name: string }[]>(`select "name" from "public"."Customer"`)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/does not exist|relation .* does not exist/i.test(msg)) return [] as { name: string }[];
        throw e;
      });

    const prime = customers.find((c) => /globe|trawick/i.test(c.name));
    if (prime) {
      throw new Error(
        `REFUSING: this database contains the customer "${prime.name}" — that is one of Fortitude's primes`,
      );
    }

    const tables = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*)::bigint as n from information_schema.tables where table_schema = 'public'`,
    );

    const found = Number(tables[0].n);
    console.log(`  proven:  not Fortitude — ${orgs.length} organisations, ${customers.length} customers, ${found} tables`);
    return { host: a.host, database: a.database, tables: found };
  } finally {
    await db.$disconnect();
  }
}

/** Fortitude's row counts, read-only, for a before/after comparison. */
export async function fortitudeFingerprint(): Promise<Record<string, number>> {
  const db = new PrismaClient();
  try {
    const r = await db.$queryRawUnsafe<Record<string, bigint>[]>(
      `select
         (select count(*) from "public"."Organization")  as organizations,
         (select count(*) from "public"."Customer")      as customers,
         (select count(*) from "public"."CustomerRate")  as rates,
         (select count(*) from "public"."Project")       as projects,
         (select count(*) from "public"."Daily")         as dailies,
         (select count(*) from "public"."DailySheet")    as sheets,
         (select count(*) from "public"."Invoice")       as invoices,
         (select count(*) from "public"."Subcontractor") as subcontractors`,
    );
    return Object.fromEntries(Object.entries(r[0]).map(([k, v]) => [k, Number(v)]));
  } finally {
    await db.$disconnect();
  }
}
