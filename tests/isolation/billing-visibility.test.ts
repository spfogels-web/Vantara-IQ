/**
 * Who can see a billing hold, and what they are shown when they can.
 *
 * The arithmetic is proved in billing-readiness.test.ts. This asks the running
 * server the two questions that file cannot: does the crew's own screen reach
 * them at all, and does it carry the customer's money.
 *
 * WE BILL is not WE PAY. A hold is a statement that Fortitude cannot invoice
 * the customer yet; what the crew is owed is a separate question with a
 * separate rate card. Putting the customer figure on the crew's screen would
 * hand a subcontractor our margin on their own work, and it would arrive on the
 * page they open every morning. So the negative assertions below are the point
 * of the file, and the positive one beside each exists to prove the negative is
 * actually looking at a rendered page.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

import { BASE_URL, fixtures } from "../support/load";
import { get, getRendered, pageText, sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

/** On the job. The other crew in the same tenant is not. */
const onTheJob = tenant.crews[0];
const elsewhere = tenant.crews[1];

/**
 * A sentinel in the requirement text.
 *
 * Searching a page for "BFOV12" or "400" finds them in a dozen honest places,
 * so a cross-crew assertion written that way passes whatever the server does.
 * This string exists nowhere else in the fixture.
 */
const SENTINEL = `TICKMARKS-${randomBytes(4).toString("hex").toUpperCase()}`;

/** 1000 FT at the fixture's customer rate of 8.50 — 400 of it held. */
const PRODUCED = 1000;
const HELD = 400;
const HELD_VALUE = HELD * tenant.customerRate; // 3400

let dailyId = "";
let cookies = { crew: "", other: "", staff: "" };

beforeAll(async () => {
  const daily = await db.daily.create({
    data: {
      projectId: tenant.projectId,
      projectName: tenant.projectName,
      customer: tenant.customerName,
      subcontractor: onTheJob.company,
      workDate: "2026-09-21",
      status: "Approved",
      lineItems: [{ code: "BFOV12", quantity: PRODUCED, location: "Keener Rd", unit: "ft" }],
    },
    select: { id: true },
  });
  dailyId = daily.id;

  await db.billingHold.create({
    data: {
      dailyId,
      code: "BFOV12",
      quantity: HELD,
      status: "NEEDS_DOCUMENTATION",
      requirement: SENTINEL,
      missing: [`${SENTINEL} photograph with the count readable`],
      raisedBy: "Test office",
    },
  });

  cookies = {
    crew: await sessionCookie(onTheJob.userId, "SUBCONTRACTOR"),
    other: await sessionCookie(elsewhere.userId, "SUBCONTRACTOR"),
    staff: await sessionCookie(tenant.staffUserId, "ADMIN"),
  };
}, 240_000);

afterAll(async () => {
  await db.billingHold.deleteMany({ where: { dailyId } }).catch(() => undefined);
  await db.daily.delete({ where: { id: dailyId } }).catch(() => undefined);
  await db.$disconnect();
});

describe("the crew can reach their own queue", () => {
  it("is not bounced by middleware", async () => {
    // A missing allowlist entry does not read as forbidden — it reads as the
    // feature not existing, which is how the QC guide went missing for crews.
    const r = await get(BASE_URL, "/billing-readiness", cookies.crew);
    expect(
      r.status,
      `a crew got ${r.status}${r.location ? ` redirecting to ${r.location}` : ""}`,
    ).toBe(200);
  });

  it("is shown the request that is theirs", async () => {
    const r = await getRendered(BASE_URL, "/billing-readiness", cookies.crew, SENTINEL);
    const text = pageText(r);
    expect(text, "the crew cannot see what they are being asked for").toContain(SENTINEL);
    // The quantity affected, which is what they match against their own sheet.
    expect(text).toMatch(/400/);
  });
});

/**
 * The page with its build artifacts taken out.
 *
 * Next.js writes a content hash into asset paths, and those hashes are
 * hexadecimal — so sooner or later one contains the digits of whatever figure a
 * test is looking for. One did: a run failed claiming the crew's page carried
 * 3400, and the next build produced no occurrence at all because the hash had
 * changed. A build artifact cannot carry application data, so removing these
 * paths cannot hide a leak.
 */
