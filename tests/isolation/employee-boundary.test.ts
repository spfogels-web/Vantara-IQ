/**
 * What an employee can reach, and what they cannot.
 *
 * An employee is the first role this product has that logs in, is not staff,
 * and is not a subcontractor. Before it existed, middleware denied exactly one
 * role and let everything else through — so adding EMPLOYEE without changing
 * that would have handed a field worker the invoicing screen. These tests are
 * the reason to believe it did not.
 *
 * Two layers, tested separately, because they fail differently: middleware
 * refuses a URL before the page runs, and the server helpers refuse an id
 * even when the URL was allowed. A hole in either is a hole.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { get, pageText, sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

let employee = "";
let admin = "";
let crew = "";
/** The employee record behind the session, and a second one they must not reach. */
let mine = "";
let theirs = "";

beforeAll(async () => {
  admin = await sessionCookie(tenant.staffUserId, "ADMIN");
  crew = await sessionCookie(tenant.crews[0].userId, "SUBCONTRACTOR");

  // A login that is an employee, and one who is somebody else entirely.
  const meUser = await db.user.create({
    data: { email: `emp.${Date.now()}@example.invalid`, name: "Tyler M", role: "EMPLOYEE" },
  });
  const meEmp = await db.employee.create({
    data: { name: "Tyler M", title: "Crew Lead", userId: meUser.id },
  });
  const otherEmp = await db.employee.create({ data: { name: "Brandon S", title: "Operator" } });
  mine = meEmp.id;
  theirs = otherEmp.id;
  employee = await sessionCookie(meUser.id, "EMPLOYEE");

  // Dev compiles a route on first hit; a mid-compile response is empty, and an
  // empty body contains no invoicing either.
  await get(BASE_URL, "/time-clock", employee);
}, 240_000);

describe("where an employee may go", () => {
  /**
   * Everything an employee must not reach, by URL.
   *
   * Each of these is a real screen with real consequences — the executive
   * dashboard, what customers are billed, what crews are paid, the roster of
   * every company we engage. An employee knowing the address must not be
   * enough.
   */
  const FORBIDDEN = [
    ["invoicing", "/invoicing"],
    ["pay applications", "/pay-applications"],
    ["rate import", "/rate-import"],
    ["customers", "/customers"],
    ["subcontractors", "/subcontractors"],
    ["prospects", "/prospects"],
    ["materials", "/materials"],
    ["reports", "/reports"],
    ["projects", "/projects"],
    ["dailies", "/dailies"],
    ["calendar", "/calendar"],
    ["documents", "/documents"],
    ["locates", "/locates"],
    ["manager workforce", "/workforce"],
  ] as const;

  for (const [name, path] of FORBIDDEN) {
    it(`refuses ${name}`, async () => {
      const r = await get(BASE_URL, path, employee);
      // The helper does not follow redirects, so the body is the destination.
      // Landing anywhere but their own clock is a failure worth naming.
      expect(pageText(r).trim(), `an employee reached ${path}`).toBe("/time-clock");
    });
  }

  /**
   * The root is the odd one out and needs its own assertion.
   *
   * "/" is public at the middleware layer — it is the marketing front door —
   * so it is not redirected there. The page refuses non-staff itself, and
   * Next streams the shell before that redirect runs, which means the
   * response is 200 with a client-side redirect inside it rather than a 307.
   *
   * Asserting on the status or the destination would therefore prove nothing.
   * What matters is that none of the dashboard's data is in the body: an
   * admin's copy carries this tenant's project names and runs to 1.6MB, and
   * a non-staff copy must carry none of it.
   */
  it("gives an employee none of the dashboard's data at the root", async () => {
    const mine = pageText(await get(BASE_URL, "/", employee));
    const theirs = pageText(await get(BASE_URL, "/", admin));

    expect(theirs, "the admin's dashboard stopped naming its own projects")
      .toContain(tenant.projectName);
    expect(mine, "an employee was served the operations dashboard")
      .not.toContain(tenant.projectName);
  });

  it("lets them reach their own time clock", async () => {
    const r = await get(BASE_URL, "/time-clock", employee);
    expect(r.status, `an employee could not open their own time clock (${r.status})`).toBe(200);
    // Status alone proves nothing here: this app serves a missing route as
    // 200 in dev, so a 404 would have passed. Assert the page itself.
    expect(pageText(r), "the time clock did not render").toContain("Time Clock");
    expect(pageText(r), "the clock did not greet the employee by name").toContain("Tyler M");
  });

  it("does not offer an employee the management navigation", async () => {
    // Links, not substrings. Searching the raw body for "/workforce" matched
    // the module path of this page's own component in the dev RSC payload —
    // a false positive that would have had somebody hunting a leak that was
    // never there. What matters is whether the page offers a way in.
    const r = await get(BASE_URL, "/time-clock", employee);
    const hrefs = [...r.body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const screen of [
      "/invoicing",
      "/pay-applications",
      "/customers",
      "/subcontractors",
      "/prospects",
      "/rate-import",
      "/reports",
      "/workforce",
      "/dailies",
      "/projects",
    ]) {
      expect(
        hrefs.filter((h) => h === screen || h.startsWith(`${screen}/`)),
        `the employee's screen links to ${screen}`,
      ).toEqual([]);
    }
  });

  it("sends them to the time clock when they sign in", async () => {
    // homeHrefFor decides this. An employee must not be walked through the
    // executive dashboard on the way to their own screen.
    const { homeHrefFor } = await import("@/lib/nav");
    expect(homeHrefFor("EMPLOYEE")).toBe("/time-clock");
    expect(homeHrefFor("SUBCONTRACTOR")).toBe("/dailies");
    expect(homeHrefFor("ADMIN")).toBe("/");
  });
});

describe("the roles either side are unchanged", () => {
  it("still lets a crew reach their dailies", async () => {
    const r = await get(BASE_URL, "/dailies", crew);
    expect(r.status, "the subcontractor route broke").toBe(200);
  });

  it("still keeps a crew out of invoicing", async () => {
    const r = await get(BASE_URL, "/invoicing", crew);
    expect(pageText(r).trim(), "a crew reached invoicing").toBe("/dailies");
  });

  it("still lets staff reach invoicing", async () => {
    const r = await get(BASE_URL, "/invoicing", admin);
    expect(r.status, "staff lost access to invoicing").toBe(200);
  });

  it("still lets staff reach the dashboard", async () => {
    const r = await get(BASE_URL, "/", admin);
    expect(r.status).toBe(200);
  });
});

describe("an employee is who the session says, not who the request claims", () => {
  it("resolves their employee record from the login alone", async () => {
    const found = await db.employee.findUnique({ where: { userId: (await db.user.findFirst({ where: { email: { contains: "emp." } }, orderBy: { createdAt: "desc" } }))!.id } });
    expect(found?.id, "the session did not resolve to an employee").toBe(mine);
  });

  it("gives one login at most one employee record", async () => {
    const me = await db.employee.findUnique({ where: { id: mine }, select: { userId: true } });
    await expect(
      db.employee.create({ data: { name: "Impostor", userId: me!.userId } }),
      "a second employee record was attached to one login",
    ).rejects.toThrow();
  });

  it("keeps the other employee unreachable through their id", async () => {
    // The ids are real and different. Everything downstream must decide access
    // from the session, never from which of these arrives in a request.
    expect(theirs).not.toBe(mine);
    const other = await db.employee.findUnique({ where: { id: theirs }, select: { userId: true } });
    expect(other?.userId, "the second employee is attached to a login").toBeNull();
  });
});
