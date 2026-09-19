/**
 * Step 3: the organisation on the session, and what happens when it isn't.
 *
 * Everything here goes over HTTP against the real server, because the three
 * layers that decide which company's data comes back — middleware reading the
 * token, the proxy choosing a connection, the page rendering what it got — are
 * only all present in an actual request. A unit test of any one of them would
 * pass while the other two disagreed.
 *
 * The second organisation is a whole contractor of its own, in its own schema,
 * with no name or number in common with the first. That is what makes the
 * round trip provable: if the switcher did nothing at all, the screens would
 * be identical, and identical is exactly what these tests refuse to accept.
 */
import { describe, expect, it } from "vitest";

import { BASE_URL, fixtures, otherTenant } from "../support/load";
import { get, legacySessionCookie, pageText, sessionCookie } from "../support/session";

const f = fixtures();
const other = otherTenant();
const northgate = f.a;

/** The office of the first contractor, who is also this deployment's operator. */
const staff = () => sessionCookie(northgate.staffUserId, "OFFICE");
/** The same person, having switched. Exactly what the switcher re-signs. */
const staffInOther = () => sessionCookie(northgate.staffUserId, "OFFICE", "apex");

/** Names that only exist in one of the two databases. */
const FIRST_NAMES = [
  northgate.customerName,
  northgate.projectName,
  northgate.crews[0].company,
  northgate.crews[1].company,
  northgate.invoiceNumber,
];
const OTHER_NAMES = [
  other.customerName,
  other.projectName,
  other.crews[0].company,
  other.crews[1].company,
  other.invoiceNumber,
];

/** The screens the blueprint names: projects, customers, crews, invoices, dailies. */
const SCREENS = ["/projects", "/customers", "/subcontractors", "/invoicing", "/dailies"];

/** Names, which render as text — and whose counts hold still between renders. */
const NAMES = [...FIRST_NAMES, ...OTHER_NAMES];

/** Record ids, which also ride along in serialized props. See `fingerprint`. */
const IDS = [
  northgate.projectId,
  northgate.customerId,
  northgate.invoiceId,
  northgate.dailyId,
  other.projectId,
  other.customerId,
  other.invoiceId,
  other.dailyId,
];

/**
 * What a page is *of* — names counted, ids only looked for.
 *
 * Counting everything is what this used to do, and it could not work. A marker
 * is counted across the whole reply, which includes the RSC flight payload,
 * and that payload does not hold still: reading /dailies six times as one
 * person, with no switching at all, counted the project id 5, 5, 7, 7, 5, 7.
 * The two that come and go are a single serialized prop — `{id, mapUrl,
 * hasMap}` — carried once escaped inside `self.__next_f.push` and again in the
 * copy pageText reassembles. So the assertion was a coin toss, and it failed
 * on whichever screen lost.
 *
 * Narrowing to the rendered markup was the obvious repair and it is a trap:
 * the `<main>` slice carries none of these markers on any of the five screens,
 * because the lists stream in behind Suspense and land after `</main>`; and
 * stripping the payload instead leaves /customers empty, because that list
 * renders on the client. Either one compares nothing to nothing and passes.
 *
 * So: names are counted, because a row that disappears after the round trip is
 * exactly what this test exists to catch, and every name count was steady
 * across five reads of all five screens. Ids are only checked for presence,
 * because the id is the one quantity measurement showed to be unstable, and
 * how many times React repeats it in a payload is not a fact about the switch.
 */
function fingerprint(text: string): { names: Record<string, number>; ids: string[] } {
  const names: Record<string, number> = {};
  for (const n of NAMES) {
    const c = text.split(n).length - 1;
    if (c) names[n] = c;
  }
  return { names, ids: IDS.filter((id) => text.includes(id)) };
}

/**
 * A page, read once it has settled.
 *
 * The suite runs against `next dev`, which compiles a route on first request
 * and streams the result — so two reads of the same URL seconds apart can
 * legitimately carry different amounts of the page. Reading until two
 * consecutive reads agree about what is on it measures the finished page
 * rather than the compiler.
 *
 * Settling is judged on the same fingerprint the round trip compares, so the
 * loop is waiting for something that can actually hold still. Waiting on raw
 * counts meant waiting on the flight payload, which never does — it simply
 * declared victory on whichever pair of reads happened to match.
 */
