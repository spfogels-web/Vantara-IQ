/**
 * Create an organisation's schema in its own database. Nothing else, ever.
 *
 *   npx tsx prisma/provision/provision.ts <org>            # preflight + dry run
 *   npx tsx prisma/provision/provision.ts <org> --apply    # and write it
 *
 * Written after `prisma db push` intended for Apex landed on Fortitude
 * production: the shell's DATABASE_URL was overridden, Prisma loaded .env
 * afterwards, and Fortitude's value won. The command printed the host it had
 * chosen and pushed anyway. Three things follow, and all three are here.
 *
 * ONE — the datasource cannot name a live tenant. The schema handed to Prisma
 * is generated from prisma/schema.prisma with its datasource block replaced by
 * one reading VQ_PROVISION_URL, a variable that exists only inside this
 * process. DATABASE_URL cannot satisfy it however it is loaded, and there is no
 * directUrl for Fortitude's unpooled string to fill.
 *
 * TWO — refusal is on identity, not intent. The host actually resolved is
 * checked against a deny list before Prisma is invoked at all, and against the
 * endpoint this organisation is expected to live on. A correct-looking string
 * pointed at the wrong project is refused.
 *
 * THREE — the rows get a say. The target is asked who it belongs to. Finding a
 * live organisation or one of its primes stops the run, because that is the
 * check that catches the mistake a URL comparison cannot see.
 *
 * It never passes --accept-data-loss. If Prisma reports a destructive change,
 * this stops and says so: on a database being created there is nothing to lose,
 * so a destructive diff means the target is not what we think it is.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { NEVER_PROVISION, identityOf, targetFor, type ProvisionTarget } from "./targets";

const ROOT = process.cwd();
/** The one variable the generated datasource reads. Never set in .env. */
const PROVISION_VAR = "VQ_PROVISION_URL";

let failed = false;
function check(ok: boolean, name: string, detail = ""): boolean {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failed = true;
  return ok;
}

function stop(why: string): never {
  console.error(`\n${"=".repeat(68)}`);
  console.error(`  PROVISIONING REFUSED`);
  console.error("=".repeat(68));
  console.error(`\n  ${why}\n`);
  process.exit(1);
}

/**
 * The application schema, re-pointed at this tool's own variable.
 *
 * One source of truth — prisma/schema.prisma — with the datasource swapped, so
 * a model added to the app is provisioned without anybody remembering to copy
 * it, and the copy can never drift into naming DATABASE_URL again.
 */
function generateSchema(dir: string): string {
  const src = readFileSync(resolve(ROOT, "prisma/schema.prisma"), "utf8");
  const swapped = src.replace(
    /datasource\s+db\s*\{[\s\S]*?\n\}/,
    `datasource db {\n  provider = "postgresql"\n  url      = env("${PROVISION_VAR}")\n}`,
  );

  if (/env\("DATABASE_URL"\)|env\("DATABASE_URL_UNPOOLED"\)/.test(swapped)) {
    stop("the generated schema still names Fortitude's variables — refusing to hand it to Prisma");
  }
  if (!swapped.includes(`env("${PROVISION_VAR}")`)) {
    stop("the datasource block was not replaced — refusing to run against an unknown datasource");
  }

  const path = join(dir, "schema.prisma");
  writeFileSync(path, swapped);
  return path;
}

/** The kill switch. Runs before Prisma is invoked, on the host we resolved. */
function refuseForbiddenHost(host: string, where: string): void {
  for (const { mark, who } of NEVER_PROVISION) {
    if (host.includes(mark)) {
      stop(
        `${where} resolves to ${host}, which contains "${mark}" — ${who}.\n` +
          `  This tool never provisions a live tenant. Nothing was sent to Prisma.`,
      );
    }
  }
}

