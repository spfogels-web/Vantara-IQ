/**
 * The rate card is the money, and nothing else is.
 *
 * `OrgCodeProfile` used to carry a `billableCodes` list — a second, hand-typed
 * copy of what a crew may bill, sitting alongside the customer rate cards the
 * invoice is actually built from. It drifted from them, twelve codes went
 * missing from the daily sheet, and Fortitude could not bill. The column is
 * gone; these tests are what stops it coming back in another shape.
 *
 * What a daily offers is composed of exactly two things, and they are tested
 * here as the real shipped functions rather than as a restatement of them:
 *
 *     ratesForMarket(customer's rows, project's market)   which prices apply
 *     isMainBillableCode(code)                            which work we sell
 *
 * Neither takes a code profile, and that is the point.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ratesForMarket } from "@/lib/markets";
import { EMPTY_CODE_PROFILE, isMainBillableCode, normalizeCode } from "@/lib/unit-codes";

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/**
 * getBillableCodes, from the customer's rows onward — the same composition
 * queries.ts performs, minus the access check that decides *who may ask*.
 */
function picker<T extends { code: string; market?: string | null }>(rows: T[], market: string | null) {
  const seen = new Set<string>();
  return ratesForMarket(rows, market)
    .filter((r) => isMainBillableCode(r.code))
    .filter((r) => {
      const k = normalizeCode(r.code);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Two Trawick markets that price the same work differently, plus a shared row. */
const TRAWICK = [
  { code: "BM61(2)F", market: "south-ga", rate: 12.5 },
  { code: "BM61(2)F", market: "alabama", rate: 9.75 },
  { code: "BFO12", market: "south-ga", rate: 1.1 },
  { code: "BHF(6)P", market: "alabama", rate: 88.0 },
  // No market: priced the same wherever the job is.
  { code: "BDO", market: null, rate: 4.0 },
];

const GLOBE = [
  { code: "BFO24", market: "north-ga", rate: 2.2 },
  { code: "BMFAF", market: "north-ga", rate: 3.3 },
];

const rateOf = (rows: { code: string; rate: number }[], code: string) =>
  rows.find((r) => normalizeCode(r.code) === normalizeCode(code))?.rate;

describe("a daily needs no code profile", () => {
  it("resolves its codes with no OrgCodeProfile row in existence", () => {
    // Nothing here reads a profile, because nothing in the path accepts one.
    // This is the state a fresh organisation is in before 002 is applied, and
    // the state Fortitude is in on the currently deployed build.
    const offered = picker(TRAWICK, "south-ga");
    expect(
      offered.map((r) => r.code),
      "the picker returned nothing without a code profile present",
    ).toContain("BM61(2)F");
  });

  it("has no billable-code list on the profile to consult", () => {
    // The type carries priorities and families. If a `billableCodes` key ever
    // reappears here, the second source of truth is back.
    expect(Object.keys(EMPTY_CODE_PROFILE).sort()).toEqual(["families", "priorityCodes"]);
  });

  it("never consults the code profile inside getBillableCodes", () => {
    const src = read("src/data/queries.ts");
    const fn = /export async function getBillableCodes[\s\S]*?\n}/.exec(src);
    expect(fn, "getBillableCodes was not found — this guard is not watching anything").not.toBeNull();

    // The guard has to be able to fail, or it proves nothing. The same scan
    // must find profile use where profile use legitimately exists.
    expect(
      /getCodeProfile|orgCodeProfile/.test(src),
      "queries.ts no longer mentions the code profile anywhere, so finding none inside getBillableCodes is meaningless",
    ).toBe(true);

    expect(
      /getCodeProfile|orgCodeProfile|billableCodes/.test(fn![0]),
      "getBillableCodes consults the organisation code profile — the rate card is the source of truth for what a crew may bill",
    ).toBe(false);
  });
});

describe("market-specific pricing stays market-specific", () => {
  it("gives each Trawick market its own price for the same code", () => {
    const south = picker(TRAWICK, "south-ga");
    const alabama = picker(TRAWICK, "alabama");

    expect(rateOf(south, "BM61(2)F"), "South Georgia did not get its own price").toBe(12.5);
    expect(rateOf(alabama, "BM61(2)F"), "Alabama did not get its own price").toBe(9.75);
    expect(
      rateOf(south, "BM61(2)F"),
      "both markets resolved to the same rate, so one of them is being invoiced at the other's price",
    ).not.toBe(rateOf(alabama, "BM61(2)F"));
  });

  it("keeps a South Georgia-only code off an Alabama job", () => {
    const alabama = picker(TRAWICK, "alabama").map((r) => r.code);
    expect(alabama, "an Alabama job was offered a South Georgia code").not.toContain("BFO12");
  });

  it("keeps an Alabama-only code off a South Georgia job", () => {
    const south = picker(TRAWICK, "south-ga").map((r) => r.code);
    expect(south, "a South Georgia job was offered an Alabama code").not.toContain("BHF(6)P");
  });

  it("still applies a row that names no market to both", () => {
    // The fallback that is legitimate: one price, everywhere. Without this the
    // narrowing would be over-strict and jobs would lose codes they do bill.
    expect(picker(TRAWICK, "south-ga").map((r) => r.code)).toContain("BDO");
    expect(picker(TRAWICK, "alabama").map((r) => r.code)).toContain("BDO");
  });

  it("does not let a market-specific row stand in for an unpriced market", () => {
    // A job in a market with no rows of its own gets only the blank rows —
    // never another market's numbers.
    const elsewhere = picker(TRAWICK, "north-ga").map((r) => r.code);
    expect(elsewhere).toEqual(["BDO"]);
  });
});

describe("one customer's card cannot price another customer's job", () => {
  it("offers no Globe code from a Trawick card, or the reverse", () => {
    const trawick = picker(TRAWICK, "south-ga").map((r) => normalizeCode(r.code));
    const globe = picker(GLOBE, "north-ga").map((r) => normalizeCode(r.code));
    for (const g of globe) {
      expect(trawick, `${g} came from Globe's card onto a Trawick job`).not.toContain(g);
    }
  });

  it("reads the rate card scoped to one customer", () => {
    // The isolation above only holds because the query never fetches another
    // customer's rows in the first place.
    const src = read("src/data/queries.ts");
    const fn = /export async function getBillableCodes[\s\S]*?\n}/.exec(src)![0];
    const query = /prisma\.customerRate\.findMany\(\{[\s\S]*?\}\)/.exec(fn);
    expect(query, "getBillableCodes no longer reads customerRate the way this guard expects").not.toBeNull();
    expect(
      /where:\s*\{[^}]*customerId/.test(query![0]),
      "the rate-card read is not scoped to one customer",
    ).toBe(true);
  });
});

describe("the scope filter still decides what is offered", () => {
  it("withholds a priced code that is not work this organisation sells", () => {
    // Globe's master card runs to thousands of rows. The filter is what keeps
    // a daily to the underground subset instead of all of them.
    const card = [...GLOBE, { code: "ZZ-NOT-OUR-WORK", market: "north-ga", rate: 1 }];
    const offered = picker(card, "north-ga").map((r) => r.code);
    expect(offered).not.toContain("ZZ-NOT-OUR-WORK");
    expect(offered, "the filter withheld everything, so this proves nothing").toContain("BFO24");
  });

  it("matches an inch mark against IN, which is how twelve codes went missing", () => {
    const card = [{ code: 'BFOV(12.7)(2W)12"DEPTH', market: null, rate: 1 }];
    expect(picker(card, "south-ga")).toHaveLength(1);
    expect(isMainBillableCode("BFOV(12.7)(2W)12IN DEPTH")).toBe(true);
  });
});

describe("the model and the unapplied migration describe the same table", () => {
  /** Field names on a Prisma model, ignoring comments and attributes. */
  function prismaFields(model: string): string[] {
    const src = read("prisma/schema.prisma");
    const block = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`).exec(src);
    expect(block, `model ${model} not found in schema.prisma`).not.toBeNull();
    return block![1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
      .map((l) => l.split(/\s+/)[0])
      .sort();
  }

  /** Column names from a CREATE TABLE in the pending migration. */
  function sqlColumns(table: string): string[] {
    const src = read("prisma/pending/002-org-settings.sql");
    const block = new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${table}" \\(([\\s\\S]*?)\\n\\);`).exec(src);
    expect(block, `table ${table} not found in 002-org-settings.sql`).not.toBeNull();
    return block![1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith('"'))
      .map((l) => l.slice(1, l.indexOf('"', 1)))
      .sort();
  }

  it("agrees about OrgCodeProfile, which is where the drift was", () => {
    expect(sqlColumns("OrgCodeProfile")).toEqual(prismaFields("OrgCodeProfile"));
  });

  it("agrees about OrgSettings and Market too", () => {
    expect(sqlColumns("OrgSettings")).toEqual(prismaFields("OrgSettings"));
    expect(sqlColumns("Market")).toEqual(prismaFields("Market"));
  });

  it("would notice a disagreement", () => {
    // Same comparison against a field that exists in neither, proving the
    // check is reading both sides rather than comparing a list to itself.
    expect(prismaFields("OrgCodeProfile")).not.toContain("billableCodes");
    expect(sqlColumns("OrgCodeProfile")).not.toContain("billableCodes");
    expect(prismaFields("OrgCodeProfile")).toContain("priorityCodes");
    expect(sqlColumns("OrgCodeProfile")).toContain("priorityCodes");
  });

  it("seeds no billable-code list", () => {
    const sql = read("prisma/pending/002-org-settings.sql");
    const insert = /INSERT INTO "public"\."OrgCodeProfile"[\s\S]*?;/.exec(sql);
    expect(insert, "the OrgCodeProfile seed was not found").not.toBeNull();
    expect(
      /billableCodes/.test(insert![0]),
      "the migration still seeds an organisation-level billable-code list",
    ).toBe(false);
  });
});