async function textOf(path: string, cookie: string, attempts = 6): Promise<string> {
  let previous = "";
  let previousPrint = "";
  for (let i = 0; i < attempts; i++) {
    const r = await get(BASE_URL, path, cookie);
    expect(
      r.status,
      `${path} did not render (${r.status} → ${r.location ?? "no redirect"})`,
    ).toBe(200);
    const text = pageText(r);
    const print = JSON.stringify(fingerprint(text));
    if (i > 0 && print === previousPrint) return text;
    previous = text;
    previousPrint = print;
    await new Promise((r) => setTimeout(r, 600));
  }
  return previous;
}

describe("the switch round trip", () => {
  it("changes every screen, and changes them back", async () => {
    const before: Record<string, string> = {};
    const during: Record<string, string> = {};
    const after: Record<string, string> = {};

    for (const screen of SCREENS) before[screen] = await textOf(screen, await staff());
    for (const screen of SCREENS) during[screen] = await textOf(screen, await staffInOther());
    for (const screen of SCREENS) after[screen] = await textOf(screen, await staff());

    for (const screen of SCREENS) {
      // Present before, gone during.
      const ownBefore = FIRST_NAMES.filter((n) => before[screen].includes(n));
      const ownDuring = FIRST_NAMES.filter((n) => during[screen].includes(n));
      expect(
        ownDuring,
        `${screen} still showed the first contractor's ${ownDuring.join(", ")} after switching`,
      ).toEqual([]);

      // And the other way: the second contractor's names appear only during.
      const otherBefore = OTHER_NAMES.filter((n) => before[screen].includes(n));
      expect(
        otherBefore,
        `${screen} showed the other contractor's ${otherBefore.join(", ")} before switching`,
      ).toEqual([]);

      // The round trip itself, compared by what the page is *of* rather than
      // byte for byte: two identical consecutive requests already differ, in
      // a render timestamp inside the RSC payload. Comparing raw bytes would
      // be a test of Next's streaming, not of the switcher.
      const printBefore = fingerprint(before[screen]);
      expect(
        fingerprint(after[screen]),
        `${screen} did not come back the same after switching away and back`,
      ).toEqual(printBefore);

      // A screen that was empty all along would satisfy everything above.
      expect(
        ownBefore.length,
        `fixture problem: ${screen} shows none of the first contractor's names, so this test proves nothing`,
      ).toBeGreaterThan(0);

      // And so would a fingerprint with nothing counted in it. This guard is
      // what caught the two repairs that looked green and measured nothing.
      expect(
        Object.keys(printBefore.names).length,
        `${screen} carried none of the watched names, so comparing it before and after proves nothing`,
      ).toBeGreaterThan(0);
    }
    // Five screens, read three times each, against a dev server compiling
    // routes on demand. The default minute is not enough and shortening the
    // work to fit it would mean testing fewer screens.
  }, 240_000);

  it("shows the other contractor's own data while switched, not an empty screen", async () => {
    const seen = await textOf("/projects", await staffInOther());
    expect(
      seen.includes(other.projectName),
      `switched to the other organisation but ${other.projectName} was not on the projects page`,
    ).toBe(true);
  });
});

describe("no name crosses between the two", () => {
  it("shows nothing of the first contractor while in the second, or the reverse", async () => {
    for (const screen of SCREENS) {
      const inFirst = await textOf(screen, await staff());
      const inOther = await textOf(screen, await staffInOther());

      for (const name of OTHER_NAMES) {
        expect(inFirst.includes(name), `"${name}" leaked into ${screen} of the first`).toBe(false);
      }
      for (const name of FIRST_NAMES) {
        expect(inOther.includes(name), `"${name}" leaked into ${screen} of the second`).toBe(false);
      }
    }
  });
});

describe("a record of the other organisation cannot be fetched by id", () => {
  const byId = [
    ["invoice", (t: typeof northgate) => `/api/invoice/${t.invoiceId}`],
    ["daily sheet", (t: typeof northgate) => `/api/daily-sheet/${t.dailySheetId}`],
    ["project map", (t: typeof northgate) => `/api/project-map/${t.projectId}`],
    ["rate sheet", (t: typeof northgate) => `/api/rate-sheet/project/${t.projectId}`],
  ] as const;

  for (const [what, path] of byId) {
    it(`refuses the first contractor's ${what} while switched away`, async () => {
      // Paired: the same id must work from its own side, or a 404 here would
      // only mean the fixture was wrong.
      const own = await get(BASE_URL, path(northgate), await staff());
      const across = await get(BASE_URL, path(northgate), await staffInOther());

      expect(own.status, `the first contractor could not read their own ${what}`).toBe(200);
      expect(
        across.status,
        `the first contractor's ${what} was served while switched to another organisation`,
      ).not.toBe(200);
    });
  }
});

