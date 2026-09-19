/**
 * Finding a unit code on a daily sheet.
 *
 * A crew is standing in a truck with a card that runs to dozens of codes and
 * sometimes thousands. Scrolling for one is how it gets typed from memory
 * instead, and a typed code that misses the card by a character prices at
 * nothing — the sheet files clean and the money turns up missing at billing.
 *
 * So the order the matches come back in is not cosmetic. The first row is the
 * one a thumb lands on.
 */
import { describe, expect, it } from "vitest";

import { __ranking } from "@/components/dailies/code-combobox";

const { rank } = __ranking;

/** A slice of a real card: two microduct codes, a bore, and two pedestals. */
const CARD = [
  { code: "BFOV(12.7)(2W)12IN DEPTH", description: "Place micro duct 12in depth" },
  { code: "BFOV(8.5)(1W)12IN DEPTH", description: "Place micro duct 12in depth" },
  { code: "BFO48", description: "Place buried fiber optic cable, 48ct" },
  { code: "BFO48I", description: "Pull BFO cable in duct" },
  { code: "BD4MPF", description: "Place fiber pedestal" },
  { code: "BD5MPF", description: "Place fiber pedestal" },
  { code: "BM61(2)F", description: "Non-pipe crossing assembly unit" },
];

/** What the picker would show, in order, for a query. */
function search(query: string): string[] {
  return CARD.map((o) => ({ o, r: rank(o, query) }))
    .filter((m) => m.r >= 0)
    .sort((a, b) => a.r - b.r)
    .map((m) => m.o.code);
}

describe("typing a code prefix", () => {
  it("shows the codes in that family", () => {
    const hits = search("BFO");
    expect(hits).toContain("BFO48");
    expect(hits).toContain("BFO48I");
    // BFOV codes start with BFO too, and a crew typing BFO means all of them.
    expect(hits).toContain("BFOV(12.7)(2W)12IN DEPTH");
  });

  it("puts the exact code first when one matches exactly", () => {
    // BFO48 and BFO48I both start with BFO48. The one that *is* BFO48 leads,
    // because picking its neighbour bills pulling cable as placing it.
    expect(search("BFO48")[0]).toBe("BFO48");
  });

  it("finds a family from a fragment of it", () => {
    expect(search("BD4")).toContain("BD4MPF");
  });
});

describe("typing words instead of codes", () => {
  it("finds codes by what the work is called", () => {
    // A foreman knows "pedestal" and would have to hunt for BD4MPF.
    const hits = search("pedestal");
    expect(hits).toContain("BD4MPF");
    expect(hits).toContain("BD5MPF");
  });

  it("ranks a code match above a description match", () => {
    /**
     * "duct" is in the description of both microduct codes and in the
     * description of BFO48I ("Pull BFO cable in duct"). None has it in the
     * code, so all three are description matches — but a query that matches a
     * code anywhere must outrank one that only matches prose.
     */
    const codeMatch = rank({ code: "BFO48", description: "irrelevant" }, "BFO48");
    const descriptionMatch = rank({ code: "XX1", description: "Place buried fiber" }, "buried");
    expect(codeMatch).toBeLessThan(descriptionMatch);
  });
});

describe("what does not match", () => {
  it("is excluded rather than shown at the bottom", () => {
    // A list that always shows everything is a list nobody trusts to filter.
    expect(search("zzzz")).toEqual([]);
  });

  it("ignores how the inch mark is written", () => {
    // The card says 12IN DEPTH in one place and 12"DEPTH in another. A crew
    // typing either has to find the same code.
    expect(rank({ code: 'BFOV(12.7)(2W)12"DEPTH', description: "" }, "BFOV(12.7)(2W)12IN DEPTH")).toBe(0);
  });

  it("matches a lower-case query, because that is what gets typed", () => {
    expect(search("bfo48")[0]).toBe("BFO48");
  });
});

describe("an empty query", () => {
  it("shows the whole card, with the familiar families first", () => {
    // Clicking the field shows what is available — it does not make a crew
    // type before it will tell them anything.
    const withPreferred = [
      { code: "ZZ-RARE", description: "rarely billed" },
      { code: "BFO48", description: "Place buried fiber optic cable", preferred: true },
    ];
    const ordered = withPreferred
      .map((o) => ({ o, r: rank(o, "") }))
      .sort((a, b) => a.r - b.r)
      .map((m) => m.o.code);

    expect(ordered).toEqual(["BFO48", "ZZ-RARE"]);
  });
});
