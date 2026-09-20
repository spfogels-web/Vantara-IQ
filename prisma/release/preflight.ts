/**
 * What is actually in Fortitude's production database, before anything writes.
 *
 * Read-only. It opens no transaction, creates nothing and changes nothing; it
 * exists because the last time this database's state was assumed rather than
 * measured, a `db push` meant for a demo tenant landed on a live business.
 *
 * The one thing it does aggressively is identify its target. A migration run
 * against the wrong database is the failure this whole file is shaped around,
 * so the host is asserted to be Fortitude's before a single query, and an
 * unexpected endpoint aborts rather than reports.
 *
 *   npx tsx prisma/release/preflight.ts
 */
import { PrismaClient } from "@prisma/client";

/** Fortitude production's Neon endpoint. Not a secret — an identity. */
const FORTITUDE_MARK = "damp-mouse";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * Refuse to run anywhere but Fortitude production.
 *
 * Positive identification, not absence of a deny mark: "this is the database I
 * was told to touch" is the only claim worth acting on. A URL that is merely
 * *not* on a blocklist could be anything, including a tenant nobody has
 * thought about yet.
 */
function assertFortitudeProduction(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL is not set. Refusing to guess a target.");
  const host = hostOf(url);
  if (!host) throw new Error("DATABASE_URL is not a URL this can identify. Refusing.");
  if (!host.includes(FORTITUDE_MARK)) {
    throw new Error(
      `Expected Fortitude production (${FORTITUDE_MARK}) and got "${host}". Refusing to continue.`,
    );
  }
  // Apex must never be reachable from a Fortitude release path, even by accident.
  if (host.includes("aged-dew")) throw new Error("That is Apex. Refusing.");
  return host;
}

type Row = Record<string, unknown>;

async function main() {
  // The direct endpoint, deliberately. The pooled one hands back server
  // connections carrying an earlier session's search_path, so unqualified SQL
  // there resolves to whatever a previous connection left behind — see
  // compare-endpoints.ts. Schema inspection must not be subject to that.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const host = assertFortitudeProduction(url);

  const db = new PrismaClient({ datasources: { db: { url } } });
  const dbName = (await db.$queryRawUnsafe<Row[]>("select current_database() as n"))[0]?.n;

  console.log(`target        : ${host}`);
  console.log(`database      : ${String(dbName)}`);
  console.log(`identified as : Fortitude Infrastructure (production)`);
  console.log("");

  // ---- what 002 introduced structurally --------------------------------
  // Some of this arrived by accident when the schema was synced. The point is
  // to say which parts are already satisfied, so 002 is not re-run blindly.
  const tables = await db.$queryRawUnsafe<Row[]>(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `);
  const tableNames = new Set(tables.map((t) => String(t.table_name)));

  const cols = await db.$queryRawUnsafe<Row[]>(`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema = 'public'
  `);
  const has = (t: string, c: string) =>
    cols.some((x) => x.table_name === t && x.column_name === c);

  console.log("002 structure");
  for (const t of ["Market", "OrgCodeProfile", "OrgSettings"]) {
    console.log(`  table ${t.padEnd(16)} ${tableNames.has(t) ? "present" : "MISSING"}`);
  }
  console.log(`  User.isPlatformAdmin   ${has("User", "isPlatformAdmin") ? "present" : "MISSING"}`);
  console.log(`  Customer.crewNumber    ${has("Customer", "crewNumber") ? "present" : "MISSING"}`);
  console.log("");

  // ---- what 003 will add -----------------------------------------------
  const enums = await db.$queryRawUnsafe<Row[]>(`
    select t.typname as name from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e' order by 1
  `);
  const enumNames = new Set(enums.map((e) => String(e.name)));

  console.log("003 targets (want: absent before, present after)");
  for (const e of ["EvidenceStage", "EvidenceCategory", "PreConStatus"]) {
    console.log(`  enum ${e.padEnd(18)} ${enumNames.has(e) ? "ALREADY PRESENT" : "absent"}`);
  }
  const photoCols = [
    "stage", "category", "existingDamage", "damageNote",
    "dailySheetId", "dailyId", "subcontractorId", "uploadedByUserId", "uploadedAt",
  ];
  for (const c of photoCols) {
    console.log(`  ProjectPhoto.${c.padEnd(18)} ${has("ProjectPhoto", c) ? "ALREADY PRESENT" : "absent"}`);
  }
  for (const c of ["preConStatus", "preConCompletedBy", "preConCompletedAt"]) {
    console.log(`  Project.${c.padEnd(23)} ${has("Project", c) ? "ALREADY PRESENT" : "absent"}`);
  }
  console.log("");

  // locationSource must survive untouched — it is TEXT on purpose.
  const loc = cols.find((x) => x.table_name === "ProjectPhoto" && x.column_name === "locationSource");
  console.log(`  ProjectPhoto.locationSource : ${loc ? `${loc.data_type}, nullable=${loc.is_nullable}` : "MISSING"}`);
  console.log("");

  // ---- the data that must survive --------------------------------------
  const counts: [string, number][] = [];
  for (const t of [
    "Project", "ProjectPhoto", "DailySheet", "Daily", "Customer", "Subcontractor",
    "Invoice", "SubInvoice", "Market", "OrgSettings", "User", "CustomerRate",
  ]) {
    if (!tableNames.has(t)) continue;
    const r = await db.$queryRawUnsafe<Row[]>(`select count(*)::int as n from "${t}"`);
    counts.push([t, Number(r[0]?.n ?? 0)]);
  }
  console.log("row counts");
  for (const [t, n] of counts) console.log(`  ${t.padEnd(16)} ${n}`);
  console.log("");

  // ---- the configuration blocker ---------------------------------------
  // The new code must not go live while the organisation is nameless or has
  // no markets: that is what makes Fortitude read as "the office".
  if (tableNames.has("OrgSettings")) {
    const s = await db.$queryRawUnsafe<Row[]>(`select * from "OrgSettings" limit 2`);
    console.log(`OrgSettings rows: ${s.length}`);
    if (s[0]) {
      for (const [k, v] of Object.entries(s[0])) {
        const shown = v instanceof Date ? v.toISOString() : String(v);
        console.log(`  ${k.padEnd(24)} ${shown.length > 60 ? shown.slice(0, 60) + "…" : shown}`);
      }
    }
    console.log("");
  }
  if (tableNames.has("Market")) {
    const m = await db.$queryRawUnsafe<Row[]>(`select name, prime from "Market" order by name`);
    console.log(`Markets: ${m.length}`);
    for (const x of m) console.log(`  ${String(x.name)}  prime=${String(x.prime)}`);
    console.log("");
  }
  const custs = await db.$queryRawUnsafe<Row[]>(
    `select name, ${has("Customer", "crewNumber") ? `"crewNumber"` : `'' as "crewNumber"`} from "Customer" order by name`,
  );
  console.log(`Customers: ${custs.length}`);
  for (const c of custs) console.log(`  ${String(c.name).padEnd(34)} crewNumber="${String(c.crewNumber)}"`);
  console.log("");

  // ---- historical daily media, the backfill's census -------------------
  const sheets = await db.$queryRawUnsafe<Row[]>(
    `select count(*)::int as n from "DailySheet" where photos is not null and photos::text not in ('[]','null')`,
  );
  console.log(`DailySheets carrying photos: ${Number(sheets[0]?.n ?? 0)}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(`\nPREFLIGHT ABORTED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
