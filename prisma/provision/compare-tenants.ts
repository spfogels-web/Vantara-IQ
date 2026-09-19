/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled: it reads connection strings for more than
 * one tenant, which is exactly what must not reach a browser.
 */
/**
 * What is different between two tenants' databases, and what that costs.
 *
 *   npx tsx prisma/provision/compare-tenants.ts apex
 *
 * Read-only against both. Fortitude is reached through DATABASE_URL and only
 * ever read; the tenant is resolved through the guarded path, which refuses a
 * protected endpoint before opening a connection.
 *
 * The point is not to make the two identical. Fortitude is a live business
 * whose configuration tables are empty because 002 has never run there, and
 * Apex is a demonstration tenant that was seeded with its own. Both of those
 * are legitimate states and the application has to work in each — so this
 * reports the differences and leaves the decision about them to a person.
 */
import { PrismaClient } from "@prisma/client";

import { identityOf, targetFor, urlFor } from "./targets";

type Row = { table_name: string; column_name: string; data_type: string };

async function columns(db: PrismaClient): Promise<Map<string, Map<string, string>>> {
  const rows = await db.$queryRawUnsafe<Row[]>(
    `select table_name, column_name, data_type
       from information_schema.columns
      where table_schema = 'public'
      order by table_name, column_name`,
  );
  const out = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (!out.has(r.table_name)) out.set(r.table_name, new Map());
    out.get(r.table_name)!.set(r.column_name, r.data_type);
  }
  return out;
}

/** Configuration tables the application reads on ordinary requests. */
const CONFIG_TABLES = ["OrgSettings", "Market", "OrgCodeProfile", "Organization"] as const;

async function counts(db: PrismaClient, tables: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = await db
      .$queryRawUnsafe<{ n: bigint }[]>(`select count(*)::bigint as n from "public"."${t}"`)
      .catch(() => [{ n: BigInt(-1) }]);
    out[t] = Number(r[0].n);
  }
  return out;
}

async function main() {
  const key = process.argv[2] ?? "apex";
  const t = targetFor(key);
  const tenantUrl = urlFor(t, "pooled");

  const tenant = new PrismaClient({ datasources: { db: { url: tenantUrl } } });
  const fort = new PrismaClient();

  try {
    console.log(`\nComparing ${t.label} with Fortitude (both read-only)`);
    console.log(`  tenant    ${identityOf(tenantUrl).host}`);
    console.log(`  fortitude ${identityOf(process.env.DATABASE_URL!).host}\n`);

    // ---- structure --------------------------------------------------------
    const [a, f] = await Promise.all([columns(tenant), columns(fort)]);
    const allTables = [...new Set([...a.keys(), ...f.keys()])].sort();

    const onlyTenant: string[] = [];
    const onlyFort: string[] = [];
    const colDiffs: string[] = [];

    for (const table of allTables) {
      const ta = a.get(table);
      const tf = f.get(table);
      if (ta && !tf) { onlyTenant.push(table); continue; }
      if (tf && !ta) { onlyFort.push(table); continue; }
      for (const col of new Set([...ta!.keys(), ...tf!.keys()])) {
        const da = ta!.get(col);
        const df = tf!.get(col);
        if (da && !df) colDiffs.push(`${table}.${col} — only in ${t.label}`);
        else if (df && !da) colDiffs.push(`${table}.${col} — only in Fortitude`);
        else if (da !== df) colDiffs.push(`${table}.${col} — ${da} vs ${df}`);
      }
    }

    console.log("STRUCTURE");
    console.log(`  tables: ${a.size} in tenant, ${f.size} in Fortitude`);
    console.log(`  tables only in tenant:    ${onlyTenant.length ? onlyTenant.join(", ") : "none"}`);
    console.log(`  tables only in Fortitude: ${onlyFort.length ? onlyFort.join(", ") : "none"}`);
    console.log(`  column differences:       ${colDiffs.length ? "" : "none"}`);
    for (const d of colDiffs) console.log(`    ${d}`);

    // ---- configuration ----------------------------------------------------
    const [ca, cf] = await Promise.all([counts(tenant, CONFIG_TABLES), counts(fort, CONFIG_TABLES)]);
    console.log("\nCONFIGURATION ROWS");
    console.log(`  ${"table".padEnd(16)} tenant   Fortitude`);
    for (const table of CONFIG_TABLES) {
      const mark = ca[table] > 0 && cf[table] === 0 ? "   <-- tenant configured, Fortitude not" : "";
      console.log(`  ${table.padEnd(16)} ${String(ca[table]).padStart(6)} ${String(cf[table]).padStart(10)}${mark}`);
    }

    // ---- the columns a request touches ------------------------------------
    console.log("\nPER-CUSTOMER CONFIGURATION");
    const crewT = await tenant.customer.count({ where: { crewNumber: { not: "" } } });
    const crewF = await fort.customer.count({ where: { crewNumber: { not: "" } } });
    const custT = await tenant.customer.count();
    const custF = await fort.customer.count();
    console.log(`  customers with a crew number: ${crewT}/${custT} tenant, ${crewF}/${custF} Fortitude`);

    console.log("\nLIVE COUNTS (reported, not asserted)");
    const live = ["Project", "Daily", "Invoice", "Subcontractor", "Task", "LocateTicket"];
    const [la, lf] = await Promise.all([counts(tenant, live), counts(fort, live)]);
    for (const table of live) {
      console.log(`  ${table.padEnd(16)} ${String(la[table]).padStart(6)} ${String(lf[table]).padStart(10)}`);
    }
  } finally {
    await Promise.all([tenant.$disconnect(), fort.$disconnect()]);
  }
}

main().catch((e) => {
  console.error("\nComparison failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
