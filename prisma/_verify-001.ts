/**
 * Does the real, migrated data read correctly through the new code?
 *
 * The isolation suite builds its own schema and seeds its own fixtures, so a
 * green run proves the code is right — not that production's twenty-four
 * migrated rows are. This reads them back the way the application does, through
 * the relation `visibleProjectIds` resolves, and compares the result to the
 * snapshot taken before the migration.
 *
 *   npx tsx prisma/_verify-001.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! } },
});

type Snapshot = { pairs: { A: string; B: string }[] };

async function main() {
  const snap = JSON.parse(
    readFileSync(join("prisma", "pending", "001-snapshot.json"), "utf8"),
  ) as Snapshot;

  // What the snapshot says each crew is assigned to.
  const expected = new Map<string, Set<string>>();
  for (const p of snap.pairs) {
    if (!expected.has(p.B)) expected.set(p.B, new Set());
    expected.get(p.B)!.add(p.A);
  }

  // What the application now sees. This is the exact shape of the query in
  // src/lib/authz.ts — the one every project-scoped guard resolves through.
  const subs = await db.subcontractor.findMany({
    select: { id: true, company: true, projects: { select: { projectId: true } } },
    orderBy: { company: "asc" },
  });

  let mismatches = 0;
  let assignedCrews = 0;
  let totalPairs = 0;

  for (const s of subs) {
    const got = new Set(s.projects.map((p) => p.projectId));
    const want = expected.get(s.id) ?? new Set<string>();
    totalPairs += got.size;
    if (want.size > 0) assignedCrews++;

    const missing = [...want].filter((p) => !got.has(p));
    const extra = [...got].filter((p) => !want.has(p));
    const ok = missing.length === 0 && extra.length === 0;
    if (!ok) mismatches++;

    if (want.size || got.size) {
      console.log(
        `  ${ok ? "ok  " : "FAIL"} ${s.company.padEnd(28)} ${got.size} job${got.size === 1 ? " " : "s"}` +
          (ok ? "" : `   missing=[${missing.join(",")}] extra=[${extra.join(",")}]`),
      );
    }
  }

  // And the other direction: each project's crew list.
  const projects = await db.project.findMany({
    select: { id: true, name: true, crews: { select: { subcontractorId: true } } },
  });
  const byProject = new Map<string, Set<string>>();
  for (const p of snap.pairs) {
    if (!byProject.has(p.A)) byProject.set(p.A, new Set());
    byProject.get(p.A)!.add(p.B);
  }
  let projMismatch = 0;
  for (const pr of projects) {
    const got = new Set(pr.crews.map((c) => c.subcontractorId));
    const want = byProject.get(pr.id) ?? new Set<string>();
    if (got.size !== want.size || [...want].some((x) => !got.has(x))) projMismatch++;
  }

  console.log(
    `\n  ${assignedCrews} crews carry assignments, ${totalPairs} pairs total (snapshot had ${snap.pairs.length})`,
  );
  console.log(`  crew -> projects mismatches: ${mismatches}`);
  console.log(`  project -> crews mismatches: ${projMismatch}`);

  const clean = mismatches === 0 && projMismatch === 0 && totalPairs === snap.pairs.length;
  console.log(`\n${clean ? "Migrated data reads identically through the application's own query." : "MISMATCH — do not deploy; prisma/pending/001-restore.sql puts it back."}`);
  if (!clean) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
