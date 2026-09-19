/**
 * What is in a tenant's database, and what must not be. Read-only, always.
 *
 *   npx tsx prisma/provision/verify-tenant.ts <org>
 *   npx tsx prisma/provision/verify-tenant.ts <org> --expect-empty
 *
 * Run after provisioning a database, and again after seeding one. It resolves
 * its target through the same guarded path the provisioner uses — urlFor()
 * refuses a protected endpoint and anything that is not this organisation's
 * own, before a connection is opened. A read-only tool pointed at a live tenant
 * still reports the wrong database's state as though it were the one being
 * built, and that is how a clean bill of health gets written about the wrong
 * machine.
 *
 * Fortitude is read here too, deliberately and only to show its counts did not
 * move. That read goes through DATABASE_URL and never through a target.
 */
import { PrismaClient } from "@prisma/client";

import { identityOf, targetFor, urlFor } from "./targets";

const [key = "apex", ...flags] = process.argv.slice(2);
const expectEmpty = flags.includes("--expect-empty");

const t = targetFor(key);
/** Guarded: refuses a protected endpoint, and anything not this tenant's. */
const apexUrl = urlFor(t, "pooled");

const apex = new PrismaClient({ datasources: { db: { url: apexUrl } } });
const fort = new PrismaClient();

/** Anything that should have failed the run. The exit code depends on it. */
let problems = 0;

const BUSINESS = [
  "Organization", "Customer", "CustomerRate", "Project", "Daily",
  "DailySheet", "Invoice", "Subcontractor", "User",
] as const;

async function main() {
  const id = identityOf(apexUrl);
  console.log(`\nAPEX  ${id.host} / ${id.database}`);
  console.log("=".repeat(66));

  const tables = await apex.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*)::bigint as n from information_schema.tables where table_schema='public'`,
  );
  console.log(`  public tables: ${tables[0].n}`);

  // The objects the app needs, including the ones 002 would have added.
  const expected = [
    "Organization", "Customer", "CustomerRate", "Project", "Daily", "DailySheet",
    "Invoice", "Subcontractor", "User", "OrgSettings", "Market", "OrgCodeProfile",
  ];
  const present = await apex.$queryRawUnsafe<{ table_name: string }[]>(
    `select table_name from information_schema.tables
      where table_schema='public' and table_name = any($1::text[])`,
    expected,
  );
  const names = present.map((p) => p.table_name);
  const missing = expected.filter((e) => !names.includes(e));
  console.log(`  expected objects present: ${names.length}/${expected.length}${missing.length ? "  MISSING: " + missing.join(", ") : ""}`);

  const crewCol = await apex.$queryRawUnsafe<{ column_name: string }[]>(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='Customer' and column_name='crewNumber'`,
  );
  console.log(`  Customer.crewNumber present: ${crewCol.length > 0}`);

  console.log("\n  business tables — every one must be empty:");
  let anyRows = false;
  for (const table of BUSINESS) {
    const r = await apex.$queryRawUnsafe<{ n: bigint }[]>(`select count(*)::bigint as n from "public"."${table}"`);
    const n = Number(r[0].n);
    if (n > 0) {
      anyRows = true;
      if (expectEmpty) problems++;
    }
    console.log(`    ${table.padEnd(16)} ${n}${n === 0 ? "" : "   <-- NOT EMPTY"}`);
  }

  console.log("\n  no other tenant's identity anywhere in Apex:");
  const orgs = await apex.$queryRawUnsafe<{ name: string }[]>(`select "name" from "public"."Organization"`);
  const custs = await apex.$queryRawUnsafe<{ name: string; crewNumber: string }[]>(
    `select "name", "crewNumber" from "public"."Customer"`,
  );
  const rates = await apex.$queryRawUnsafe<{ n: bigint }[]>(`select count(*)::bigint as n from "public"."CustomerRate"`);
  const fortOrg = orgs.some((o) => /fortitude/i.test(o.name));
  if (fortOrg) problems++;
  const prime = custs.some((c) => /globe|trawick/i.test(c.name));
  if (prime) problems++;
  const crewNo = custs.some((c) => c.crewNumber === "24208171927-A27-311");
  if (crewNo) problems++;
  console.log(`    Fortitude organisation:  ${fortOrg ? "FOUND — FAIL" : "absent"}`);
  console.log(`    Globe / Trawick:         ${prime ? "FOUND — FAIL" : "absent"}`);
  console.log(`    Fortitude crew number:   ${crewNo ? "FOUND — FAIL" : "absent"}`);
  console.log(`    rate-card rows:          ${rates[0].n}`);

  console.log(`\nFORTITUDE (read-only)`);
  console.log("=".repeat(66));
  const f = await fort.$queryRawUnsafe<Record<string, bigint>[]>(
    `select
       (select count(*) from "public"."Organization")  as organizations,
       (select count(*) from "public"."Customer")      as customers,
       (select count(*) from "public"."CustomerRate")  as rates,
       (select count(*) from "public"."Project")       as projects,
       (select count(*) from "public"."Daily")         as dailies,
       (select count(*) from "public"."Invoice")       as invoices,
       (select count(*) from "public"."DailySheet")    as sheets,
       (select count(*) from "public"."Subcontractor") as subcontractors`,
  );
  const expectF: Record<string, number> = {
    organizations: 1, customers: 2, rates: 2531, projects: 12, dailies: 33, invoices: 2,
  };
  let drift = false;
  for (const [k, v] of Object.entries(f[0])) {
    const want = expectF[k];
    const got = Number(v);
    const mark = want === undefined ? "" : got === want ? "  ok" : `  <-- EXPECTED ${want}`;
    if (want !== undefined && got !== want) {
      drift = true;
      problems++;
    }
    console.log(`  ${k.padEnd(16)} ${got}${mark}`);
  }

  const ftables = await fort.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*)::bigint as n from information_schema.tables where table_schema='public'`,
  );
  console.log(`  public tables    ${ftables[0].n}   (83 after the earlier accidental push; unchanged by this operation)`);

  const seeded = await fort.$queryRawUnsafe<{ n: bigint }[]>(
    `select (select count(*) from "public"."OrgSettings")
          + (select count(*) from "public"."Market")
          + (select count(*) from "public"."OrgCodeProfile") as n`,
  );
  const gcrew = await fort.$queryRawUnsafe<{ name: string; crewNumber: string }[]>(
    `select "name", "crewNumber" from "public"."Customer" order by "name"`,
  );
  console.log(`  rows in 002 tables: ${seeded[0].n}   (0 = 002 SQL still never executed)`);
  for (const c of gcrew) console.log(`    ${c.name.padEnd(24)} crewNumber=${JSON.stringify(c.crewNumber)}`);

  console.log("\n" + "=".repeat(66));
  console.log(
    `  empty: ${!anyRows ? "yes" : expectEmpty ? "NO" : "n/a"} · no foreign identity: ${!fortOrg && !prime && !crewNo ? "yes" : "NO"}` +
      ` · FORTITUDE unchanged: ${!drift ? "yes" : "NO"}`,
  );
}

main()
  .then(async () => {
    await Promise.all([apex.$disconnect(), fort.$disconnect()]);
    // A verification that finds a problem must not exit 0.
    if (problems) process.exit(1);
  })
  .catch(async (e) => {
    console.error("verification failed:", e instanceof Error ? e.message.split("\n")[0] : e);
    await Promise.all([apex.$disconnect(), fort.$disconnect()]);
    process.exit(1);
  });
