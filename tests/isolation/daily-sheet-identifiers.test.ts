/**
 * What goes on the billing document, read off the billing document.
 *
 * The crew number is the identifier a prime's billing department issued us. It
 * was a constant in the sheet component — one contractor's number with Globe —
 * so every organisation's crews, under every prime, filed under it. That does
 * not look wrong on paper. It looks like a sheet from a company that did not
 * do the work, in the one field the prime reconciles against.
 *
 * A configuration-layer test is not enough for this, because the value's whole
 * purpose is to be printed. So these read the rendered sheet over HTTP, the
 * same way a crew's browser does.
 */
import { describe, expect, it } from "vitest";

import { BASE_URL, fixtures, otherTenant } from "../support/load";
import { get, pageText, sessionCookie } from "../support/session";

const f = fixtures();
const other = otherTenant();
const incumbent = f.a;

const staff = () => sessionCookie(incumbent.staffUserId, "OFFICE");
const staffInOther = () => sessionCookie(incumbent.staffUserId, "OFFICE", "apex");

/**
 * The sheet, as rendered.
 *
 * The crew number sits in a controlled input's `value`, which is in the markup
 * and in the flight payload both; the whole reply is read so a value present
 * in either is found. This is a leak test — presence is the question.
 */
async function sheetFor(projectId: string, cookie: string): Promise<string> {
  const r = await get(BASE_URL, `/dailies/sheet/${projectId}`, cookie);
  expect(r.status, `the sheet for ${projectId} did not render (${r.status})`).toBe(200);
  return pageText(r);
}

describe("the identifier on a daily sheet belongs to that job's customer", () => {
  it("prints the number the project's own customer issued", async () => {
    const sheet = await sheetFor(incumbent.projectId, await staff());
    expect(
      sheet.includes(incumbent.crewNumber),
      `the sheet for ${incumbent.customerName} did not carry ${incumbent.crewNumber}`,
    ).toBe(true);
  });

  it("leaves it blank for a customer that has not issued one", async () => {
    // The second prime has no number on file. The field is a blank the crew can
    // fill — never the other customer's number, which would price and file and
    // reconcile against the wrong account without ever looking wrong.
    const sheet = await sheetFor(incumbent.project2Id, await staff());
    expect(
      sheet.includes(incumbent.crewNumber),
      `${incumbent.customer2Name} has no crew number, but the sheet showed ${incumbent.customerName}'s (${incumbent.crewNumber}) — one customer's identifier fell back to another's`,
    ).toBe(false);
  });

  it("names the job's own customer in the heading", async () => {
    // The heading used to be a customer's name in a string literal.
    const first = await sheetFor(incumbent.projectId, await staff());
    const second = await sheetFor(incumbent.project2Id, await staff());

    expect(
      first.includes(incumbent.customerName),
      `the sheet did not name ${incumbent.customerName}`,
    ).toBe(true);
    expect(
      second.includes(incumbent.customer2Name),
      `the sheet did not name ${incumbent.customer2Name}`,
    ).toBe(true);
    expect(
      second.includes(incumbent.customerName),
      `a ${incumbent.customer2Name} sheet named ${incumbent.customerName}`,
    ).toBe(false);
  });
});

describe("another organisation's sheet carries none of it", () => {
  it("does not serve the incumbent's job while switched away", async () => {
    /**
     * Asserted on what comes back rather than on the status line.
     *
     * The project does not exist in the other organisation's database, so the
     * route reaches `notFound()` and renders the not-found page — but under
     * `next dev` that arrives as a 200 rather than a 404. The status is a
     * development artifact; what matters for tenancy is that none of the
     * incumbent's job is in the reply, and that is what is checked. The API
     * route for the same sheet is checked by status in org-switch.test.ts,
     * where it does refuse properly.
     */
    const r = await get(BASE_URL, `/dailies/sheet/${incumbent.projectId}`, await staffInOther());
    const text = pageText(r);

    for (const [what, value] of [
      ["project", incumbent.projectName],
      ["customer", incumbent.customerName],
      ["crew number", incumbent.crewNumber],
    ] as [string, string][]) {
      expect(
        text.includes(value),
        `the incumbent's ${what} (${value}) was served while switched to another organisation`,
      ).toBe(false);
    }

    // And it is the not-found page, not a blank or a half-rendered sheet —
    // otherwise the absences above could just be a page that failed to load.
    expect(
      text.includes("could not be found"),
      "the route did not answer with the not-found page, so what it did serve is unaccounted for",
    ).toBe(true);
  });

  it("shows neither of the incumbent's numbers on its own job", async () => {
    const sheet = await sheetFor(other.projectId, await staffInOther());
    for (const n of [incumbent.crewNumber, f.b.crewNumber]) {
      expect(
        sheet.includes(n),
        `another organisation's daily sheet carried ${n} — an identifier issued to somebody else`,
      ).toBe(false);
    }
  });

  it("carries its own customer's number instead", async () => {
    // Absence alone would be satisfied by a sheet that renders nothing.
    const sheet = await sheetFor(other.projectId, await staffInOther());
    expect(
      sheet.includes(other.crewNumber),
      `the other organisation's sheet did not carry its own ${other.crewNumber}, so the absences above prove nothing`,
    ).toBe(true);
  });
});
