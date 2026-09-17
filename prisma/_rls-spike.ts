/**
 * Phase 0 spike: is Postgres row-level security usable here, and what does it cost?
 *
 * Run one: every isolation check leaked. Policies were enabled, FORCEd, and
 * simply ignored — because Neon's default role `neondb_owner` carries
 * BYPASSRLS. That is the failure mode the whole design was meant to avoid: no
 * error, no warning, a security layer that silently does nothing.
 *
 * So the spike now proves both halves:
 *   1. that a dedicated NOBYPASSRLS role makes the policy real, and
 *   2. what the per-request transaction it requires actually costs.
 *
 * Everything lives in a throwaway `rls_spike` schema and a throwaway role,
 * both dropped at the end. No application table is touched.
 *
 *   npx tsx prisma/_rls-spike.ts
 */
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const owner = new PrismaClient();

const ORG_A = "org_aaaaaaaaaaaaaaaaaaaa";
const ORG_B = "org_bbbbbbbbbbbbbbbbbbbb";
const ROWS = 2000;
const QUERIES_PER_PAGE = 8;
const SAMPLES = 30;

/** tsconfig targets below ES2020, so a 0n literal will not compile. */
const ZERO = BigInt(0);

/**
 * A fresh name every run.
 *
 * Dropping and recreating a role with the same name fails against the pooled
 * endpoint with `invalid role OID` — the pooler still holds the old oid for
 * that name and authenticates against it. Worth knowing before Phase 4 creates
 * the real application role: create it once and leave it, rather than
 * recreating it on each deploy.
 */
const ROLE = `vq_rls_spike_${randomBytes(4).toString("hex")}`;
const PASSWORD = randomBytes(18).toString("base64url");

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { p50: +at(0.5).toFixed(1), p95: +at(0.95).toFixed(1) };
}

async function time(fn: () => Promise<unknown>, n = SAMPLES) {
  for (let i = 0; i < 5; i++) await fn();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    out.push(performance.now() - t);
  }
  return stats(out);
}

/** Same host and database, different credentials. Never printed. */
function urlAs(role: string, password: string) {
  const u = new URL(process.env.DATABASE_URL!);
  u.username = role;
  u.password = password;
  return u.toString();
}

const ok = (b: boolean) => (b ? "ok" : "!!! LEAKS");

