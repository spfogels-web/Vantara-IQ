/**
 * Apply one reviewed migration file to Fortitude production.
 *
 * Everything about this is deliberately narrow. It takes one file, by name,
 * from the reviewed set; it refuses any other file. It resolves the target
 * from DATABASE_URL_UNPOOLED and refuses unless that endpoint is positively
 * identified as Fortitude's, because "not on a blocklist" is not the same
 * claim as "this is the database I was told to write to".
 *
 * The direct endpoint, never the pooled one: a pooler can hand back a server
 * connection carrying an earlier session's search_path, and on this database
 * that was measured leaving current_schema() as NULL. The migrations are
 * schema-qualified so it would not matter, but a migration should not depend
 * on being immune to the connection it arrives on.
 *
 * It uses `prisma db execute`. It cannot db push and cannot pass
 * --accept-data-loss; neither string appears here.
 *
 * Prints no credential.
 *
 *   npx tsx prisma/release/apply-production.ts 004
 */
// Loaded explicitly. The other scripts here get .env for free by importing
// PrismaClient; this one does not touch Prisma's client, so without this the
// target resolves to undefined and the run aborts for the wrong reason.
import "dotenv/config";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { formatReport, reportFor, sha256Of } from "./production-diff";

const FORTITUDE_MARK = "damp-mouse";

/**
 * The only files this is allowed to run, and the exact bytes of each.
 *
 * The hash is not ceremony. A reviewed migration is reviewed as a specific
 * sequence of statements; a file that has been edited since — by a rebase, a
 * merge, a well-meant tidy — is a different migration wearing a reviewed name.
 * Nothing else here would notice.
 */
export const REVIEWED: Record<string, { file: string; sha256: string }> = {
  "003": {
    file: "prisma/pending/003-project-evidence.sql",
    sha256: "5dda598099517453ae1895175e0aeadab1c36c67ac2798a361b32361e359ae10",
  },
  "004": {
    file: "prisma/pending/004-fortitude-configuration.sql",
    sha256: "b7131bd24c3ce6e59c613265e30a7a6d4c368fc4911dc6e14be51f4bea489d86",
  },
  "013": {
    file: "prisma/pending/013-precon-requirement.sql",
    sha256: "4328b1527a35aca697a49abc833ea55eabae7e0e29c3cd893bcbd7ca31473b56",
  },
  "012": {
    file: "prisma/pending/012-incidents.sql",
    sha256: "762ab58196f1130bb0d24a6f6bdb13e31e7d04a871982704e9e2060f6731fcd2",
  },
};

/**
 * Reviewed but not yet applied to production, newest last.
 *
 * Maintained by hand because the alternative is asking the database what it has
 * and trusting the answer, and a migration that is half-applied answers
 * "present" to every question anybody thinks to ask. A list somebody edits when
 * they apply one is duller and harder to fool.
 *
 * EMPTY means production is level with the committed schema, and the gate
 * asserts exactly that — so leaving a key in here after applying it fails the
 * build, and so does adding a migration to `REVIEWED` without listing it here.
 * 012 and 013 were applied on 2 October 2026 and removed.
 */
export const PENDING: readonly string[] = [];

function main() {
  const key = process.argv[2];
  const entry = REVIEWED[key ?? ""];
  if (!entry) {
    throw new Error(`Name a reviewed migration: ${Object.keys(REVIEWED).join(", ")}`);
  }
  const file = entry.file;

  // The bytes, before the target is even resolved.
  if (entry.sha256) {
    const actual = sha256Of(file);
    if (actual !== entry.sha256) {
      throw new Error(
        `${file} is not the file that was reviewed.\n` +
          `  reviewed  ${entry.sha256}\n` +
          `  on disk   ${actual}\n` +
          `Re-review it, then update the hash here. Refusing.`,
      );
    }
  }

  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set. Refusing to guess a target.");

  const host = new URL(url).host;
  const endpoint = host.split(".")[0];

  // Positive identification, then the negatives.
  if (!host.includes(FORTITUDE_MARK)) {
    throw new Error(`Expected Fortitude production (${FORTITUDE_MARK}); got ${endpoint}. Refusing.`);
  }
  if (host.includes("aged-dew")) throw new Error("That is Apex. Refusing.");
  if (endpoint.endsWith("-pooler")) {
    throw new Error("That is the pooled endpoint. Migrations run on the direct one. Refusing.");
  }

  console.log(`applying ${file}`);
  console.log(`  target   ${endpoint} (Fortitude production, direct endpoint)`);
  if (entry.sha256) console.log(`  sha256   ${entry.sha256.slice(0, 16)}… verified`);

  /**
   * What production actually looks like, before anything is written to it.
   *
   * The reason this is here rather than in a checklist: a stray edit once put
   * `subcontractorName` on the `User` model as well as the one it was aimed at,
   * and no migration created it. Every test passed — the test database is built
   * from `schema.prisma`, so it agreed with the mistake. The first sign would
   * have been sign-in failing in production.
   *
   * So the schema is compared against the database it is about to meet, and the
   * only differences allowed are the ones this migration creates. Anything else
   * is drift, and this refuses rather than reporting it and carrying on.
   */
  console.log("\n  checking production against the committed schema…");

  /**
   * Explained by the whole pending set, not by this file alone.
   *
   * The committed schema is ahead of production by the sum of what has not been
   * applied yet. Checking against only the file in hand would call every other
   * pending migration "drift" and refuse — so applying the first of two would
   * be impossible, and the obvious workaround would be to stop checking.
   *
   * The file being applied still has to be one of them, which `REVIEWED` and
   * the hash above already settle.
   */
  const pendingSql = PENDING.map((k) => readFileSync(REVIEWED[k].file, "utf8")).join("\n");
  const report = reportFor(url, pendingSql);
  console.log(formatReport(report));

  if (report.unexpected.length > 0) {
    throw new Error(
      `Production differs from the schema in ${report.unexpected.length} way(s) this migration does not explain.\n` +
        `Resolve the drift before applying. Refusing.`,
    );
  }
  if (report.destructive.length > 0) {
    throw new Error(
      `${report.destructive.length} destructive statement(s) would be needed to reconcile production.\n` +
        `Nothing in a reviewed migration should remove or rewrite. Refusing.`,
    );
  }
  if (report.expected.length === 0) {
    throw new Error("Production already matches the schema. There is nothing for this to do. Refusing.");
  }
  console.log("");

  // Prisma CLI as plain JS: npx.cmd needs a shell on Windows and a shell
  // splits the connection string on its & characters.
  const out = execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "db", "execute", "--url", url, "--file", file],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const text = String(out).trim();
  if (text) console.log(text);
  console.log("  applied.");
}

/**
 * Only when this file is the thing being run.
 *
 * The reviewed set is exported so the gate can assert against it, and importing
 * a module runs its top level — without this, a test that merely reads the
 * allowlist would attempt a production migration.
 */
const invokedDirectly = (() => {
  const entry = process.argv[1] ?? "";
  return /apply-production\.[tj]s$/.test(entry);
})();

try {
  if (invokedDirectly) main();
} catch (e) {
  const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
  const detail = String(err.stderr ?? err.stdout ?? err.message ?? e).trim();
  console.error(`\nAPPLY ABORTED:\n${detail.split("\n").slice(0, 10).join("\n")}`);
  process.exit(1);
}
