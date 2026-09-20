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

const FORTITUDE_MARK = "damp-mouse";

/** The only files this is allowed to run. */
const REVIEWED: Record<string, string> = {
  "003": "prisma/pending/003-project-evidence.sql",
  "004": "prisma/pending/004-fortitude-configuration.sql",
};

function main() {
  const key = process.argv[2];
  const file = REVIEWED[key ?? ""];
  if (!file) {
    throw new Error(`Name a reviewed migration: ${Object.keys(REVIEWED).join(", ")}`);
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

try {
  main();
} catch (e) {
  const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
  const detail = String(err.stderr ?? err.stdout ?? err.message ?? e).trim();
  console.error(`\nAPPLY ABORTED:\n${detail.split("\n").slice(0, 10).join("\n")}`);
  process.exit(1);
}
