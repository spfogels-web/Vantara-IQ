/**
 * The contractor's experience: a real invitation, opened in a browser that has
 * never signed in to anything.
 *
 * This reproduces a live production failure. An invitation was emailed to a
 * new subcontractor; the office could open the link and reach onboarding, the
 * contractor could not and saw a server-side exception. Same URL, same token —
 * the only difference was that one request carried a session and the other did
 * not.
 *
 * That asymmetry is the whole bug. The organisation a request reads from comes
 * from a header the middleware sets *from the signed session*, and a visitor
 * with no session gets no header; `resolveOrg()` then throws rather than
 * falling back to a tenant nobody named. The throw is correct — the fallback
 * it replaced would have served a real company's data to an anonymous request.
 * What is missing is that onboarding never tells the system which organisation
 * its invitation belongs to.
 *
 * No existing test could have caught this: the harness signs in before doing
 * anything, so nothing in the suite has ever made a session-less request.
 * These deliberately do.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures, otherTenant } from "../support/load";
import { get, sessionCookie } from "../support/session";
import { TEST_SCHEMA_B, testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

/** A real, unconsumed invitation in tenant A — the kind that gets emailed. */
const TOKEN = `repro-${Math.random().toString(36).slice(2, 10)}`;
let staff = "";

beforeAll(async () => {
  await db.invite.create({
    data: {
      token: TOKEN,
      projectId: tenant.projectId,
      projectName: tenant.projectName,
      customer: tenant.customerName,
    },
  });
  staff = await sessionCookie(tenant.staffUserId, "ADMIN");
}, 60_000);

afterAll(async () => {
  await db.invite.deleteMany({ where: { token: TOKEN } }).catch(() => undefined);
  await db.$disconnect();
});

describe("the asymmetry that produced the production error", () => {
  it("serves the invitation to somebody who is signed in", async () => {
    // The office opening the link they just sent. This is the case that
    // worked, and it worked because the session supplied an organisation.
    const r = await get(BASE_URL, `/invite/${TOKEN}`, staff);
    expect(r.status, `signed-in request got ${r.status}`).toBe(200);
  });

  it("serves the same invitation to a browser with no session", async () => {
    // The contractor. Identical URL, identical token, no cookie — which is
    // every new subcontractor, since they cannot have an account before
    // onboarding creates one.
    const r = await get(BASE_URL, `/invite/${TOKEN}`);
    // Assert what must be TRUE, not the absence of one error string. The
    // first version of this checked only that "Application error" was missing
    // and passed against a page that had plainly failed: the server flushes
    // the shell before the failure happens, so the status is 200 either way,
    // and dev renders a different fallback than production does. The only
    // honest assertion is that onboarding actually rendered.
    expect(r.body, "anonymous visitor did not reach onboarding").toMatch(/invited by/i);
  });
});

describe("an invitation that is not real gets nothing", () => {
  it("refuses a token that exists in no tenant", async () => {
    // The fix must not turn "look for this token everywhere" into "let anyone
    // in". A token nobody issued resolves to no organisation, and the page
    // says so without ever reading a tenant's data.
    const r = await get(BASE_URL, `/invite/not-a-real-token-at-all`);
    expect(r.status).toBeLessThan(500);
    expect(r.body).not.toMatch(/Application error|server-side exception/i);
  });

  it("refuses an empty token", async () => {
    const r = await get(BASE_URL, `/invite/%20`);
    expect(r.status).toBeLessThan(500);
  });
});

describe("anonymous requests reach nothing else", () => {
  // The point of the fix is to open one door, not to weaken the building. If
  // any of these start succeeding, the anonymous fallback has come back.
  for (const path of ["/projects", "/dailies", "/subcontractors", "/invoicing"]) {
    it(`still refuses ${path} without a session`, async () => {
      const r = await get(BASE_URL, path);
      expect([301, 302, 307, 308], `${path} returned ${r.status}`).toContain(r.status);
      expect(r.location ?? "").toMatch(/\/login/);
    });
  }
});

describe("the invitation decides, not the browser", () => {
  it("does not let a signed-in session change which organisation the invite acts on", async () => {
    // The asymmetry that hid this bug for a release: the office could open the
    // link because their session happened to supply an organisation. If the
    // session is what makes it work, the fix is an illusion — so the same
    // invitation must resolve to the same organisation whether the browser is
    // clean or carries somebody's admin cookie.
    const anon = await get(BASE_URL, `/invite/${TOKEN}`);
    const admin = await get(BASE_URL, `/invite/${TOKEN}`, staff);

    expect(anon.body, "anonymous visitor did not reach onboarding").toMatch(/invited by/i);
    expect(admin.body, "signed-in visitor did not reach onboarding").toMatch(/invited by/i);

    // Both must name the project the invitation is for. A session that
    // silently redirected the read to its own organisation would show
    // something else, or nothing.
    expect(anon.body).toContain(tenant.projectName);
    expect(admin.body).toContain(tenant.projectName);
  });
});

describe("a token from one tenant cannot act on another", () => {
  it("does not resolve tenant B's invitation into tenant A", async () => {
    // Discovery searches every organisation, which is what makes a bare token
    // work at all. The risk it introduces is that a token found anywhere might
    // be honoured everywhere — so an invitation issued by the other tenant
    // must reach the other tenant's data, and never this one's.
    const other = otherTenant();
    const b = testClient(TEST_SCHEMA_B);
    const bToken = `repro-b-${Math.random().toString(36).slice(2, 10)}`;
    try {
      await b.invite.create({
        data: { token: bToken, projectName: "B-only project", customer: "B-only customer" },
      });
      const r = await get(BASE_URL, `/invite/${bToken}`);
      // It resolves — it is a real invitation — but to B's data only.
      expect(r.body).not.toContain(tenant.projectName);
      expect(r.body).not.toContain(tenant.customerName);
      void other;
    } finally {
      await b.invite.deleteMany({ where: { token: bToken } }).catch(() => undefined);
      await b.$disconnect();
    }
  });
});
