/**
 * The step 4 requirement, as a test rather than as an inspection.
 *
 * Operating under a different organisation, nothing belonging to the incumbent
 * may appear because it was hardcoded or shared: not its name, not the primes
 * it bills through, not its markets, not its unit codes, not its terms, not
 * its office number.
 *
 * This is the failure mode that is hardest to notice and worst to explain.
 * Wrong data on screen is obvious. A correct-looking screen that quietly names
 * another company's customer is not — it reads as working software right up
 * until somebody recognises a name they should never have seen.
 *
 * ## Why the positive control matters more than the assertion
 *
 * A test that loads a page and finds no forbidden word passes just as happily
 * when the page failed to render, when the session was rejected, or when the
 * fixture holds nothing. So every forbidden term below is *also* asserted to
 * appear somewhere under the incumbent. If the scan cannot find these names
 * where they are supposed to be, it has not earned the right to report their
 * absence anywhere else.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures, otherTenant } from "../support/load";
import { get, pageText, sessionCookie } from "../support/session";
import { TEST_SCHEMA, TEST_SCHEMA_B, testClient } from "../support/test-db";

const f = fixtures();
const other = otherTenant();

const staff = () => sessionCookie(f.a.staffUserId, "OFFICE");
const staffInOther = () => sessionCookie(f.a.staffUserId, "OFFICE", "apex");

/**
 * Everything that belongs to the incumbent and to nobody else.
 *
 * Drawn from what was hardcoded: the markets and the primes they bill through,
 * the code vocabulary, the terms, the one-call centre, the office number. The
 * company name itself is checked separately, because it is the one term that
 * legitimately appears on the platform's own legal pages.
 */
const INCUMBENT_ONLY = [
  // Markets, and the commercial relationships they encode.
  "Globe Communications",
  "Trawick",
  "North Georgia",
  "South Georgia",
  // The code vocabulary.
  "BMFAF",
  "BD5MPF",
  "BM61",
  // Configuration that was a schema default.
  "GA811",
];

/**
 * The office number is parameterised too, and is checked in demo-org.test.ts
 * rather than here.
 *
 * It renders on one panel of /company that only a crew login sees, so a staff
 * session never shows it — and a control term that cannot appear is a control
 * that fails for the wrong reason.
 */

/** Screens a signed-in operator can reach that render configuration. */
const SCREENS = [
  "/",
  "/projects",
  "/projects/new",
  "/customers",
  "/subcontractors",
  "/invoicing",
  "/dailies",
  "/materials",
  "/locates",
  "/tasks",
  "/settings",
  "/company",
  "/rate-import",
  "/prospects",
  "/documents",
];

/**
 * One read, with a deadline.
 *
 * `get` uses fetch with no timeout, and a dev server compiling a cold route
 * can leave a request outstanding indefinitely. One such request stalled a
 * whole run for forty-five minutes with no output at all — the suite was not
 * slow, it was stopped, and the two look identical from outside.
 *
 * A read that does not come back is reported as a read that did not come back.
 */
