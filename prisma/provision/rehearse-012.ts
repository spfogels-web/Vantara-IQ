/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled.
 */
/**
 * Rehearse 012 against the disposable test branch.
 *
 *   npx tsx prisma/provision/rehearse-012.ts
 *
 * The sibling tool, rehearse-migration.ts, targets the demonstration tenant
 * through VQ_PROVISION_URL / APEX_DATABASE_URL_UNPOOLED. That credential does
 * not currently authenticate, which is an environment problem and not a reason
 * to apply an unrehearsed migration. This does the same work against
 * TEST_DATABASE_URL, which is the throwaway branch the isolation suite already
 * builds and drops schemas in.
 *
 * What it proves, in order:
 *
 *   1. The schema BEFORE the change builds. Taken from git HEAD, so the
 *      migration meets the shape it will actually meet in production rather
 *      than the shape the working tree has already moved to.
 *   2. 012 applies to it.
 *   3. The structure that came out is the structure that was asked for —
 *      tables, columns, enums, indexes and foreign keys, checked by name.
 *   4. It applies a SECOND time without error. A migration that cannot be
 *      re-run cannot be resumed after it fails halfway.
 *   5. The counter and the unique index behave: two incidents cannot share a
 *      number within an organisation, and two organisations can both hold
 *      INC-1000.
 *
 * Connects on the DIRECT endpoint. A pooled Neon session can hand back a
 * connection carrying an earlier session's search_path, which is what made an
 * earlier rehearsal pass by luck.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

const MIGRATION = "012-incidents.sql";

/** The throwaway branch, on its direct endpoint, or nothing. */
function testUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set — refusing to guess a target.");
  const u = new URL(raw);
  // Pooled sessions do not reliably honour ?schema=, which is the whole reason
  // the 010 rehearsal passed and taught nobody anything.
  u.host = u.host.replace("-pooler", "");
  for (const mark of ["damp-mouse"]) {
    if (u.host.includes(mark)) throw new Error(`Refusing: ${u.host.split(".")[0]} is a live tenant.`);
  }
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