async function main() {
  console.log("Setting up a throwaway schema and role…\n");

  await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS rls_spike CASCADE`);
  await owner.$executeRawUnsafe(`CREATE SCHEMA rls_spike`);

  for (const t of ["plain", "guarded"]) {
    await owner.$executeRawUnsafe(`
      CREATE TABLE rls_spike.${t} (
        id               text PRIMARY KEY,
        "organizationId" text NOT NULL,
        name             text NOT NULL,
        status           text NOT NULL,
        amount           numeric NOT NULL
      )`);
    await owner.$executeRawUnsafe(`
      INSERT INTO rls_spike.${t} (id, "organizationId", name, status, amount)
      SELECT 'row_' || g,
             CASE WHEN g % 2 = 0 THEN '${ORG_A}' ELSE '${ORG_B}' END,
             'Project ' || g,
             CASE WHEN g % 3 = 0 THEN 'ACTIVE' ELSE 'CLOSED' END,
             (g * 37 % 90000)::numeric
        FROM generate_series(1, ${ROWS}) g`);
    await owner.$executeRawUnsafe(`CREATE INDEX ON rls_spike.${t} ("organizationId", status)`);
  }

  await owner.$executeRawUnsafe(`ALTER TABLE rls_spike.guarded ENABLE ROW LEVEL SECURITY`);
  await owner.$executeRawUnsafe(`ALTER TABLE rls_spike.guarded FORCE ROW LEVEL SECURITY`);
  // NULLIF so that "never set" is NULL rather than the empty string, and the
  // policy can require a real value instead of relying on '' matching nothing.
  await owner.$executeRawUnsafe(`
    CREATE POLICY tenant_isolation ON rls_spike.guarded
      USING      ("organizationId" = NULLIF(current_setting('app.org_id', true), ''))
      WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), ''))`);

  /* ---- the role the application should connect as ---- */

  await owner.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`);
  await owner.$executeRawUnsafe(
    `CREATE ROLE ${ROLE} LOGIN PASSWORD '${PASSWORD}' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE`,
  );
  await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA rls_spike TO ${ROLE}`);
  await owner.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rls_spike TO ${ROLE}`,
  );

  const app = new PrismaClient({ datasources: { db: { url: urlAs(ROLE, PASSWORD) } } });

  const who = await app.$queryRawUnsafe<{ u: string; bypass: boolean }[]>(
    `SELECT current_user AS u, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`,
  );
  console.log(`  application role: ${who[0].u}   BYPASSRLS: ${who[0].bypass}\n`);

  /* ---------------- correctness, as the restricted role ---------------- */

  console.log("=== Does the policy actually isolate now? ===");

  const unset = await app.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM rls_spike.guarded`,
  );
  console.log(`  no app.org_id set                 ${unset[0].n} of ${ROWS} rows   ${ok(unset[0].n === ZERO)}`);

  const r = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.org_id', '${ORG_A}', true)`);
    const mine = await tx.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM rls_spike.guarded`,
    );
    // row_1 belongs to org B. This is the direct-object-reference shape: the
    // exact thing the nine API routes do today.
    const stolen = await tx.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM rls_spike.guarded WHERE id = 'row_1'`,
    );
    const agg = await tx.$queryRawUnsafe<{ s: string | null }[]>(
      `SELECT sum(amount)::text AS s FROM rls_spike.guarded`,
    );
    const allAgg = await owner.$queryRawUnsafe<{ s: string | null }[]>(
      `SELECT sum(amount)::text AS s FROM rls_spike.plain`,
    );
    return { mine: mine[0].n, stolen: stolen[0].n, agg: agg[0].s, allAgg: allAgg[0].s };
  });
  console.log(`  as org A, count                   ${r.mine} of ${ROWS} rows   ${ok(r.mine === BigInt(ROWS / 2))}`);
  console.log(`  as org A, fetch B's row by id     ${r.stolen} rows   ${ok(r.stolen === ZERO)}`);
  console.log(
    `  as org A, SUM(amount)             ${r.agg} vs ${r.allAgg} unscoped   ${ok(r.agg !== r.allAgg)}`,
  );

  let blocked = false;
  try {
    await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.org_id', '${ORG_A}', true)`);
      await tx.$executeRawUnsafe(
        `INSERT INTO rls_spike.guarded VALUES ('smuggled', '${ORG_B}', 'x', 'ACTIVE', 1)`,
      );
    });
  } catch {
    blocked = true;
  }
  console.log(`  as org A, insert a row owned by B ${blocked ? "refused" : "!!! ALLOWED"}`);

  let updBlocked = false;
  try {
    await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.org_id', '${ORG_A}', true)`);
      const n = await tx.$executeRawUnsafe(
        `UPDATE rls_spike.guarded SET name = 'tampered' WHERE id = 'row_1'`,
      );
      if (n === 0) updBlocked = true;
    });
  } catch {
    updBlocked = true;
  }
  console.log(`  as org A, update B's row by id    ${updBlocked ? "no rows affected" : "!!! CHANGED IT"}`);

  const leak = await app.$queryRawUnsafe<{ v: string | null }[]>(
    `SELECT NULLIF(current_setting('app.org_id', true), '') AS v`,
  );
  console.log(
    `  setting after the transaction     ${leak[0].v === null ? "cleared" : `!!! STILL '${leak[0].v}'`}\n`,
  );

  /* ---------------- cost ---------------- */

  console.log(`=== What the transaction costs (${SAMPLES} samples) ===`);
  console.log("  (absolute numbers are inflated — this runs from a laptop, not from Vercel");
  console.log("   in Neon's region. The ratios are the part that carries over.)\n");

  const SELECT = (t: string) =>
    `SELECT id, name, amount FROM rls_spike.${t} WHERE status = 'ACTIVE' LIMIT 50`;

  const one = await time(() => owner.$queryRawUnsafe(SELECT("plain")));
  console.log(`  1 query, no transaction           p50 ${one.p50}ms   p95 ${one.p95}ms`);

  const oneTx = await time(() =>
    app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.org_id', '${ORG_A}', true)`);
      return tx.$queryRawUnsafe(SELECT("guarded"));
    }),
  );
  console.log(
    `  1 query, own transaction          p50 ${oneTx.p50}ms   p95 ${oneTx.p95}ms   ${(oneTx.p50 / one.p50).toFixed(2)}x`,
  );

  const page = await time(async () => {
    for (let i = 0; i < QUERIES_PER_PAGE; i++) await owner.$queryRawUnsafe(SELECT("plain"));
  });
  console.log(`\n  ${QUERIES_PER_PAGE} queries, no transaction        p50 ${page.p50}ms   p95 ${page.p95}ms`);

  const pageEach = await time(async () => {
    for (let i = 0; i < QUERIES_PER_PAGE; i++) {
      await app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.org_id', '${ORG_A}', true)`);
        return tx.$queryRawUnsafe(SELECT("guarded"));
      });
    }
  });
  console.log(
    `  ${QUERIES_PER_PAGE} queries, a transaction each    p50 ${pageEach.p50}ms   p95 ${pageEach.p95}ms   ${(pageEach.p50 / page.p50).toFixed(2)}x`,
  );

  const pageOnce = await time(() =>
    app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.org_id', '${ORG_A}', true)`);
      for (let i = 0; i < QUERIES_PER_PAGE; i++) await tx.$queryRawUnsafe(SELECT("guarded"));
    }),
  );
  console.log(
    `  ${QUERIES_PER_PAGE} queries, one transaction       p50 ${pageOnce.p50}ms   p95 ${pageOnce.p95}ms   ${(pageOnce.p50 / page.p50).toFixed(2)}x`,
  );

  await app.$disconnect();

  console.log("\nCleaning up…");
  await owner.$executeRawUnsafe(`DROP SCHEMA rls_spike CASCADE`);
  await owner.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`);
  const left = await owner.$queryRawUnsafe<{ s: bigint; r: bigint }[]>(`
    SELECT (SELECT count(*)::bigint FROM information_schema.schemata WHERE schema_name = 'rls_spike') AS s,
           (SELECT count(*)::bigint FROM pg_roles WHERE rolname = '${ROLE}') AS r`);
  console.log(`  schema left: ${left[0].s}   role left: ${left[0].r}`);
}

main()
  .catch(async (e) => {
    console.error("\nSPIKE FAILED:", e);
    await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS rls_spike CASCADE`).catch(() => {});
    await owner.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => owner.$disconnect());