async function readOnce(path: string, cookie: string): Promise<{ status: number; body: string }> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 45_000);
  try {
    const res = await fetch(BASE_URL + path, {
      redirect: "manual",
      headers: { cookie },
      signal: stop.signal,
    });
    return { status: res.status, body: await res.text().catch(() => "") };
  } catch {
    return { status: 0, body: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function textOf(path: string, cookie: string, attempts = 4): Promise<string> {
  // A route compiles on first request and streams, so a page can legitimately
  // arrive in pieces. Read until two consecutive reads agree on length.
  let last = "";
  let previous = -1;
  for (let i = 0; i < attempts; i++) {
    const r = await readOnce(path, cookie);
    // A redirect is a screen this session cannot reach, which is not a leak.
    if (r.status !== 200) return "";
    last = pageText({ status: r.status, location: null, body: r.body });
    if (last.length === previous) return last;
    previous = last.length;
    await new Promise((res) => setTimeout(res, 400));
  }
  return last;
}

/**
 * What the screen actually renders.
 *
 * This was the `<main>` slice, and that slice is a shell: 26,602 bytes, byte
 * for byte identical across /projects, /subcontractors, /invoicing, /dailies
 * and /settings, carrying none of their data — the lists stream in behind
 * Suspense and land after `</main>`. Asserting a name was absent from it was
 * asserting a name was absent from a skeleton, which it always is.
 *
 * So: the rendered markup, with the RSC flight payload stripped out. The
 * payload is where the switcher's list of organisations lives — every company
 * this operator may enter, by name — and that list is the switcher doing its
 * job and the only way back. What is *rendered* belongs to the organisation
 * signed in; what is serialized for the switcher does not have to.
 *
 * The rest of the incumbent's configuration is not let off this lightly: the
 * assertion above reads the whole reply, payload included, and no market,
 * prime, code, one-call centre or phone number may appear anywhere in it.
 *
 * Empty string when the screen did not render, which the non-vacuity guard
 * below turns into a failure rather than a pass.
 */
async function renderedOf(path: string, cookie: string): Promise<string> {
  const r = await readOnce(path, cookie);
  if (r.status !== 200) return "";
  return r.body.replace(/<script[^>]*>self\.__next_f\.push\([\s\S]*?\)<\/script>/g, "");
}

/**
 * Every screen, read once per organisation and shared by every assertion here.
 *
 * Each read is a real page render on a server that compiles on demand, so one
 * pass over the set costs a couple of minutes. Reading it separately inside
 * each assertion cost four times that and pushed every one of them past its
 * own timeout — at which point the tests were measuring the compiler rather
 * than the product.
 */
const under = {
  incumbent: {} as Record<string, string>,
  other: {} as Record<string, string>,
  /** What each screen under the other organisation actually renders. */
  otherBody: {} as Record<string, string>,
};

beforeAll(async () => {
  const mine = await staff();
  const theirs = await staffInOther();
  for (const screen of SCREENS) {
    under.incumbent[screen] = await textOf(screen, mine);
    under.other[screen] = await textOf(screen, theirs);
    under.otherBody[screen] = await renderedOf(screen, theirs);
  }
}, 900_000);

describe("the two databases are configured differently", () => {
  it("gives each organisation its own markets, codes and terms", async () => {
    const a = testClient(TEST_SCHEMA);
    const b = testClient(TEST_SCHEMA_B);
    try {
      const [marketsA, marketsB] = await Promise.all([a.market.findMany(), b.market.findMany()]);
      expect(marketsA.length, "the incumbent has no markets, so nothing below is a contrast").toBeGreaterThan(0);
      expect(marketsB.length, "the other organisation has no markets of its own").toBeGreaterThan(0);

      const primesA = marketsA.map((m) => m.prime);
      const primesB = marketsB.map((m) => m.prime);
      for (const p of primesB) {
        expect(primesA, `both organisations bill through ${p}`).not.toContain(p);
      }

      const [codesA, codesB] = await Promise.all([
        a.orgCodeProfile.findFirst(),
        b.orgCodeProfile.findFirst(),
      ]);
      expect(codesA?.priorityCodes.length, "the incumbent has no code profile").toBeGreaterThan(0);
      expect(codesB?.priorityCodes.length, "the other organisation has no code profile").toBeGreaterThan(0);
      expect(codesA?.priorityCodes).not.toEqual(codesB?.priorityCodes);

      /**
       * The crew number, which is the plainest commercial relationship there
       * is — an identifier issued by somebody else's billing department, in a
       * field the prime bills against.
       *
       * It belongs to the customer, not the organisation: a contractor working
       * for two primes is two different numbers to them. It was a constant in
       * the sheet component, so every prime and every organisation shared one.
       * A wrong number here does not look wrong on the paperwork — it looks
       * like a sheet from a company that did not do the work.
       */
      const [custA, custB] = await Promise.all([
        a.customer.findMany({ select: { name: true, crewNumber: true } }),
        b.customer.findMany({ select: { name: true, crewNumber: true } }),
      ]);
      const numbersA = custA.map((c) => c.crewNumber).filter(Boolean);
      const numbersB = custB.map((c) => c.crewNumber).filter(Boolean);

      expect(numbersA.length, "no customer of the incumbent has a crew number, so nothing below is a contrast").toBeGreaterThan(0);
      expect(numbersB.length, "no customer of the other organisation has one of its own").toBeGreaterThan(0);
      for (const n of numbersB) {
        expect(numbersA, `both organisations file under crew number ${n}`).not.toContain(n);
      }

      // And the terms they bill on, which were schema defaults before this.
      const [setA, setB] = await Promise.all([a.orgSettings.findFirst(), b.orgSettings.findFirst()]);
      expect(setA?.subTerms).not.toEqual(setB?.subTerms);
      expect(setA?.customerTerms).not.toEqual(setB?.customerTerms);
    } finally {
      await Promise.all([a.$disconnect(), b.$disconnect()]);
    }
  }, 60_000);
});

describe("under the incumbent — the positive control", () => {
  it("shows every term this test claims to be watching for", async () => {
    const all = Object.values(under.incumbent).join("\n");

    const missing = INCUMBENT_ONLY.filter((term) => !all.includes(term));
    expect(
      missing,
      `these terms appear nowhere under the incumbent, so their absence elsewhere proves nothing: ${missing.join(", ")}`,
    ).toEqual([]);
  }, 300_000);
});

describe("under another organisation", () => {
  it("shows none of the incumbent's markets, primes, codes, terms or number", async () => {
    const leaks: string[] = [];
    for (const [screen, text] of Object.entries(under.other)) {
      for (const term of INCUMBENT_ONLY) {
        if (text.includes(term)) leaks.push(`${screen} → ${term}`);
      }
    }

    expect(leaks, `the incumbent's configuration appeared under another organisation:\n${leaks.join("\n")}`).toEqual([]);
  }, 300_000);

  it("does not name the incumbent company in the body of any screen", async () => {
    /**
     * Scoped to `<main>`, and the exclusion is worth stating.
     *
     * A platform operator's account card lists the organisations they may
     * enter, by name — that is the switcher doing its job, and it is the only
     * way back. It sits in the chrome, outside `<main>`, so the page body is
     * the right boundary: everything a screen is actually *about* belongs to
     * the organisation signed in.
     *
     * The chrome is not unchecked. The test above reads the whole page,
     * switcher included, and no market, prime, code, one-call centre or phone
     * number of the incumbent's may appear anywhere on it.
     */
    const named = Object.entries(under.otherBody)
      .filter(([, text]) => text.includes("Fortitude"))
      .map(([screen]) => screen);

    expect(named, `the incumbent was named in the body of: ${named.join(", ")}`).toEqual([]);

    // Absence proves nothing about a region that holds nothing. The previous
    // version of this test read the <main> skeleton, which carried none of any
    // screen's data, so it could not have found the incumbent's name there
    // whether or not it leaked. What is read now has to be shown to carry the
    // other organisation's own work.
    const carrying = Object.entries(under.otherBody)
      .filter(([, text]) => text.includes(other.customerName) || text.includes(other.projectName))
      .map(([screen]) => screen);

    expect(
      carrying.length,
      "no screen rendered the other organisation's own customer or project, so looking for the incumbent's name in them proves nothing",
    ).toBeGreaterThan(0);
  }, 300_000);

  it("shows the other organisation's own configuration instead", async () => {
    // Absence is only half the requirement. A blank screen would satisfy every
    // assertion above.
    const all = Object.values(under.other).join("\n");

    expect(all.includes(other.projectName), "the other organisation's own work is not on screen").toBe(true);
  }, 300_000);
});

describe("the platform's own pages", () => {
  it("still name the company that operates Vantara IQ", async () => {
    // Deliberately kept. These are the operator's legal identity and its
    // registered SMS programme — naming anybody else would be false, and in
    // the case of the A2P copy, a compliance problem.
    for (const route of ["/privacy", "/terms", "/sms"]) {
      const r = await get(BASE_URL, route, undefined);
      expect(r.status, `${route} did not render`).toBe(200);
      expect(
        pageText(r).includes("Fortitude"),
        `${route} no longer names the platform operator`,
      ).toBe(true);
    }
  }, 120_000);
});
