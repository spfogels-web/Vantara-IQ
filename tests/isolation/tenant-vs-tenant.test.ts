/**
 * The boundary that does not exist yet.
 *
 * Every test here is expected to FAIL until Phase 4. That is the point: the
 * suite is written before the migration so it can say precisely what is open,
 * and so the day it turns green is a fact rather than an opinion.
 *
 * Each case is paired. Before asserting that Northgate cannot read something
 * of Barrow's, it asserts that Barrow *can* — because a resource that does not
 * exist answers 404, and a naive test reads that as a refusal and passes while
 * the boundary is wide open. Two of these did exactly that on the first run:
 * the project map and the daily sheet "passed" because the fixture had no map
 * and was passing a Daily id to a route that wants a DailySheet id.
 *
 * So the rule in this file is: prove the door opens for its owner, then prove
 * it is shut for everyone else. A failure in the first half is a broken
 * fixture and says so.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { get, getRendered, pageText, sessionCookie, wasRefused, wasServed, type Reply } from "../support/session";

const f = fixtures();
const northgate = f.a;
const barrow = f.b;

let northgateOffice = "";
let northgateCrew = "";
let barrowOffice = "";

beforeAll(async () => {
  northgateOffice = await sessionCookie(northgate.staffUserId, "ADMIN");
  northgateCrew = await sessionCookie(northgate.crews[0].userId, "SUBCONTRACTOR");
  barrowOffice = await sessionCookie(barrow.staffUserId, "ADMIN");

  // Dev-mode compiles a route on first hit, and a request that arrives mid-
  // compile can come back empty. An empty body contains no other tenant's
  // name, which would let a leak test pass by accident — the flake that showed
  // up between the first two runs of this suite.
  for (const path of ["/", "/subcontractors", `/projects/${barrow.projectId}`]) {
    await get(BASE_URL, path, northgateOffice);
  }
});

/** Prove the owner is served, then prove the neighbour is not. */
async function bothSides(path: string, other: string): Promise<{ owner: Reply; intruder: Reply }> {
  const owner = await get(BASE_URL, path, barrowOffice);
  const intruder = await get(BASE_URL, path, other);
  return { owner, intruder };
}

describe("one contractor's office cannot read another's money", () => {
  it("refuses the other contractor's customer invoice", async () => {
    const { owner, intruder } = await bothSides(`/api/invoice/${barrow.invoiceId}`, northgateOffice);
    expect(wasServed(owner), `fixture problem: ${barrow.orgName} cannot read its own invoice (${owner.status})`).toBe(true);
    expect(
      wasRefused(intruder),
      `${northgate.orgName} read ${barrow.orgName}'s invoice ${barrow.invoiceNumber} (${intruder.status})`,
    ).toBe(true);
  });

  it("refuses the other contractor's crew pay statement", async () => {
    const { owner, intruder } = await bothSides(
      `/api/remittance/${barrow.crews[0].subInvoiceId}`,
      northgateOffice,
    );
    expect(wasServed(owner), `fixture problem: ${barrow.orgName} cannot read its own remittance (${owner.status})`).toBe(true);
    expect(
      wasRefused(intruder),
      `${northgate.orgName} read ${barrow.crews[0].company}'s remittance (${intruder.status})`,
    ).toBe(true);
  });
});

describe("one contractor's office cannot read another's rates", () => {
  it("refuses the other contractor's crew rate sheet", async () => {
    const { owner, intruder } = await bothSides(
      `/api/rate-sheet/${barrow.crews[0].subcontractorId}`,
      northgateOffice,
    );
    expect(wasServed(owner), `fixture problem: ${barrow.orgName} cannot read its own crew rates (${owner.status})`).toBe(true);
    expect(
      wasRefused(intruder),
      `${northgate.orgName} downloaded what ${barrow.orgName} pays ${barrow.crews[0].company} (${intruder.status})`,
    ).toBe(true);
  });

  it("refuses the other contractor's project rate sheet", async () => {
    const { owner, intruder } = await bothSides(
      `/api/rate-sheet/project/${barrow.projectId}`,
      northgateOffice,
    );
    expect(wasServed(owner), `fixture problem: ${barrow.orgName} cannot read its own project rates (${owner.status})`).toBe(true);
    expect(
      wasRefused(intruder),
      `${northgate.orgName} downloaded what ${barrow.orgName} bills ${barrow.customerName} (${intruder.status})`,
    ).toBe(true);
  });
});