describe("a session with no organisation", () => {
  it("is sent to sign in rather than assumed to mean Fortitude", async () => {
    const old = await legacySessionCookie(northgate.staffUserId, "OFFICE");
    const r = await get(BASE_URL, "/projects", old);

    expect(r.status, "a token with no organisation was accepted").toBe(307);
    expect(r.location ?? "", "it was not sent to sign in").toContain("/login");
  });

  it("cannot be repaired by sending the header by hand", async () => {
    // The whole design rests on the organisation coming from a signed token.
    // If an inbound header were trusted, this would be a complete bypass.
    const old = await legacySessionCookie(northgate.staffUserId, "OFFICE");
    const r = await fetch(`${BASE_URL}/projects`, {
      redirect: "manual",
      headers: { cookie: old, "x-vq-org": "apex" },
    });
    expect(r.status, "a hand-written organisation header got past middleware").toBe(307);
  });
});

describe("the organisation header is never taken from the client", () => {
  it("ignores it on a request that is otherwise legitimate", async () => {
    const r = await fetch(`${BASE_URL}/projects`, {
      redirect: "manual",
      headers: { cookie: await staff(), "x-vq-org": "apex" },
    });
    expect(r.status).toBe(200);
    const body = pageText({ status: r.status, location: null, body: await r.text() });

    expect(
      body.includes(northgate.projectName),
      "a valid session stopped seeing its own data because a header was sent",
    ).toBe(true);
    expect(
      body.includes(other.projectName),
      "the inbound x-vq-org header was honoured — this is a complete tenancy bypass",
    ).toBe(false);
  });
});

describe("the doors that open without a session", () => {
  /**
   * Removing the fallback means anything reaching the database without a
   * session now throws instead of quietly reading Fortitude. That is the
   * point — but it also means every such door had to be found and given an
   * organisation of its own, and a door that was missed does not fail at
   * build time. It fails the first time a real person opens it.
   */
  it("still serves the marketing page to a visitor with no session", async () => {
    const r = await get(BASE_URL, "/", undefined);
    expect(r.status, "the public homepage broke for anonymous visitors").toBe(200);
  });

  // These two look the document up in the database. The fixtures seed no
  // operative documents, so "not found" is the correct answer here — what is
  // being checked is that the route reached a database at all and answered,
  // rather than throwing for want of an organisation.
  it("still reaches a database for the blank subcontractor agreement", async () => {
    const r = await get(BASE_URL, "/api/agreement", undefined);
    expect([200, 404], `the agreement route failed with ${r.status}`).toContain(r.status);
  });

  it("still reaches a database for the mutual NDA", async () => {
    const r = await get(BASE_URL, "/api/nda", undefined);
    expect([200, 404], `the NDA route failed with ${r.status}`).toContain(r.status);
  });

  it("still serves the sign-in page", async () => {
    const r = await get(BASE_URL, "/login", undefined);
    expect(r.status).toBe(200);
  });
});

describe("who may switch", () => {
  it("offers the second organisation to the platform operator", async () => {
    const body = await textOf("/projects", await staff());
    expect(
      body.includes("Apex Construction Group"),
      "the operator was not offered the other organisation in the account card",
    ).toBe(true);
  });

  it("offers nothing to a staff account that is not on the allowlist", async () => {
    // Same role, same everything, different email. The only thing separating
    // them is PLATFORM_ADMIN_EMAILS.
    const body = await textOf("/projects", await sessionCookie(f.b.staffUserId, "OFFICE"));
    expect(
      body.includes("Apex Construction Group"),
      "a contractor's own admin was offered another company's workspace",
    ).toBe(false);
  });

  it("offers nothing to a crew", async () => {
    const crew = northgate.crews[0];
    const body = await textOf("/dailies", await sessionCookie(crew.userId, "SUBCONTRACTOR"));
    expect(body.includes("Apex Construction Group")).toBe(false);
  });
});
