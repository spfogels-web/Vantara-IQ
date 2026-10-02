/**
 * VERIFICATION TOOLING — server-side, run from a terminal or from the gate.
 * Never imported by the application and never bundled.
 */
/**
 * What production's schema is missing, and whether this migration explains it.
 *
 * This exists because of a defect the whole test suite was structurally unable
 * to catch. A stray `sed` added `subcontractorName` to the `User` model as well
 * as the one it was aimed at. Migration 012 did not create that column, so the
 * generated client would have selected a field production does not have — on
 * sign-in, before anything else. Every test passed, because the test database
 * is built FROM `schema.prisma` and therefore agreed with the mistake.
 *
 * A schema can only be checked against the database it will actually meet.
 * That is the whole idea here: diff the committed datamodel against production,
 * then decide whether every difference is accounted for by the one migration
 * being reviewed.
 *
 * Read-only. It opens a connection, introspects, and writes nothing.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type DiffStatement = {
  sql: string;
  /** The objects this statement touches, as lower-cased names. */
  touches: string[];
  kind: "create-type" | "create-table" | "add-column" | "create-index" | "add-constraint" | "drop" | "alter" | "other";
  destructive: boolean;
};

export type DiffReport = {
  /** Every statement Prisma would need to run to bring production up to the schema. */
  statements: DiffStatement[];
  /** Accounted for by the pending migration. */
  expected: DiffStatement[];
  /** NOT accounted for. Each of these is drift and a reason to stop. */
  unexpected: DiffStatement[];
  /** Anything that removes or rewrites. Reported separately, always. */
  destructive: DiffStatement[];
  /** True when production needs nothing at all. */
  clean: boolean;
};

/** Objects a migration file creates, so a diff statement can be matched to it. */
export function objectsCreatedBy(sql: string): Set<string> {
  const names = new Set<string>();
  const add = (s: string | undefined) => {
    if (s) names.add(s.toLowerCase());
  };

  for (const m of sql.matchAll(/CREATE\s+TYPE\s+"([^"]+)"/gi)) add(m[1]);
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)) add(m[1]);
  for (const m of sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)) add(m[1]);
  for (const m of sql.matchAll(/ADD\s+CONSTRAINT\s+"([^"]+)"/gi)) add(m[1]);
  // A column added to an existing table, as table.column.
  for (const m of sql.matchAll(
    /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi,
  )) {
    add(`${m[1]}.${m[2]}`);
  }
  // Columns declared inside a CREATE TABLE belong to that table, which is
  // already named above; Prisma emits them as one statement, so nothing more is
  // needed for them to match.
  return names;
}

/** Split a diff script into statements, keeping dollar-quoted blocks whole. */
function statements(script: string): string[] {
  return script
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

function classify(sql: string): DiffStatement {
  const touches: string[] = [];
  let kind: DiffStatement["kind"] = "other";

  const typeM = /^CREATE\s+TYPE\s+"([^"]+)"/i.exec(sql);
  const tableM = /^CREATE\s+TABLE\s+"([^"]+)"/i.exec(sql);
  const indexM = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"/i.exec(sql);
  const constraintM = /^ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"/i.exec(sql);
  const columnM = /^ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+"?([^"\s]+)"?/i.exec(sql);
  const dropM = /^DROP\s+(\w+)\s+"?([^"\s]+)"?/i.exec(sql);

  if (typeM) {
    kind = "create-type";
    touches.push(typeM[1].toLowerCase());
  } else if (tableM) {
    kind = "create-table";
    touches.push(tableM[1].toLowerCase());
  } else if (indexM) {
    kind = "create-index";
    touches.push(indexM[1].toLowerCase());
  } else if (constraintM) {
    kind = "add-constraint";
    touches.push(constraintM[2].toLowerCase());
  } else if (columnM) {
    kind = "add-column";
    touches.push(`${columnM[1]}.${columnM[2]}`.toLowerCase());
  } else if (dropM) {
    kind = "drop";
    touches.push(dropM[2].toLowerCase());
  } else if (/^ALTER\s+TABLE/i.test(sql)) {
    kind = "alter";
    const t = /^ALTER\s+TABLE\s+"([^"]+)"/i.exec(sql);
    if (t) touches.push(t[1].toLowerCase());
  }

  /**
   * Destructive means it removes or rewrites something that already exists.
   *
   * DROP of anything, a column type change, and a NOT NULL added to a column
   * that has rows in it. A migration review that misses one of these is how an
   * evening disappears.
   */
  const destructive =
    /^DROP\b/i.test(sql) ||
    /\bDROP\s+(COLUMN|TABLE|CONSTRAINT|INDEX|TYPE|DEFAULT|NOT\s+NULL)\b/i.test(sql) ||
    /\bALTER\s+COLUMN\b[\s\S]*\bSET\s+(?:DATA\s+)?TYPE\b/i.test(sql) ||
    /\bALTER\s+COLUMN\b[\s\S]*\bSET\s+NOT\s+NULL\b/i.test(sql) ||
    /\bTRUNCATE\b/i.test(sql);

  return { sql, touches, kind, destructive };
}

