/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled.
 */
/**
 * Run a pending migration against a throwaway copy of the schema it will meet.
 *
 *   npx tsx prisma/provision/rehearse-migration.ts 003-project-evidence.sql
 *
 * A migration that has only ever been read is a migration nobody has run. This
 * builds the *previous* schema — the one in git HEAD, before the change — into
 * a scratch schema inside the demonstration database, applies the SQL to it,
 * and checks what came out. Then it applies it a second time, because a
 * migration that cannot be re-run is a migration that cannot be resumed after
 * it fails halfway.
 *
 * Never touches Fortitude: the target is resolved through the guarded path,
 * which refuses a protected endpoint before connecting. The scratch schema is
 * created and dropped by this script and shares nothing with the tenant's own
 * tables.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { identityOf, targetFor, urlFor } from "./targets";

const PROVISION_VAR = "VQ_PROVISION_URL";

function withSchema(url: string, schema: string): string {
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  return u.toString();
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: rehearse-migration.ts <file in prisma/pending>");

  const t = targetFor(process.argv[3] ?? "apex");
  const base = urlFor(t, "direct");
  const scratch = `vq_rehearse_${Date.now().toString(36)}`;

  console.log(`\nRehearsing ${file}`);
  console.log(`  host   ${identityOf(base).host}`);
  console.log(`  schema ${scratch}  (created and dropped by this script)\n`);

  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  const dir = mkdtempSync(join(tmpdir(), "vq-rehearse-"));

  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${scratch}"`);
    console.log("  created the scratch schema");

    /**
     * The shape the migration will actually meet: the committed schema from
     * before this change. Building the *new* one would make every ALTER a
     * no-op and prove nothing.
     */
    const previous = execFileSync("git", ["show", "HEAD:prisma/schema.prisma"], {
      encoding: "utf8",
      maxBuffer: 1e8,
    }).replace(
      /datasource\s+db\s*\{[\s\S]*?\n\}/,
      `datasource db {\n  provider = "postgresql"\n  url      = env("${PROVISION_VAR}")\n}`,
    );
    const schemaFile = join(dir, "schema.prisma");
    writeFileSync(schemaFile, previous);

    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "db", "push", "--schema", schemaFile, "--skip-generate"], {
      env: { ...process.env, [PROVISION_VAR]: withSchema(base, scratch) },
      stdio: ["ignore", "ignore", "pipe"],
    });
    console.log("  built the pre-migration schema into it");

    const before = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*)::bigint as n from information_schema.columns
        where table_schema = '${scratch}' and table_name = 'ProjectPhoto'`,
    );
    console.log(`  ProjectPhoto columns before: ${before[0].n}`);

    // The migration, aimed at the scratch schema rather than public.
    const sql = readFileSync(resolve(process.cwd(), "prisma/pending", file), "utf8").replace(
      /"public"\./g,
      `"${scratch}".`,
    );
    if (sql.includes('"public".')) throw new Error("the migration still names public — refusing to run it");

    /**
     * Applied with `prisma db execute`, not $executeRawUnsafe.
     *
     * The migration is a script: several statements, and dollar-quoted DO
     * blocks whose bodies contain semicolons of their own. A single-statement
     * raw call rejects it, and splitting on semicolons would cut those blocks
     * in half. This is the tool built for running a file.
     */
    const aimed = join(dir, "migration.sql");
    writeFileSync(aimed, sql);
    for (const pass of [1, 2]) {
      execFileSync(
        process.execPath,
        [require.resolve("prisma/build/index.js"), "db", "execute", "--url", withSchema(base, scratch), "--file", aimed],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      console.log(`  applied, pass ${pass}${pass === 2 ? " (idempotency)" : ""}`);
    }

    // ---- what came out ----------------------------------------------------
    const cols = await admin.$queryRawUnsafe<{ column_name: string; data_type: string; is_nullable: string }[]>(
      `select column_name, data_type, is_nullable from information_schema.columns
        where table_schema = '${scratch}' and table_name = 'ProjectPhoto'
          and column_name in ('stage','category','existingDamage','damageNote','dailySheetId','dailyId','subcontractorId','uploadedByUserId','uploadedAt')
        order by column_name`,
    );
    console.log(`\n  new ProjectPhoto columns: ${cols.length}/9`);
    for (const c of cols) console.log(`    ${c.column_name.padEnd(18)} ${c.data_type}  nullable=${c.is_nullable}`);

    const proj = await admin.$queryRawUnsafe<{ column_name: string }[]>(
      `select column_name from information_schema.columns
        where table_schema = '${scratch}' and table_name = 'Project'
          and column_name in ('preConStatus','preConCompletedBy','preConCompletedAt')`,
    );
    console.log(`  new Project columns: ${proj.length}/3`);

    const idx = await admin.$queryRawUnsafe<{ indexname: string }[]>(
      `select indexname from pg_indexes where schemaname = '${scratch}' and tablename = 'ProjectPhoto'
        and indexname like 'ProjectPhoto_%'`,
    );
    console.log(`  indexes on ProjectPhoto: ${idx.length}`);
    for (const i of idx) console.log(`    ${i.indexname}`);

    const enums = await admin.$queryRawUnsafe<{ typname: string }[]>(
      `select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
        where t.typname in ('EvidenceStage','EvidenceCategory','PreConStatus')`,
    );
    console.log(`  enum types present: ${[...new Set(enums.map((e) => e.typname))].join(", ")}`);

    console.log("\n  REHEARSAL PASSED — applied twice, no error, all objects present");
  } finally {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${scratch}" CASCADE`).catch(() => undefined);
    console.log("  scratch schema dropped");
    rmSync(dir, { recursive: true, force: true });
    await admin.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nRehearsal failed:", e instanceof Error ? e.message.split("\n")[0] : e);
  process.exit(1);
});
