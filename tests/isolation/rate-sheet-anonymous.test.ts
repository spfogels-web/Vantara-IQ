/**
 * The rate sheet a crew is sent, and what it is not allowed to carry.
 *
 * It goes to several crews at once to agree rates against, so it is a price
 * list rather than a letter. Two things follow and both are easy to lose by
 * accident:
 *
 *   It names nobody. Not the customer, not the prime, not the crew, and not us
 *   — including in the filename, which is read in an inbox before the page is
 *   ever opened, and in the PDF metadata, which travels with the file and is
 *   not visible on the page at all.
 *
 *   It carries one rate. What the customer pays, the spread and the job margin
 *   are all on the screen these numbers are typed into, and none of them belong
 *   in a subcontractor's hands.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ROUTE = readFileSync("src/app/api/rate-sheet/project/[projectId]/route.ts", "utf8");
const PDF = readFileSync("src/lib/rate-sheet-pdf.ts", "utf8");
const QUERIES = readFileSync("src/data/queries.ts", "utf8");

/** getProjectRates's source — read by two groups below. */
const RATES = QUERIES.slice(
  QUERIES.indexOf("export async function getProjectRates"),
  QUERIES.indexOf("export interface ProjectCrew"),
);

describe("the sheet names nobody", () => {
  it("prints no company name", () => {
    expect(ROUTE).toMatch(/companyName: ""/);
    expect(ROUTE, "the organisation is still being read for the sheet").not.toMatch(
      /prisma\.organization\.findFirst/,
    );
  });

  it("carries no mark", () => {
    // A logo is a name in picture form; leaving it on would make the rest of
    // this cosmetic.
    expect(ROUTE).toMatch(/logo: null/);
    expect(ROUTE, "the logo is still being loaded").not.toMatch(/companyLogo\(/);
  });

  it("leaves the crew line blank for the recipient to fill in", () => {
    expect(ROUTE).toMatch(/subcontractorName: ""/);
    expect(PDF).toMatch(/Subcontractor: _+/);
  });

  it("puts the job number in the filename, never the project name", () => {
    // These jobs are named after the customer and the prime — "GA
    // Windstream_Trawick" — so the name is exactly what must not travel. The
    // old fallback used it whenever a job had no number.
    const filename = ROUTE.slice(ROUTE.indexOf("const safe ="), ROUTE.indexOf("Content-Disposition"));
    expect(filename).toMatch(/project\.number/);
    expect(filename, "the filename falls back to the project name").not.toMatch(/project\.name/);
  });

  it("says nothing in the metadata either", () => {
    // Not visible on the page, and travels with the file.
    expect(PDF).toMatch(/pdf\.setAuthor\(""\)/);
    expect(PDF).toMatch(/pdf\.setProducer\(""\)/);
    expect(PDF).toMatch(/pdf\.setCreator\(""\)/);
    expect(PDF, "the subject still names the recipient").not.toMatch(
      /setSubject\(`Rate sheet for/,
    );
  });

  it("identifies the job by market and number, not by its name", () => {
    const subtitle = ROUTE.slice(ROUTE.indexOf("subtitle:"), ROUTE.indexOf("terms:"));
    expect(subtitle).toMatch(/project\.market/);
    expect(subtitle).toMatch(/project\.number/);
    expect(subtitle, "the project name is on the sheet").not.toMatch(/project\.name/);
  });
});

describe("the sheet carries one rate", () => {
  it("is handed nothing it could print but the pay rate", () => {
    // The generator's input shape is the guarantee: there is no customer rate,
    // spread or margin on it to leak even by mistake.
    const shape = PDF.slice(PDF.indexOf("export interface RateSheetLine"), PDF.indexOf("export interface RateSheetInput"));
    for (const term of ["customerRate", "spread", "margin", "revenue", "billRate"]) {
      expect(shape, `a sheet line carries ${term}`).not.toContain(term);
    }
    expect(shape).toMatch(/rate: number/);
  });

  it("will not quote zero", () => {
    // A rate nobody has filled in is not an agreement to work for nothing.
    expect(ROUTE).toMatch(/if \(r\.rate <= 0\) return false/);
  });
});

describe("every code on the card is offered", () => {

  it("lists the rest of the card, not just the job's own work", () => {
    expect(RATES).toMatch(/const extra: ProjectRateLine\[\] = \[\]/);
    expect(RATES).toMatch(/onJob: false/);
    expect(RATES).toMatch(/onJob: true/);
  });

  it("gives them no quantity, so they move no money", () => {
    // The job's budget is the job's budget. A code it does not build must not
    // appear in planned revenue, cost or margin.
    const block = RATES.slice(RATES.indexOf("const extra: ProjectRateLine[] = []"));
    expect(block).toMatch(/planned: 0/);
    expect(block).toMatch(/plannedRevenue: null/);
    expect(block).toMatch(/plannedCost: null/);
  });

  it("does not count them as gaps in the job's rates", () => {
    // missingCustomerRates/missingSubRates are incremented only while walking
    // the material list — the job's own work.
    const materialsLoop = RATES.slice(
      RATES.indexOf("for (const m of project.materials)"),
      RATES.indexOf("const extra: ProjectRateLine[] = []"),
    );
    expect(materialsLoop).toMatch(/missingCustomerRates\+\+/);
    expect(materialsLoop).toMatch(/missingSubRates\+\+/);
    const block = RATES.slice(RATES.indexOf("const extra: ProjectRateLine[] = []"));
    expect(block, "card-only codes are counted as missing rates").not.toMatch(/missing\w+\+\+/);
  });
});

describe("a card with thousands of codes on it", () => {
  const PANEL = readFileSync("src/components/projects/project-rates.tsx", "utf8");

  it("offers the codes somebody chose, not the whole card", () => {
    // One customer's card carries 2,480 codes and 55 of them are on the list
    // that says what this contractor actually builds. The panel is bounded by
    // that list rather than by the card.
    // Matched as literal text, not as a pattern: the parentheses here are
    // parentheses, and written as a regex they quietly became a capture group
    // that matched nothing.
    expect(RATES).toContain("if (!isMainBillableCode(c.code) && !sr) continue;");
  });

  it("never drops a code somebody has already priced", () => {
    // A curated list disagreeing with a rate somebody typed is the list being
    // wrong, not the rate — so the test is that `sr` alone is enough to keep it.
    const block = RATES.slice(RATES.indexOf("for (const c of consider)"));
    expect(block).toContain("&& !sr) continue;");
    expect(block, "the filter ignores whether it is already priced").not.toContain(
      "if (!isMainBillableCode(c.code)) continue;",
    );
  });

  it("does not draw the whole price book at once", () => {
    // One customer's card carries 2,486 codes. Drawing them all puts 2,486 rows
    // and as many inputs on the page — slow to render, and useless to read,
    // because nobody finds a code by scrolling that far.
    expect(PANEL).toMatch(/const CARD_PAGE = \d+/);
    expect(PANEL).toMatch(/shownOther = matching\.slice\(0, CARD_PAGE\)/);
    expect(PANEL, "the fold still renders every row").not.toMatch(
      /showAll \? otherLines\.map\(renderRow\)/,
    );
  });

  it("lets somebody search for the code they came to price", () => {
    expect(PANEL).toMatch(/Find a code or description/);
    // By code or by what the work is called — a crew asks for both.
    expect(PANEL).toMatch(/l\.code\.toUpperCase\(\)\.includes\(needle\)/);
    expect(PANEL).toMatch(/l\.description\.toUpperCase\(\)\.includes\(needle\)/);
  });

  it("says when it is showing less than it found", () => {
    // A truncated list that does not admit it is a list somebody trusts for a
    // code that is not on it.
    expect(PANEL).toMatch(/search to narrow/);
  });
});