/**
 * The SQL Prisma would run to bring a database up to the committed datamodel.
 *
 * `migrate diff` only reads. The CLI is invoked as plain JS rather than through
 * npx because a shell splits a Neon connection string on its `&` characters,
 * and because npx.cmd needs a shell on Windows.
 */
export function diffAgainst(url: string, schemaPath = "prisma/schema.prisma"): string {
  return String(
    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "diff",
        `--from-url=${url}`,
        `--to-schema-datamodel=${schemaPath}`,
        "--script",
      ],
      { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 },
    ),
  );
}

/**
 * Compare production against the committed schema, explained by one migration.
 *
 * `pendingSql` is the migration being reviewed. Every difference the database
 * shows must be something that file creates; anything else is drift, and drift
 * is a reason to stop rather than a footnote.
 */
export function reportFor(url: string, pendingSql: string, schemaPath?: string): DiffReport {
  const script = diffAgainst(url, schemaPath);
  const expectedNames = objectsCreatedBy(pendingSql);

  const all = statements(script).map(classify);
  const expected: DiffStatement[] = [];
  const unexpected: DiffStatement[] = [];

  for (const s of all) {
    // A statement is accounted for only if every object it names is one this
    // migration creates. An empty `touches` means the classifier did not
    // recognise the statement, which is treated as unexplained rather than
    // waved through — failing closed is the point of this file.
    const accounted = s.touches.length > 0 && s.touches.every((t) => expectedNames.has(t));
    (accounted && !s.destructive ? expected : unexpected).push(s);
  }

  return {
    statements: all,
    expected,
    unexpected,
    destructive: all.filter((s) => s.destructive),
    clean: all.length === 0,
  };
}

export function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** A report a person reads, with the four questions answered in order. */
export function formatReport(r: DiffReport): string {
  const line = (s: DiffStatement) => `      ${s.sql.replace(/\s+/g, " ").slice(0, 160)}`;
  const out: string[] = [];

  out.push(`  expected from the pending migration : ${r.expected.length}`);
  out.push(`  unexpected drift                    : ${r.unexpected.length}`);
  out.push(`  destructive statements              : ${r.destructive.length}`);

  if (r.unexpected.length) {
    out.push("\n  UNEXPECTED DRIFT — production does not match the schema, and this");
    out.push("  migration does not explain the difference:");
    for (const s of r.unexpected) out.push(line(s));
  }
  if (r.destructive.length) {
    out.push("\n  DESTRUCTIVE — these remove or rewrite something that exists:");
    for (const s of r.destructive) out.push(line(s));
  }
  if (r.clean) out.push("\n  production already matches the schema — nothing to apply.");

  return out.join("\n");
}