describe("one contractor's office cannot read another's field records", () => {
  it("refuses the other contractor's project map", async () => {
    const { owner, intruder } = await bothSides(`/api/project-map/${barrow.projectId}`, northgateOffice);
    expect(wasServed(owner), `fixture problem: ${barrow.orgName} cannot open its own print (${owner.status})`).toBe(true);
    expect(
      wasRefused(intruder),
      `${northgate.orgName} opened the ${barrow.projectName} print (${intruder.status})`,
    ).toBe(true);
  });

  it("refuses the other contractor's daily sheet", async () => {
    const { owner, intruder } = await bothSides(`/api/daily-sheet/${barrow.dailySheetId}`, northgateOffice);
    expect(wasServed(owner), `fixture problem: ${barrow.orgName} cannot read its own sheet (${owner.status})`).toBe(true);
    expect(
      wasRefused(intruder),
      `${northgate.orgName} read a ${barrow.orgName} billing sheet (${intruder.status})`,
    ).toBe(true);
  });

  it("refuses the other contractor's subcontractor document", async () => {
    const { owner, intruder } = await bothSides(
      `/api/sub-document/${barrow.crews[0].documentId}`,
      northgateOffice,
    );
    expect(wasServed(owner), `fixture problem: ${barrow.orgName} cannot read its own crew's W-9 (${owner.status})`).toBe(true);
    expect(
      wasRefused(intruder),
      `${northgate.orgName} read another company's crew's W-9 (${intruder.status})`,
    ).toBe(true);
  });
});

describe("a crew cannot reach the other contractor at all", () => {
  it("refuses the other contractor's crew document", async () => {
    const r = await get(BASE_URL, `/api/sub-document/${barrow.crews[0].documentId}`, northgateCrew);
    expect(wasRefused(r), `a ${northgate.orgName} crew read a ${barrow.orgName} crew's W-9 (${r.status})`).toBe(true);
  });

  it("refuses the other contractor's remittance", async () => {
    const r = await get(BASE_URL, `/api/remittance/${barrow.crews[0].subInvoiceId}`, northgateCrew);
    expect(wasRefused(r), `a ${northgate.orgName} crew read a ${barrow.orgName} pay statement (${r.status})`).toBe(true);
  });
});

describe("pages do not show the other contractor", () => {
  it("does not show the other contractor's project page", async () => {
    const own = await getRendered(BASE_URL, `/projects/${northgate.projectId}`, northgateOffice, northgate.projectName);
    expect(
      own.status === 200 && pageText(own).includes(northgate.projectName),
      `fixture problem: ${northgate.orgName} cannot see its own project page (${own.status})`,
    ).toBe(true);

    const r = await get(BASE_URL, `/projects/${barrow.projectId}`, northgateOffice);
    const leaked = r.status === 200 && pageText(r).includes(barrow.projectName);
    expect(leaked, `${northgate.orgName} loaded the ${barrow.projectName} project page`).toBe(false);
  });

  it("does not put the other contractor's names on the operations center", async () => {
    const r = await getRendered(BASE_URL, "/", northgateOffice, northgate.projectName);
    expect(
      r.status === 200 && pageText(r).includes(northgate.projectName),
      `fixture problem: the dashboard did not render ${northgate.orgName}'s own work (${r.status})`,
    ).toBe(true);

    const leaked = [barrow.projectName, barrow.customerName, barrow.orgName].filter((n) =>
      pageText(r).includes(n),
    );
    expect(leaked, `${barrow.orgName}'s names appeared on ${northgate.orgName}'s dashboard`).toEqual([]);
  });

  it("does not list the other contractor's crews", async () => {
    const r = await getRendered(BASE_URL, "/subcontractors", northgateOffice, northgate.crews[0].company);
    expect(
      r.status === 200 && pageText(r).includes(northgate.crews[0].company),
      `fixture problem: the roster did not render ${northgate.orgName}'s own crews (${r.status})`,
    ).toBe(true);

    const leaked = [barrow.crews[0].company, barrow.crews[1].company].filter((n) => pageText(r).includes(n));
    expect(leaked, `${barrow.orgName}'s crews appeared in ${northgate.orgName}'s roster`).toEqual([]);
  });
});
