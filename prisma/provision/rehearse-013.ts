/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled.
 */
/**
 * Rehearse 013 against the disposable test branch.
 *
 *   npx tsx prisma/provision/rehearse-013.ts
 *
 * 013 adds four columns to OrgSettings, and the only one that really matters is
 * the default. `preConRequired` turns a safety rule off when it is false, and a
 * migration that let an existing tenant come out of it with the rule off would
 * have removed that rule from a live business silently. So the question this
 * answers is not "did the column appear" but "does an organisation that existed
 * before this migration still have the requirement afterwards".
 *
 * Direct endpoint. Builds the schema as it stood before the migration, applies,
 * checks, applies again.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

const MIGRATION = "013-precon-requirement.sql";

function testUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set — refusing to guess a target.");
  const u = new URL(raw);
  u.host = u.host.replace("-pooler", "");
  if (u.host.includes("damp-mouse")) throw new Error("Refusing: that is a live tenant.");
  return u.toString();
}

function withSchema(url: string, schema: string): string {
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  return u.toString();
}

function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

/** Split on statement-ending semicolons, leaving DO $$ blocks whole. */
function splitSql(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  for (const line of sql.split("\n")) {
    const bare = line.replace(/--.*$/, "");
    const dollars = (bare.match(/\$\$/g) ?? []).length;
    buf += line + "\n";
    if (dollars % 2 === 1) inDollar = !inDollar;
    if (!inDollar && bare.trim().endsWith(";")) {
      const stmt = buf.trim();
      if (stmt && !/^(BEGIN|COMMIT);?$/i.test(stmt)) out.push(stmt);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const COLUMNS = ["preConRequired", "preConWaivedBy", "preConWaivedAt", "preConWaiverReason"];

async function main() {
  const base = testUrl();
  const schema = `vq_r013_${Date.now().toString(36)}`;
  const sql = readFileSync(resolve("prisma/pending", MIGRATION), "utf8");

  console.log(`\nRehearsing ${MIGRATION}`);
  console.log(`  host   ${new URL(base).host}`);
  console.log(`  schema ${schema}  (created and dropped by this script)`);

  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  const tmp = mkdtempSync(join(tmpdir(), "vq-r013-"));

  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

    // The schema as it stood before this migration: the parent of the commit
    // that added the .sql, or HEAD while it is still uncommitted.
    const addedIn = execFileSync(
      "git",
      ["log", "--diff-filter=A", "--format=%H", "-1", "--", `prisma/pending/${MIGRATION}`],
      { encoding: "utf8" },
    ).trim();
    const baseline = addedIn ? `${addedIn}^` : "HEAD";
    console.log(`  baseline ${baseline === "HEAD" ? "HEAD (not yet committed)" : baseline.slice(0, 8)}\n`);

    const headSchema = execFileSync("git", ["show", `${baseline}:prisma/schema.prisma`], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const schemaFile = join(tmp, "before.prisma");
    writeFileSync(
      schemaFile,
      headSchema.replace(
        /datasource\s+db\s*\{[\s\S]*?\}/,
        `datasource db {\n  provider = "postgresql"\n  url      = env("VQ_R013_URL")\n}`,
      ),
    );

    execFileSync(
      "npx",
      ["prisma", "db", "push", "--schema", schemaFile, "--skip-generate", "--accept-data-loss"],
      {
        env: { ...process.env, VQ_R013_URL: withSchema(base, schema) },
        stdio: "pipe",
        shell: process.platform === "win32",
      },
    );
    ok("the schema before the change builds", true);

    const db = new PrismaClient({ datasources: { db: { url: withSchema(base, schema) } } });

    try {
      await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);

      /**
       * An organisation that already exists, inserted BEFORE the migration.
       *
       * This is the whole point. A tenant created after the change gets the
       * column default for free; a tenant that was already there is the one
       * that could have come out the other side with its safety rule off.
       */
      await db.$executeRawUnsafe(
        `INSERT INTO "OrgSettings"
           ("id","legalName","shortName","customerTerms","subTerms","retainagePct",
            "locateProvider","defaultState","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
         ON CONFLICT ("id") DO NOTHING`,
        "singleton",
        "Rehearsal Co",
        "Rehearsal",
        "Net 30",
        "Net 21",
        0,
        "GA811",
        "GA",
      );
      ok("an organisation exists before the migration runs", true);

      const before = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'OrgSettings'`,
        schema,
      );

      // ── apply ───────────────────────────────────────────────────────────
      await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
      for (const stmt of splitSql(sql)) await db.$executeRawUnsafe(stmt);
      ok("013 applies", true);

      // ── structure ───────────────────────────────────────────────────────
      for (const col of COLUMNS) {
        const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*)::bigint AS n FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = 'OrgSettings' AND column_name = $2`,
          schema,
          col,
        );
        ok(`OrgSettings.${col}`, Number(rows[0].n) === 1);
      }

      const after = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'OrgSettings'`,
        schema,
      );
      ok(
        "exactly four columns added",
        Number(after[0].n) - Number(before[0].n) === 4,
        `${before[0].n} -> ${after[0].n}`,
      );

      const def = await db.$queryRawUnsafe<{ column_default: string | null; is_nullable: string }[]>(
        `SELECT column_default, is_nullable FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'OrgSettings' AND column_name = 'preConRequired'`,
        schema,
      );
      ok("defaults to true, not false", String(def[0]?.column_default).includes("true"), String(def[0]?.column_default));
      ok("is NOT NULL", def[0]?.is_nullable === "NO");

      // ── the one that matters ────────────────────────────────────────────
      const row = await db.$queryRawUnsafe<{ preConRequired: boolean }[]>(
        `SELECT "preConRequired" FROM "OrgSettings" WHERE "id" = $1`,
        "singleton",
      );
      ok(
        "an organisation that existed before KEEPS the requirement",
        row[0]?.preConRequired === true,
        String(row[0]?.preConRequired),
      );

      // Nothing about a project's own documentation may have moved.
      const projects = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'Project' AND column_name = 'preConStatus'`,
        schema,
      );
      ok("Project.preConStatus is untouched and still there", Number(projects[0].n) === 1);

      // ── apply a second time ─────────────────────────────────────────────
      await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
      let twice = true;
      try {
        for (const stmt of splitSql(sql)) await db.$executeRawUnsafe(stmt);
      } catch (e) {
        twice = false;
        console.log(`        ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
      ok("013 is re-runnable", twice);

      const afterTwice = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'OrgSettings'`,
        schema,
      );
      ok("a second run adds nothing", Number(afterTwice[0].n) === Number(after[0].n));

      const stillOn = await db.$queryRawUnsafe<{ preConRequired: boolean }[]>(
        `SELECT "preConRequired" FROM "OrgSettings" WHERE "id" = $1`,
        "singleton",
      );
      ok("and does not reset the requirement", stillOn[0]?.preConRequired === true);
    } finally {
      await db.$disconnect();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    console.log("\n  scratch schema dropped");
    await admin.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nRehearsal failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
