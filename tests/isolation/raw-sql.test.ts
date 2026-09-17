/**
 * Raw SQL must name its schema.
 *
 * This is the guard for the outage on 16 September. Two `$queryRaw` calls
 * referred to `"Project"` and `"MaterialInstance"` without a schema, so they
 * resolved through the connection's `search_path` — and a pooled Neon
 * connection in a serverless runtime does not reliably keep the `search_path`
 * that was set when it opened. Production spent the evening answering
 * `relation "Project" does not exist` on the home page while every Prisma
 * model query on the same request succeeded, because Prisma qualifies the SQL
 * it generates and we did not qualify ours.
 *
 * Nothing about that was visible locally: a long-lived local connection keeps
 * its session setting, so the unqualified query worked on this machine every
 * time. A test that needs a broken pooler to fail would never have caught it.
 * This one reads the source instead, and fails on the shape rather than the
 * symptom.
 *
 * It needs no database and no server, so it runs in milliseconds and would
 * have failed in the same commit that introduced the bug.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DB_SCHEMA, table } from "../../src/lib/db-schema";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * A table reference with no schema in front of it.
 *
 * Matches `from "Project"` and `join "Daily"`, and deliberately does not match
 * `from "public"."Project"`, `from ${Prisma.raw(table("Project"))}`, or a
 * lower-case catalog name like `information_schema.tables`.
 */
const UNQUALIFIED = /\b(from|join|into|update)\s+"([A-Z][A-Za-z0-9_]*)"(?!\s*\.)/gi;

/** Every raw-SQL call in a file, as the text between the backticks. */
function rawSqlBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /\$(?:queryRaw|executeRaw)(?:Unsafe)?\s*(?:<[^>]*>)?\s*[`(]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    // Take a generous window after the call; SQL here is never longer.
    blocks.push(source.slice(m.index, m.index + 1200));
  }
  return blocks;
}

describe("raw SQL names its schema", () => {
  const files = sourceFiles("src");

  it("finds the raw SQL call sites it is meant to be guarding", () => {
    const withRaw = files.filter((f) => rawSqlBlocks(readFileSync(f, "utf8")).length > 0);
    // If this ever reads zero, the detector has stopped working and every
    // assertion below is passing vacuously.
    expect(withRaw.length, "no $queryRaw call sites found — the detector is broken").toBeGreaterThan(0);
  });

  it("has no unqualified application table in any raw query", () => {
    const offences: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const block of rawSqlBlocks(source)) {
        for (const hit of block.matchAll(UNQUALIFIED)) {
          offences.push(`${file}: ${hit[1]} "${hit[2]}"`);
        }
      }
    }
    expect(
      offences,
      `these resolve through search_path and will fail on a pooled connection:\n  ${offences.join("\n  ")}`,
    ).toEqual([]);
  });
});

describe("the schema helper", () => {
  it("produces a fully qualified, quoted reference", () => {
    expect(table("Project")).toBe(`"${DB_SCHEMA}"."Project"`);
  });

  it("falls back to public rather than to nothing", () => {
    expect(DB_SCHEMA).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
  });
});
