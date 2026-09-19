/**
 * VERIFICATION TOOLING — server-side, run from a terminal. Never imported by
 * the application and never bundled: it reads connection strings for more than
 * one tenant, which is exactly what must not reach a browser.
 */
/**
 * Prove a write made in one workspace lands in that workspace and nowhere else.
 *
 *   npx tsx prisma/provision/verify-write-isolation.ts apex
 *
 * Reads have been proven; a read that goes to the wrong database shows somebody
 * the wrong data, which is bad. A *write* that goes to the wrong database puts
 * one company's record inside another's books, which is worse and much harder
 * to notice later.
 *
 * ## What is written, and what is not
 *
 * One row, in the tenant, through the same `clientFor(org)` mapping the
 * application's Prisma proxy uses to choose a connection — so this exercises
 * the real routing rather than a copy of it. The row is a task titled with a
 * run-specific marker, and it is deleted in a `finally`. Fortitude is read
 * before and after and is never written.
 *
 * ## The direction this cannot test
 *
 * Proving the reverse — that a Fortitude-context write stays out of Apex —
 * would mean writing to a live business's database to satisfy a test. It is
 * not done here and no substitute is manufactured for it; see the note printed
 * at the end, which says plainly what remains unproven and where the symmetric
 * property *is* proven safely.
 */
import { PrismaClient } from "@prisma/client";

import { identityOf, targetFor, urlFor } from "./targets";

let failures = 0;
function check(ok: boolean, name: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

async function main() {
  const key = process.argv[2] ?? "apex";
  const t = targetFor(key);
  const tenantUrl = urlFor(t, "pooled");

  /**
   * The application's own mapping, imported rather than reimplemented.
   *
   * `clientFor` is what the Prisma proxy calls once it knows which
   * organisation a request belongs to. Writing through it is the closest this
   * can get to "the application wrote something" without standing up a request.
   */
  const { clientFor } = await import("../../src/lib/org-registry");
  const routed = clientFor(key as never);

  const fort = new PrismaClient();
  const marker = `__isolation-probe-${Date.now()}`;
  const id = `apex-probe-${Date.now()}`;

  console.log(`\nWrite isolation — ${t.label}`);
  console.log(`  tenant    ${identityOf(tenantUrl).host}`);
  console.log(`  fortitude ${identityOf(process.env.DATABASE_URL!).host}  (read-only)\n`);

  const fortTasksBefore = await fort.task.count();

  try {
    // ---- the write, through the application's own routing -----------------
    await routed.task.create({
      data: {
        id,
        title: marker,
        status: "OPEN",
        category: "GENERAL",
        priority: "LOW",
        detail: "Written by verify-write-isolation.ts. Removed before this script exits.",
      },
    });
    console.log(`  wrote one task through clientFor("${key}")`);

    // ---- where did it land? -----------------------------------------------
    const inTenant = await routed.task.count({ where: { title: marker } });
    check(inTenant === 1, `the row is in ${t.label}`, `${inTenant} found`);

    const inFortitude = await fort.task.count({ where: { title: marker } });
    check(inFortitude === 0, "the row is NOT in Fortitude", `${inFortitude} found`);

    // A different question: did Fortitude gain anything at all?
    const fortTasksDuring = await fort.task.count();
    check(
      fortTasksDuring === fortTasksBefore,
      "Fortitude's task count did not move",
      `${fortTasksBefore} -> ${fortTasksDuring}`,
    );

    // And the tenant's own client agrees it is there, by id.
    const found = await routed.task.findUnique({ where: { id }, select: { title: true } });
    check(found?.title === marker, "the row reads back from the tenant by id");
  } finally {
    // Remove it however this ends.
    await routed.task.deleteMany({ where: { title: marker } }).catch(() => undefined);
    const left = await routed.task.count({ where: { title: marker } }).catch(() => -1);
    check(left === 0, "the probe row was removed", `${left} left`);

    const fortTasksAfter = await fort.task.count();
    check(fortTasksAfter === fortTasksBefore, "Fortitude is where it started", `${fortTasksAfter}`);
    await fort.$disconnect();
    await routed.$disconnect().catch(() => undefined);
  }

  console.log(`
  NOT PROVEN HERE, deliberately:
    that a Fortitude-context write stays out of Apex. Proving it would mean
    writing a row into a live business's database to satisfy a test, and no
    substitute for that is invented here.

    The symmetric property is proven safely elsewhere: tests/isolation runs two
    seeded tenants in two schemas that are both disposable, and asserts writes
    in each stay in each. What that leaves unproven about *production* is the
    one direction nobody should test against production.`);

  console.log("\n" + "=".repeat(64));
  console.log(failures === 0 ? "  WRITE ISOLATION PASSED" : `  WRITE ISOLATION FAILED — ${failures}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("\nWrite isolation failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
