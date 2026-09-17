/**
 * The boundary that already exists: one crew must not read another's work.
 *
 * These should be green today. They are here as the regression net for the
 * tenancy migration — the change touches every query in the system, and this
 * is the boundary most likely to be broken by accident on the way past. A
 * crew's pay, their documents and another crew's production are the three
 * things the business has been clearest about.
 *
 * Both crews in these tests belong to the same contractor, so nothing here
 * depends on tenancy existing.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { get, sessionCookie, wasRefused, wasServed } from "../support/session";

const f = fixtures();
const tenant = f.a;
const [onTheJob, notOnTheJob] = tenant.crews;

let onJob = "";
let offJob = "";

beforeAll(async () => {
  onJob = await sessionCookie(onTheJob.userId, "SUBCONTRACTOR");
  offJob = await sessionCookie(notOnTheJob.userId, "SUBCONTRACTOR");
});

describe("a crew reaches its own things", () => {
  it("serves their own onboarding document", async () => {
    const r = await get(BASE_URL, `/api/sub-document/${onTheJob.documentId}`, onJob);
    expect(wasServed(r), `expected the document, got ${r.status}`).toBe(true);
  });

  it("serves their own pay statement's remittance advice", async () => {
    const r = await get(BASE_URL, `/api/remittance/${onTheJob.subInvoiceId}`, onJob);
    expect(wasServed(r), `expected the remittance, got ${r.status}`).toBe(true);
  });
});

describe("a crew cannot reach another crew's things", () => {
  it("refuses another crew's onboarding document", async () => {
    const r = await get(BASE_URL, `/api/sub-document/${onTheJob.documentId}`, offJob);
    expect(wasRefused(r), `served ${onTheJob.company}'s W-9 to ${notOnTheJob.company} (${r.status})`).toBe(true);
  });

  it("refuses another crew's remittance advice", async () => {
    const r = await get(BASE_URL, `/api/remittance/${onTheJob.subInvoiceId}`, offJob);
    expect(
      wasRefused(r),
      `served ${onTheJob.company}'s pay statement ${onTheJob.subInvoiceNumber} to ${notOnTheJob.company} (${r.status})`,
    ).toBe(true);
  });

  it("refuses the map of a job they are not assigned to", async () => {
    const r = await get(BASE_URL, `/api/project-map/${tenant.projectId}`, offJob);
    expect(wasRefused(r), `served the ${tenant.projectName} map to an unassigned crew (${r.status})`).toBe(true);
  });
});

describe("no crew reaches a rate sheet", () => {
  it("refuses their own crew rate sheet endpoint", async () => {
    // What a crew is paid is shown to them in the app; the PDF endpoint is an
    // office tool and a crew has no business at it, their own included.
    const r = await get(BASE_URL, `/api/rate-sheet/${onTheJob.subcontractorId}`, onJob);
    expect(wasRefused(r), `a crew reached the rate-sheet endpoint (${r.status})`).toBe(true);
  });

  it("refuses another crew's rate sheet", async () => {
    const r = await get(BASE_URL, `/api/rate-sheet/${notOnTheJob.subcontractorId}`, onJob);
    expect(wasRefused(r), `a crew reached another crew's rates (${r.status})`).toBe(true);
  });

  it("refuses the project rate sheet, which carries what the customer pays", async () => {
    const r = await get(BASE_URL, `/api/rate-sheet/project/${tenant.projectId}`, onJob);
    expect(wasRefused(r), `a crew reached the customer rate card (${r.status})`).toBe(true);
  });
});

describe("no crew reaches the customer's side of the book", () => {
  it("refuses a customer invoice", async () => {
    const r = await get(BASE_URL, `/api/invoice/${tenant.invoiceId}`, onJob);
    expect(wasRefused(r), `a crew read invoice ${tenant.invoiceNumber} (${r.status})`).toBe(true);
  });
});