async function main() {
  const base = testUrl();
  const schema = `vq_r012_${Date.now().toString(36)}`;
  const sql = readFileSync(resolve("prisma/pending", MIGRATION), "utf8");

  console.log(`\nRehearsing ${MIGRATION}`);
  console.log(`  host   ${new URL(base).host}`);
  console.log(`  schema ${schema}  (created and dropped by this script)\n`);

  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  const tmp = mkdtempSync(join(tmpdir(), "vq-r012-"));

  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

    // ── 1. the schema as it is BEFORE this change ──────────────────────────
    //
    // From git HEAD, not the working tree: the working tree already has the
    // Incident models in it, and pushing those would create the very tables the
    // migration is supposed to create.
    const headSchema = execFileSync("git", ["show", "HEAD:prisma/schema.prisma"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const schemaFile = join(tmp, "before.prisma");
    writeFileSync(
      schemaFile,
      headSchema.replace(
        /datasource\s+db\s*\{[\s\S]*?\}/,
        `datasource db {\n  provider = "postgresql"\n  url      = env("VQ_R012_URL")\n}`,
      ),
    );

    execFileSync("npx", ["prisma", "db", "push", "--schema", schemaFile, "--skip-generate", "--accept-data-loss"], {
      env: { ...process.env, VQ_R012_URL: withSchema(base, schema) },
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    ok("the schema before the change builds", true);

    const db = new PrismaClient({ datasources: { db: { url: withSchema(base, schema) } } });

    try {
      await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);

      const before = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema = $1`,
        schema,
      );

      // ── 2. apply ────────────────────────────────────────────────────────
      await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
      for (const stmt of splitSql(sql)) await db.$executeRawUnsafe(stmt);
      ok("012 applies", true);

      // ── 3. the structure that came out ──────────────────────────────────
      const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
        schema,
      );
      const names = new Set(tables.map((t) => t.table_name));
      for (const t of ["Incident", "IncidentEvent", "IncidentNotification", "Counter"]) {
        ok(`table ${t}`, names.has(t));
      }

      const after = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema = $1`,
        schema,
      );
      ok(
        "exactly four tables added",
        Number(after[0].n) - Number(before[0].n) === 4,
        `${before[0].n} -> ${after[0].n}`,
      );

      for (const [table, column] of [
        ["ProjectPhoto", "incidentId"],
        ["Conversation", "incidentId"],
        ["Incident", "subcontractorName"],
        ["Incident", "occurredAt"],
        ["Incident", "injury"],
        ["Incident", "locateNumberSnapshot"],
      ] as const) {
        const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*)::bigint AS n FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
          schema,
          table,
          column,
        );
        ok(`${table}.${column}`, Number(rows[0].n) === 1);
      }

      // ProjectPhoto.projectId must still be NOT NULL — incident evidence stays
      // project evidence, which is the whole architecture of this change.
      const photoProject = await db.$queryRawUnsafe<{ is_nullable: string }[]>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'ProjectPhoto' AND column_name = 'projectId'`,
        schema,
      );
      ok("ProjectPhoto.projectId is still NOT NULL", photoProject[0]?.is_nullable === "NO");

      for (const e of [
        "IncidentType",
        "IncidentSeverity",
        "IncidentStatus",
        "IncidentEventType",
        "NotifiedParty",
        "NotificationMethod",
      ]) {
        const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*)::bigint AS n FROM pg_type t
             JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = $1 AND n.nspname = $2`,
          e,
          schema,
        );
        ok(`enum ${e}`, Number(rows[0].n) === 1);
      }

      for (const idx of [
        "Incident_organizationId_number_key",
        "Incident_organizationId_seq_key",
        "Incident_projectId_occurredAt_idx",
        "IncidentEvent_incidentId_at_idx",
        "ProjectPhoto_incidentId_idx",
      ]) {
        const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*)::bigint AS n FROM pg_indexes WHERE schemaname = $1 AND indexname = $2`,
          schema,
          idx,
        );
        ok(`index ${idx}`, Number(rows[0].n) === 1);
      }

      for (const [name, action] of [
        ["Incident_projectId_fkey", "r"], // RESTRICT
        ["Incident_locateTicketId_fkey", "n"], // SET NULL
        ["IncidentEvent_incidentId_fkey", "c"], // CASCADE
        ["ProjectPhoto_incidentId_fkey", "n"], // SET NULL
      ] as const) {
        const rows = await db.$queryRawUnsafe<{ confdeltype: string }[]>(
          `SELECT c.confdeltype FROM pg_constraint c
             JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = $1 AND n.nspname = $2`,
          name,
          schema,
        );
        ok(`fk ${name} on delete ${action}`, rows[0]?.confdeltype === action, rows[0]?.confdeltype ?? "missing");
      }

      // ── 4. apply a second time ──────────────────────────────────────────
      await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
      let twice = true;
      try {
        for (const stmt of splitSql(sql)) await db.$executeRawUnsafe(stmt);
      } catch (e) {
        twice = false;
        console.log(`        ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
      ok("012 is re-runnable", twice);

      const afterTwice = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema = $1`,
        schema,
      );
      ok("a second run adds nothing", Number(afterTwice[0].n) === Number(after[0].n));

      // ── 5. the behaviour the structure is for ───────────────────────────
      await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);

      // Two organisations may both hold INC-1000. This is the correction that
      // a global unique on `number` would have made impossible.
      await db.$executeRawUnsafe(
        `INSERT INTO "Project" ("id","name","client","location","status","tone","crew","number","updatedAt")
         VALUES ('r012-proj','Rehearsal','Client','Somewhere','Active','neutral','','P-1','')`,
      );
      for (const org of ["fortitude", "apex"]) {
        await db.$executeRawUnsafe(
          `INSERT INTO "Incident"
             ("id","organizationId","number","seq","projectId","type","occurredAt","summary","updatedAt")
           VALUES ($1,$2,'INC-1000',1000,'r012-proj','UTILITY_STRIKE',CURRENT_TIMESTAMP,'rehearsal',CURRENT_TIMESTAMP)`,
          `r012-${org}`,
          org,
        );
      }
      ok("two organisations can both hold INC-1000", true);

      // The same organisation cannot.
      let collided = false;
      try {
        await db.$executeRawUnsafe(
          `INSERT INTO "Incident"
             ("id","organizationId","number","seq","projectId","type","occurredAt","summary","updatedAt")
           VALUES ('r012-dup','fortitude','INC-1000',1001,'r012-proj','SAFETY',CURRENT_TIMESTAMP,'dup',CURRENT_TIMESTAMP)`,
        );
      } catch {
        collided = true;
      }
      ok("one organisation cannot reuse a number", collided);

      // The counter increments under its own lock.
      await db.$executeRawUnsafe(
        `INSERT INTO "Counter" ("organizationId","name","value") VALUES ('fortitude','incident',999)
         ON CONFLICT ("organizationId","name") DO NOTHING`,
      );
      const bumped = await db.$queryRawUnsafe<{ value: number }[]>(
        `UPDATE "Counter" SET "value" = "value" + 1
          WHERE "organizationId" = 'fortitude' AND "name" = 'incident' RETURNING "value"`,
      );
      ok("the counter hands out 1000 first", bumped[0]?.value === 1000, String(bumped[0]?.value));

      // A project with an incident cannot be deleted out from under it.
      let restricted = false;
      try {
        await db.$executeRawUnsafe(`DELETE FROM "Project" WHERE "id" = 'r012-proj'`);
      } catch {
        restricted = true;
      }
      ok("a project with incidents cannot be deleted", restricted);
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

/**
 * Split on semicolons that end a statement, leaving DO $$ ... $$ blocks whole.
 *
 * The guards in this migration are dollar-quoted blocks full of semicolons; a
 * naive split cuts them in half and every one of them fails.
 */
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
      // BEGIN/COMMIT are stripped: Prisma runs each statement on its own
      // connection, and an explicit transaction here would not wrap them.
      if (stmt && !/^(BEGIN|COMMIT);?$/i.test(stmt)) out.push(stmt);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

main().catch((e) => {
  console.error("\nRehearsal failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