function withoutBuildAssets(text: string): string {
  return text.replace(/\/_next\/[^"'\s\\)]*/g, "");
}

/**
 * Does a figure appear as a figure, rather than inside some longer token?
 *
 * Stripping the asset paths was not enough on its own — the digits turned up
 * again, somewhere a second build did not reproduce. Chasing where is the wrong
 * move: a bare four-digit string will always eventually collide with a hash, an
 * id or a timestamp, and a security test that fails at random is one that gets
 * muted.
 *
 * So the question is asked precisely. `3400` surrounded by other alphanumerics
 * is part of something else and means nothing; `"heldAmount":3400` or `$3,400`
 * or `>3400<` is the leak this exists to catch, and all three still match.
 */
function carriesFigure(text: string, figure: string): boolean {
  const escaped = figure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![0-9a-zA-Z])${escaped}(?![0-9a-zA-Z])`).test(text);
}

describe("the crew is not shown the customer's money", () => {
  it("carries no rate, no amount and no invoice", async () => {
    const r = await getRendered(BASE_URL, "/billing-readiness", cookies.crew, SENTINEL);
    const text = withoutBuildAssets(pageText(r));

    // The sentinel is present, so the page rendered and these are real misses.
    expect(text).toContain(SENTINEL);

    for (const figure of [
      String(HELD_VALUE), // 3400
      HELD_VALUE.toLocaleString("en-US"), // 3,400
      `$${HELD_VALUE.toLocaleString("en-US")}`, // $3,400
      tenant.customerRate.toFixed(2), // 8.50
      tenant.invoiceNumber,
    ]) {
      expect(carriesFigure(text, figure), `the crew's page carries ${figure}`).toBe(false);
    }
  });

  it("does not name the customer's own billing vocabulary", async () => {
    const r = await getRendered(BASE_URL, "/billing-readiness", cookies.crew, SENTINEL);
    const text = withoutBuildAssets(pageText(r));
    for (const word of ["Held value", "Customer rate", "gross margin", "billableAmount"]) {
      expect(text, `the crew's page says "${word}"`).not.toContain(word);
    }
  });
});

describe("one crew cannot see another's", () => {
  it("refuses a request on a job they are not on", async () => {
    // Scoped through the assignment table, not through the company name on the
    // daily — renaming a company must not be able to widen this.
    //
    // Waiting on "Nothing outstanding" first, because a page that has not
    // finished rendering contains no other crew's sentinel either, and a
    // half-streamed body would read as a pass. That flake is why the helper
    // exists.
    const r = await getRendered(
      BASE_URL,
      "/billing-readiness",
      cookies.other,
      "Nothing outstanding",
    );
    expect(r.status).toBe(200);
    expect(
      pageText(r),
      "a crew on a different job was shown this request",
    ).not.toContain(SENTINEL);
  });
});

describe("the office queue's window", () => {
  it("keeps a hold that is older than the window", async () => {
    // The queue reads the last 120 days, which is what stops it shipping a year
    // of settled invoices. A quantity stuck behind a photograph since last
    // spring is exactly the row that must not fall off the end of that filter,
    // so the query carries a second clause for it. This is that clause.
    const old = await db.daily.create({
      data: {
        projectId: tenant.projectId,
        projectName: tenant.projectName,
        subcontractor: onTheJob.company,
        workDate: "2024-03-04",
        status: "Approved",
        lineItems: [{ code: "BFOV12", quantity: 250, unit: "ft" }],
      },
      select: { id: true },
    });
    const marker = `${SENTINEL}-STALE`;
    try {
      await db.billingHold.create({
        data: {
          dailyId: old.id,
          code: "BFOV12",
          quantity: 250,
          status: "NEEDS_DOCUMENTATION",
          requirement: marker,
        },
      });
      const r = await getRendered(BASE_URL, "/billing-readiness", cookies.staff, marker);
      expect(pageText(r), "a hold older than the window vanished from the queue").toContain(marker);
    } finally {
      await db.billingHold.deleteMany({ where: { dailyId: old.id } }).catch(() => undefined);
      await db.daily.delete({ where: { id: old.id } }).catch(() => undefined);
    }
  });
});

describe("the office sees the whole picture", () => {
  it("is shown the requirement and what it is holding up", async () => {
    const r = await getRendered(BASE_URL, "/billing-readiness", cookies.staff, SENTINEL);
    const text = pageText(r);
    expect(text, "the office cannot see the requirement").toContain(SENTINEL);
    // The figure the crew must not have, on the screen that exists to show it.
    expect(text, "the office is not shown what the hold is worth").toContain(
      HELD_VALUE.toLocaleString("en-US"),
    );
  });

  it("still shows the production that was reported", async () => {
    // The whole premise: the work is not deleted because the paperwork is late.
    const r = await getRendered(BASE_URL, "/billing-readiness", cookies.staff, SENTINEL);
    expect(pageText(r)).toContain(String(PRODUCED));
  });
});