async function assertTarget(t: ProvisionTarget, url: string, label: string): Promise<number> {
  const id = identityOf(url);
  console.log(`\n${label}`);
  console.log(`  host ${id.host}`);
  console.log(`  db   ${id.database}`);

  // Kill switch first, before anything connects or writes.
  refuseForbiddenHost(id.host, label);

  const right = check(
    id.host.includes(t.expectHostMark),
    `host is ${t.label}'s endpoint ("${t.expectHostMark}")`,
    id.host,
  );
  for (const { mark } of NEVER_PROVISION) {
    check(!id.host.includes(mark), `host is not a protected endpoint ("${mark}")`);
  }

  /**
   * Stop on identity before opening a connection.
   *
   * A host that is not this organisation's is already a refusal, and carrying
   * on to connect means the run's outcome depends on whether some unknown
   * server happens to answer — the first version of this reported an
   * authentication failure rather than the wrong endpoint, which tells whoever
   * is reading the wrong story about what went wrong.
   */
  if (!right) {
    stop(
      `${label} resolves to ${id.host}, which is not ${t.label}'s endpoint ("${t.expectHostMark}").\n` +
        `  No connection was opened and nothing was sent to Prisma.`,
    );
  }

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const q = async (sql: string) =>
      db.$queryRawUnsafe<{ name: string }[]>(sql).catch((e: unknown) => {
        const m = e instanceof Error ? e.message : String(e);
        if (/does not exist/i.test(m)) return [] as { name: string }[];
        throw e;
      });

    const orgs = await q(`select "name" from "public"."Organization"`);
    const customers = await q(`select "name" from "public"."Customer"`);

    const live = orgs.find((o) => /fortitude/i.test(o.name));
    check(!live, "no live organisation in this database", live ? `found "${live.name}"` : "");

    const prime = customers.find((c) => /globe|trawick/i.test(c.name));
    check(!prime, "none of a live tenant's customers in this database", prime ? `found "${prime.name}"` : "");

    const tables = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*)::bigint as n from information_schema.tables where table_schema='public'`,
    );
    const n = Number(tables[0].n);
    console.log(`  state: ${orgs.length} organisations, ${customers.length} customers, ${n} tables`);
    return n;
  } finally {
    await db.$disconnect();
  }
}

/** Fortitude's counts, read-only, so the report can show they did not move. */
async function fortitudeFingerprint(): Promise<Record<string, number> | null> {
  if (!process.env.DATABASE_URL) return null;
  const db = new PrismaClient();
  try {
    const r = await db.$queryRawUnsafe<Record<string, bigint>[]>(
      `select
         (select count(*) from "public"."Organization") as organizations,
         (select count(*) from "public"."Customer")     as customers,
         (select count(*) from "public"."CustomerRate") as rates,
         (select count(*) from "public"."Project")      as projects,
         (select count(*) from "public"."Daily")        as dailies,
         (select count(*) from "public"."Invoice")      as invoices`,
    );
    return Object.fromEntries(Object.entries(r[0]).map(([k, v]) => [k, Number(v)]));
  } catch {
    return null;
  } finally {
    await db.$disconnect();
  }
}

function prisma(args: string[], url: string): string {
  return execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), ...args], {
    encoding: "utf8",
    // The generated schema reads PROVISION_VAR. DATABASE_URL is passed through
    // untouched and unused — the datasource cannot name it.
    env: { ...process.env, [PROVISION_VAR]: url },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function main() {
  const [key, ...flags] = process.argv.slice(2);
  const apply = flags.includes("--apply");

  if (!key) stop("usage: provision.ts <org> [--apply]");
  if (flags.includes("--accept-data-loss")) {
    stop("--accept-data-loss is not accepted by this tool. A database being created has nothing to lose.");
  }

  const t = targetFor(key);
  console.log(`\nProvisioning preflight — ${t.label}\n${"-".repeat(60)}`);

  const url = process.env[t.urlVar];
  const direct = process.env[t.directUrlVar];
  if (!url) stop(`${t.urlVar} is not set — refusing to guess a target`);
  if (!direct) stop(`${t.directUrlVar} is not set — refusing to guess a target`);

  const before = await fortitudeFingerprint();

  // Both endpoints are checked: the write uses the direct one, and a pooled
  // string pointing somewhere else would mean the pair is not one database.
  const pooledTables = await assertTarget(t, url, "Pooled endpoint");
  const directTables = await assertTarget(t, direct, "Direct endpoint (the one the write uses)");

  check(pooledTables === directTables, "both endpoints see the same database", `${pooledTables} / ${directTables}`);

  if (failed) stop("one or more target assertions failed. Prisma was not invoked.");

  const dir = mkdtempSync(join(tmpdir(), "vq-provision-"));
  try {
    const schema = generateSchema(dir);
    console.log(`\nGenerated datasource reads ${PROVISION_VAR} only (no DATABASE_URL, no directUrl).`);

    console.log("\nWhat the write would change:");
    const diff = prisma(
      ["migrate", "diff", "--from-url", direct, "--to-schema-datamodel", schema, "--script"],
      direct,
    );
    const statements = diff.split("\n").filter((l) => /^\s*(CREATE|ALTER|DROP)\b/i.test(l));
    const destructive = statements.filter((l) => /^\s*DROP\b/i.test(l));

    console.log(`  ${statements.length} statements, ${destructive.length} destructive`);
    for (const d of destructive) console.log(`    ${d.trim()}`);
    console.log(`    (first few: ${statements.slice(0, 3).map((s) => s.trim().slice(0, 48)).join(" | ") || "none"})`);

    if (destructive.length) {
      stop(
        `the diff contains ${destructive.length} destructive statement(s). A database being\n` +
          `  created has nothing to drop, so this target is not what it should be. Stopping\n` +
          `  rather than passing --accept-data-loss.`,
      );
    }

    if (!apply) {
      console.log(`\n${"-".repeat(60)}`);
      console.log("Preflight passed. Nothing was written — re-run with --apply to create the schema.");
      if (before) console.log(`Fortitude (read-only): ${JSON.stringify(before)}`);
      return;
    }

    console.log("\nApplying…");
    const out = prisma(["db", "push", "--schema", schema, "--skip-generate"], direct);
    const host = out.split("\n").find((l) => l.includes("Datasource")) ?? "";
    console.log(`  ${host.trim()}`);
    refuseForbiddenHost(host, "the datasource Prisma reported");
    console.log(out.split("\n").slice(-3).join("\n"));

    const after = await fortitudeFingerprint();
    console.log(`\nFortitude before: ${JSON.stringify(before)}`);
    console.log(`Fortitude after:  ${JSON.stringify(after)}`);
    if (before && after && JSON.stringify(before) !== JSON.stringify(after)) {
      stop("Fortitude's row counts changed during provisioning. Investigate before doing anything else.");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("\nProvisioning failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
