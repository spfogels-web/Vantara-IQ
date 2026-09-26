/**
 * The quality standard, and who is allowed to read it.
 *
 * The Quality Control panel on a daily asks for the OSP guide with a HEAD
 * request and renders nothing — not the link, not the example photographs —
 * unless the reply is really a PDF. Middleware was bouncing a crew's request
 * for /qc to /dailies, so the reply was a page and the whole block vanished
 * for exactly the people it is written for. Staff saw it; the crews held to
 * the standard did not, and it read as a missing feature rather than a
 * redirect.
 *
 * Two things are asserted here, and the second is the one that matters:
 * staff can reach it, and a subcontractor can reach it too.
 */
import { describe, expect, it } from "vitest";

import { BASE_URL, fixtures } from "../support/load";
import { sessionCookie } from "../support/session";
import { testClient } from "../support/test-db";

const tenant = fixtures().a;
const db = testClient();

const GUIDE = "/qc/quality-assurance-guide.pdf";

async function head(path: string, cookie?: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "HEAD",
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  return {
    status: r.status,
    type: (r.headers.get("content-type") ?? "").toLowerCase(),
    location: r.headers.get("location"),
  };
}

describe("a crew can read the standard they are held to", () => {
  it("serves the guide to staff", async () => {
    const r = await head(GUIDE, await sessionCookie(tenant.staffUserId, "ADMIN"));
    expect(r.status, `staff got ${r.status} for the guide`).toBe(200);
    expect(r.type, "the reply to staff is not a PDF").toContain("pdf");
  });

  it("serves the guide to a subcontractor", async () => {
    // The regression. A crew login must get the file itself, not a redirect
    // to their dailies — the panel treats anything that is not a PDF as
    // absent and hides the standard and both example photographs with it.
    const sub = await db.subcontractor.findFirst({ select: { id: true } });
    const user = await db.user.create({
      data: {
        email: `qc.${Date.now()}@example.invalid`,
        name: "Crew Login",
        role: "SUBCONTRACTOR",
        subcontractorId: sub?.id ?? null,
      },
    });
    try {
      const r = await head(GUIDE, await sessionCookie(user.id, "SUBCONTRACTOR"));
      expect(
        r.status,
        `a crew got ${r.status}${r.location ? ` redirecting to ${r.location}` : ""}`,
      ).toBe(200);
      expect(r.type, "the reply to a crew is not a PDF, so the panel hides itself")
        .toContain("pdf");
    } finally {
      await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
    }
  });

  it("still asks anyone with no session to sign in", async () => {
    // Windstream marks this document internal. Opening it to crews must not
    // have opened it to the whole internet.
    const r = await head(GUIDE);
    expect(r.status, "the guide is served without a session").not.toBe(200);
  });
});
