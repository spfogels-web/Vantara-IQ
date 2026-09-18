/**
 * The request-scoped organisation proxy: does a query land on the right
 * database, and can it ever land on the wrong one.
 *
 * Every organisation is a separate database, so tenancy here is not a filter
 * that could be forgotten — it is which connection the statement travels down.
 * That makes the question narrow and answerable: run the same query under two
 * organisations and see whether two different databases answer.
 *
 * Two schemas stand in for the two databases. Step 1's gate already proved the
 * real Fortitude and Apex Neon projects cannot see each other; this proves the
 * code chooses between them correctly. Neither proof implies the other.
 *
 * Nothing here touches Fortitude production or Apex. The registry is pointed
 * at two disposable test schemas before the modules under test are loaded.
 */
import { afterAll, describe, expect, it } from "vitest";

import { OTHER_ORG_NAME } from "../support/fixtures";
import { TEST_SCHEMA, TEST_SCHEMA_B, testClient, testDatabaseUrl } from "../support/test-db";

/**
 * The registry reads the environment once, at import. So the environment is
 * set first and the modules under test are pulled in afterwards — which is
 * also the only way to give "apex" a database without going near the real one.
 */
const URL_A = testDatabaseUrl(TEST_SCHEMA);
const URL_B = testDatabaseUrl(TEST_SCHEMA_B);
process.env.DATABASE_URL = URL_A;
process.env.APEX_DATABASE_URL = URL_B;

const { prisma } = await import("@/lib/prisma");
const { runWithOrg, resolveOrg } = await import("@/lib/org-context");
const { knownOrgs } = await import("@/lib/org-registry");

/** Direct clients, to check each database from outside the proxy. */
const dbA = testClient(TEST_SCHEMA);
const dbB = testClient(TEST_SCHEMA_B);

