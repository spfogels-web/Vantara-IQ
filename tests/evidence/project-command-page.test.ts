/**
 * The project command page renders, and its closed rows tell the truth.
 *
 * The point of the redesign is that somebody can read a project without
 * opening anything, so the thing worth testing is not that the page appears —
 * it is that the summaries on the closed rows are derived from this project's
 * own data. A row that says "13 codes" on every project would look right in a
 * screenshot and be worthless.
 *
 * These fetch the real page from the real server, the way the isolation tests
 * do. Nothing here inspects React internals: what a supervisor sees is HTML.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { get, sessionCookie } from "../support/session";

const f = fixtures();
const tenant = f.a;

let staff = "";
let html = "";

beforeAll(async () => {
  staff = await sessionCookie(tenant.staffUserId, "ADMIN");
  html = (await get(BASE_URL, `/projects/${tenant.projectId}`, staff)).body;
}, 60_000);

describe("the page renders at all", () => {
  it("serves the project", () => {
    expect(html.length).toBeGreaterThan(5_000);
    expect(html).toContain(tenant.projectName);
  });
});

describe("every section of the command page is present", () => {
  // The ten rows the page is specified to carry. A section that quietly
  // stopped rendering would otherwise look like a shorter, tidier page.
  const SECTIONS = [
    "Project overview",
    "Project map &amp; plans",
    "Rates on this job",
    "Locates",
    "Material on project",
    "Crews on this job",
    "Dailies",
    "Project evidence",
    "Damage reports / incidents",
    "Customer",
  ];

  for (const title of SECTIONS) {
    it(`renders ${title}`, () => {
      expect(html).toContain(title);
    });
  }
});

describe("closed rows carry this project's own figures", () => {
  it("names the customer on the customer row", () => {
    expect(html).toContain(tenant.customerName);
  });

  it("names the crew that is actually on the job", () => {
    // Seeded crews belong to this tenant's project. If the summary were a
    // placeholder, or read from the wrong project, this is what would catch it.
    expect(html).toContain(tenant.crews[0].company);
  });

  it("does not ship a hardcoded figure from the mockup", () => {
    // The mockup's numbers. None of them are this project's, so any of them
    // appearing means a summary was copied rather than derived.
    //
    // Only figures, deliberately. "Globe Communications" is also on the
    // mockup, but it is a real market prime that the layout serialises into
    // every page, so asserting on it tests the seed data rather than this
    // page — the same false positive that once made a layout value look like
    // an authorization defect.
    for (const invented of ["8,596 ft", "7,083 ea", "62 pages", "13 codes"]) {
      expect(html).not.toContain(invented);
    }
  });
});

describe("the page does not claim what the record does not hold", () => {
  it("shows no coordinates, because a project carries none", () => {
    // The mockup has a lat/lng readout. There is no such column, and inventing
    // one from the cover image or the market centroid would be a map pin that
    // looks like evidence and is not.
    expect(html).not.toMatch(/\d{2}\.\d{4}°\s*[NS]/);
  });

  it("offers no weather", () => {
    expect(html).not.toMatch(/\bClear\b|\bweather\b/i);
  });

  it("says incidents are not yet available rather than reporting zero", () => {
    expect(html).toContain("Not yet available");
    expect(html).not.toContain("0 incidents");
  });
});

describe("the heavy sections are not mounted while closed", () => {
  it("does not mount the plan viewer on load", async () => {
    // The PDF engine was the most expensive thing on the old page. It is
    // rendered on the server either way; what must not happen is it becoming a
    // live client component before anybody asks for the drawing.
    const { body } = await get(BASE_URL, `/projects/${tenant.projectId}`, staff);
    // The map panel's own controls only exist once the section is open.
    expect(body).not.toContain("Read the print");
  });
});
