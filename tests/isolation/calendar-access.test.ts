/**
 * The calendar is staff-only, and the nav is not what enforces it.
 *
 * Hiding a link is a decoration. The question is what happens when a crew
 * types the address — a subcontractor has no business seeing when another
 * company mobilises, what a customer owes, or when the office is meeting.
 *
 * Two layers refuse them, and it is worth knowing which: the middleware
 * carries an allowlist of the prefixes a subcontractor may reach, so a new
 * route is denied by default and /calendar never had to be added to anything
 * to be shut. The page then checks isStaff on its own account. The first
 * version of this file asserted only that a crew "does not see the calendar",
 * which passed with the page's own gate deleted — the middleware was quietly
 * doing all the work and the test could not tell. These say where the crew
 * actually lands, so removing either layer is visible.
 */
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { get, pageText, sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

let office = "";
let crew = "";

beforeAll(async () => {
  office = await sessionCookie(tenant.staffUserId, "ADMIN");
  crew = await sessionCookie(tenant.crews[0].userId, "SUBCONTRACTOR");
  // Dev compiles a route on first hit, and a request that arrives mid-compile
  // comes back empty — which contains no calendar either, and would pass.
  await get(BASE_URL, "/calendar", office);
}, 240_000);

describe("who can reach the calendar", () => {
  it("serves it to the office", async () => {
    const r = await get(BASE_URL, "/calendar", office);
    expect(r.status, `staff could not open the calendar (${r.status})`).toBe(200);
    // Something only the calendar renders, so a redirect elsewhere fails here.
    expect(pageText(r), "the calendar did not render for staff").toContain("Calendar filters");
  });

  it("sends a crew to their own dailies instead", async () => {
    const r = await get(BASE_URL, "/calendar", crew);
    const body = pageText(r);
    expect(body, "a subcontractor was shown the operations calendar").not.toContain(
      "Calendar filters",
    );
    // Where they land, not merely where they didn't. The helper does not
    // follow redirects, so the body is the destination — which is exactly the
    // assertion worth making: an error page would say something else, and a
    // removed gate would say nothing because it would serve the calendar.
    expect(body.trim(), "a crew was refused but not sent anywhere sensible").toBe("/dailies");
  });

  it("sends a request with no session to sign in", async () => {
    const r = await get(BASE_URL, "/calendar", "");
    const body = pageText(r);
    expect(body, "the calendar rendered for a request with no session").not.toContain(
      "Calendar filters",
    );
    expect(body.trim(), "an anonymous request was not sent to sign in").toMatch(
      /^\/login\?next=/i,
    );
  });

  it("keeps the calendar off the crew's own navigation", async () => {
    const r = await get(BASE_URL, "/dailies", crew);
    expect(pageText(r), "a crew's sidebar offers the calendar").not.toContain("/calendar");
  });

  it("is not on the list of prefixes a subcontractor may reach", async () => {
    // The structural half. The middleware allowlist is what makes a new route
    // closed by default; this fails the day somebody opens it by hand.
    const mw = readFileSync("src/middleware.ts", "utf8");
    const list = /const SUB_ALLOWED_PREFIXES = \[([\s\S]*?)\];/.exec(mw);
    expect(list, "SUB_ALLOWED_PREFIXES is not where this test expects it").not.toBeNull();
    expect(list![1], "/calendar has been added to the subcontractor allowlist").not.toMatch(
      /"\/calendar"/,
    );
  });
});

describe("what the calendar shows", () => {
  it("reads a locate's expiry from the locate, not from a copy", async () => {
    // The point of the derived kinds: the record stays the only source. Move
    // the expiry and the calendar moves with it, because nothing else holds
    // that date.
    const ticket = await db.locateTicket.findFirst({ where: { projectId: tenant.projectId } });
    if (!ticket) return; // some tenants carry none; nothing to prove here

    const when = "2026-09-25";
    await db.locateTicket.update({ where: { id: ticket.id }, data: { expiresOn: when } });

    const r = await get(BASE_URL, `/calendar?month=${when}`, office);
    expect(r.status).toBe(200);
    expect(pageText(r), "the locate's expiry is not on the calendar").toContain(ticket.number);
  });

  it("puts the billing week's Friday on the calendar", async () => {
    // A rule rather than a record, and the rule lives in src/lib/billing.ts,
    // so this cannot drift from what the dailies page enforces.
    // 2026-09-25 is a Friday.
    const r = await get(BASE_URL, "/calendar?month=2026-09-25", office);
    expect(pageText(r), "the billing cutoff is not shown").toContain("Billing week closes");
  });
});