afterAll(async () => {
  await Promise.all([dbA.$disconnect(), dbB.$disconnect()]);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("which database answers", () => {
  it("sends the same query to a different database for each organisation", async () => {
    const a = await runWithOrg("fortitude", () => prisma.$queryRaw<{ s: string }[]>`SELECT current_schema() AS s`);
    const b = await runWithOrg("apex", () => prisma.$queryRaw<{ s: string }[]>`SELECT current_schema() AS s`);

    expect(a[0].s).toBe(TEST_SCHEMA);
    expect(b[0].s).toBe(TEST_SCHEMA_B);
    expect(a[0].s, "both organisations resolved to the same connection").not.toBe(b[0].s);
  });

  it("reads each organisation's own rows through the model API", async () => {
    const a = await runWithOrg("fortitude", () => prisma.organization.findMany({ select: { name: true } }));
    const b = await runWithOrg("apex", () => prisma.organization.findMany({ select: { name: true } }));

    const namesA = a.map((o) => o.name);
    const namesB = b.map((o) => o.name);

    expect(namesB, "the second organisation should hold exactly its own row").toEqual([OTHER_ORG_NAME]);
    expect(namesA, "the second organisation's row is visible from the first").not.toContain(OTHER_ORG_NAME);
    expect(namesA.length, "fixture problem: the first organisation has no rows to confuse").toBeGreaterThan(0);
    for (const n of namesA) {
      expect(namesB, `"${n}" leaked into the other organisation`).not.toContain(n);
    }
  });
});

describe("a write under one organisation cannot be seen from the other", () => {
  it("stays put, in both directions", async () => {
    const markA = `leak-check-A-${Date.now()}`;
    const markB = `leak-check-B-${Date.now()}`;

    const created = { a: "", b: "" };
    try {
      created.a = (await runWithOrg("fortitude", () => prisma.organization.create({ data: { name: markA } }))).id;
      created.b = (await runWithOrg("apex", () => prisma.organization.create({ data: { name: markB } }))).id;

      // Checked from outside the proxy, so a routing bug cannot hide behind
      // the same bug twice.
      expect(await dbA.organization.count({ where: { name: markA } })).toBe(1);
      expect(
        await dbB.organization.count({ where: { name: markA } }),
        "a row written under the first organisation appeared in the second",
      ).toBe(0);

      expect(await dbB.organization.count({ where: { name: markB } })).toBe(1);
      expect(
        await dbA.organization.count({ where: { name: markB } }),
        "a row written under the second organisation appeared in the first",
      ).toBe(0);

      // And through the proxy, which is what the application actually uses.
      const seenFromA = await runWithOrg("fortitude", () =>
        prisma.organization.findFirst({ where: { name: markB } }),
      );
      const seenFromB = await runWithOrg("apex", () => prisma.organization.findFirst({ where: { name: markA } }));
      expect(seenFromA, "the proxy read the other organisation's row").toBeNull();
      expect(seenFromB, "the proxy read the other organisation's row").toBeNull();
    } finally {
      if (created.a) await dbA.organization.delete({ where: { id: created.a } }).catch(() => {});
      if (created.b) await dbB.organization.delete({ where: { id: created.b } }).catch(() => {});
    }
  });
});

describe("the proxy never guesses", () => {
  it("refuses an organisation it does not have", () => {
    expect(() => runWithOrg("northgate-utilities", () => null)).toThrow(/unknown organisation/i);
  });

  it("refuses to read anything when nothing says which organisation", async () => {
    // No frame and no request: a script, a seed, a background job. This used
    // to fall back to Fortitude, which meant any request that lost its
    // organisation quietly served a real company's live data.
    await expect(resolveOrg()).rejects.toThrow(/No organisation on this request/);
  });

  it("throws before reading a row, not after", async () => {
    // The distinction that matters: a query with no organisation must fail on
    // the way in. Reading first and failing later would already have touched
    // somebody's database.
    await expect(prisma.organization.findMany()).rejects.toThrow(/No organisation on this request/);
  });

  it("knows exactly the two organisations it was configured with", () => {
    expect(knownOrgs().map((o) => o.id).sort()).toEqual(["apex", "fortitude"]);
  });

  it("keeps the organisation across an await inside the frame", async () => {
    const seen = await runWithOrg("apex", async () => {
      await sleep(10);
      const rows = await prisma.$queryRaw<{ s: string }[]>`SELECT current_schema() AS s`;
      return rows[0].s;
    });
    expect(seen, "the organisation was lost across an await").toBe(TEST_SCHEMA_B);
  });
});

describe("queries do not run until they are awaited", () => {
  it("writes nothing when the call is never awaited", async () => {
    const name = `never-awaited-${Date.now()}`;

    await runWithOrg("apex", async () => {
      // Exactly how Prisma's own delegates behave. A proxy that started work
      // on the call would change what this line does.
      void prisma.organization.create({ data: { name } });
      await sleep(250);
    });

    expect(
      await dbB.organization.count({ where: { name } }),
      "an unawaited query executed — the proxy is eager where Prisma is lazy",
    ).toBe(0);
  });

  it("runs once, not twice, when awaited twice", async () => {
    const name = `awaited-twice-${Date.now()}`;
    try {
      await runWithOrg("apex", async () => {
        const pending = prisma.organization.create({ data: { name } });
        await pending;
        await pending;
      });
      expect(await dbB.organization.count({ where: { name } })).toBe(1);
    } finally {
      await dbB.organization.deleteMany({ where: { name } });
    }
  });

  it("belongs to the organisation it was built under, not the one it was awaited in", async () => {
    // The bug this is here for: the organisation used to be resolved when the
    // query was awaited rather than when it was built. By then the frame had
    // exited, so this read the incumbent's data instead of Apex's — with
    // nothing about the code looking wrong.
    const pendingRaw = runWithOrg("apex", () => prisma.$queryRaw<{ s: string }[]>`SELECT current_schema() AS s`);
    const pendingRows = runWithOrg("apex", () => prisma.organization.findMany({ select: { name: true } }));

    // The frame is gone by the time either of these is awaited.
    expect((await pendingRaw)[0].s, "awaited outside the frame and lost the organisation").toBe(TEST_SCHEMA_B);
    expect((await pendingRows).map((o) => o.name)).toEqual([OTHER_ORG_NAME]);
  });

  it("works inside Promise.all, which is how most of the app reads", async () => {
    const [orgs, schema] = await runWithOrg("apex", () =>
      Promise.all([
        prisma.organization.findMany({ select: { name: true } }),
        prisma.$queryRaw<{ s: string }[]>`SELECT current_schema() AS s`,
      ]),
    );
    expect(orgs.map((o) => o.name)).toEqual([OTHER_ORG_NAME]);
    expect(schema[0].s).toBe(TEST_SCHEMA_B);
  });
});

describe("the array form of $transaction", () => {
  it("is refused, and nothing has been written when it is", async () => {
    const name = `array-form-${Date.now()}`;
    const before = await dbB.organization.count();

    await runWithOrg("apex", async () => {
      expect(() =>
        // This compiles, with no error and no suppression: the proxy is typed
        // as PrismaClient, so the delegates still *claim* to return Prisma
        // promises. That is precisely why the refusal has to be at runtime.
        prisma.$transaction([
          prisma.organization.create({ data: { name } }),
          prisma.organization.create({ data: { name: `${name}-2` } }),
        ]),
      ).toThrow(/callback form/);
      await sleep(250);
    });

    expect(
      await dbB.organization.count({ where: { name: { startsWith: "array-form-" } } }),
      "the refused transaction still wrote a row — this is the failure the callback conversion existed to prevent",
    ).toBe(0);
    expect(await dbB.organization.count()).toBe(before);
  });

  it("is not present anywhere in the application", async () => {
    // A belt to the runtime refusal's braces: the type of `prisma` still says
    // these are Prisma promises, so the array form compiles. This is what stops
    // a tenth one being written.
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    walk("src");

    // The proxy itself names the forbidden form, in the error it raises and in
    // the comment explaining why. It is the one file allowed to say it.
    const PROXY = join("src", "lib", "prisma.ts");
    const sources = files.filter((f) => f !== PROXY).map((f) => [f, readFileSync(f, "utf8")] as const);
    expect(files, "the proxy moved — this exclusion now hides the whole codebase or nothing").toContain(PROXY);

    const offenders = sources.filter(([, s]) => s.includes("$transaction([")).map(([f]) => f);

    // The first version of this test shelled out to `git grep`, which read the
    // pattern as a regular expression, failed, and was caught by the same
    // `catch` that means "no matches" — so it could never fail. Hence the
    // check below: the scan has to find the transactions that certainly exist
    // before its silence about the ones that must not is worth anything.
    const callbackForm = sources.filter(([, s]) => s.includes("$transaction(async")).length;
    expect(callbackForm, "the scan found no transactions at all — it is not reading the source").toBeGreaterThan(0);

    expect(offenders, `array-form transactions found in:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("the callback form still behaves", () => {
  it("commits on the right organisation and rolls back on failure", async () => {
    const kept = `tx-kept-${Date.now()}`;
    const lost = `tx-lost-${Date.now()}`;

    await runWithOrg("apex", () =>
      prisma.$transaction(async (tx) => {
        await tx.organization.create({ data: { name: kept } });
      }),
    );
    expect(await dbB.organization.count({ where: { name: kept } })).toBe(1);
    expect(
      await dbA.organization.count({ where: { name: kept } }),
      "the transaction committed against the wrong organisation",
    ).toBe(0);

    await expect(
      runWithOrg("apex", () =>
        prisma.$transaction(async (tx) => {
          await tx.organization.create({ data: { name: lost } });
          await tx.organization.delete({ where: { id: "no-such-organisation" } });
        }),
      ),
    ).rejects.toThrow();

    expect(
      await dbB.organization.count({ where: { name: lost } }),
      "a failed transaction left its first statement behind",
    ).toBe(0);

    await dbB.organization.deleteMany({ where: { name: kept } });
  });
});
