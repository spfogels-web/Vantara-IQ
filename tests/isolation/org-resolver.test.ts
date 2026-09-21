/**
 * What may tell a request which company's database it reads.
 *
 * Three sources, in order, and the order is the security property: an explicit
 * `runWithOrg` frame, then the header middleware set from a verified session,
 * then the verified session itself. Anything else — an unsigned cookie, a
 * query parameter, a form field, a default — is not a source, and the absence
 * of all three is an error rather than a guess.
 *
 * The third source exists because onboarding creates a session partway through
 * a request that arrived without one. Middleware runs before the route and
 * cannot go back and add a header for a session that did not exist when it
 * looked, so the render after the account-creating action holds a valid
 * session and no header. It threw, after the account had been written.
 *
 * These mock `next/headers` rather than standing up a server, so each case is
 * exactly one question: given this header and this cookie, what does the
 * resolver do? No database is touched by any of them.
 */
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_HEADER = "x-vq-org";
const SESSION_COOKIE = "vq_session";
const SECRET = process.env.AUTH_SECRET ?? "";

/** What the mocked request is carrying, rewritten per test. */
const req: { header: string | null; cookie: string | null } = { header: null, cookie: null };

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k === ORG_HEADER ? req.header : null) }),
  cookies: async () => ({
    get: (k: string) => (k === SESSION_COOKIE && req.cookie ? { value: req.cookie } : undefined),
  }),
}));

const key = () => new TextEncoder().encode(SECRET);

/** A session exactly as the application issues one. */
async function session(opts: {
  org?: string;
  home?: string;
  expired?: boolean;
  secret?: Uint8Array;
}) {
  const now = Math.floor(Date.now() / 1000);
  const t = new SignJWT({
    role: "SUBCONTRACTOR",
    ...(opts.org === undefined ? {} : { org: opts.org }),
    // home defaults to org, as a real session does. Emitting org without
    // home produced a token the resolver rightly refused, and the refusal
    // looked like the resolver failing rather than the fixture being wrong.
    ...(opts.home ?? opts.org ? { home: opts.home ?? opts.org } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-under-test")
    .setIssuedAt(opts.expired ? now - 7200 : now)
    .setExpirationTime(opts.expired ? now - 3600 : now + 3600);
  return t.sign(opts.secret ?? key());
}

beforeEach(() => {
  req.header = null;
  req.cookie = null;
  vi.resetModules();
});

/** Imported fresh each time so the module picks up the mocked request. */
async function resolve() {
  const { resolveOrg } = await import("../../src/lib/org-context");
  return resolveOrg();
}

describe("the order of precedence is the security property", () => {
  it("prefers an explicit runWithOrg frame over everything else", async () => {
    req.header = "apex";
    req.cookie = await session({ org: "apex" });
    const { resolveOrg, runWithOrg } = await import("../../src/lib/org-context");
    // A caller that named its organisation means it. This is what onboarding
    // uses to act on the tenant that issued an invitation, even in a browser
    // signed in to a different one.
    await expect(runWithOrg("fortitude", () => resolveOrg())).resolves.toBe("fortitude");
  });

  it("prefers the middleware header over the cookie", async () => {
    req.header = "fortitude";
    req.cookie = await session({ org: "apex" });
    // The header is derived from the same session, earlier and by trusted
    // code. If the two ever disagree the header wins, so this source can only
    // ever fill a gap, never override.
    await expect(resolve()).resolves.toBe("fortitude");
  });

  it("falls through to the verified session when no header was set", async () => {
    req.cookie = await session({ org: "fortitude" });
    await expect(resolve()).resolves.toBe("fortitude");
  });
});

describe("a session only counts if it is genuinely one", () => {
  it("refuses a token signed with another secret", async () => {
    req.cookie = await session({
      org: "fortitude",
      secret: new TextEncoder().encode("x".repeat(48)),
    });
    await expect(resolve()).rejects.toThrow(/No organisation/i);
  });

  it("refuses a tampered token", async () => {
    const good = await session({ org: "fortitude" });
    // Corrupt the signature, leaving the claims readable — the case that
    // decoding instead of verifying would wave through.
    req.cookie = good.slice(0, -4) + "AAAA";
    await expect(resolve()).rejects.toThrow(/No organisation/i);
  });

  it("refuses an expired token", async () => {
    req.cookie = await session({ org: "fortitude", expired: true });
    await expect(resolve()).rejects.toThrow(/No organisation/i);
  });

  it("refuses a token carrying no organisation claim", async () => {
    req.cookie = await session({});
    await expect(resolve()).rejects.toThrow(/No organisation/i);
  });

  it("refuses a token naming an organisation this deployment does not have", async () => {
    // A perfectly valid signature is not a reason to serve a tenant nobody
    // configured. Refusing is the same rule the header path already applied.
    req.cookie = await session({ org: "not-a-real-tenant" });
    await expect(resolve()).rejects.toThrow(/unknown organisation|No organisation/i);
  });

  it("refuses an unsigned cookie value that merely looks like an org", async () => {
    req.cookie = "fortitude";
    await expect(resolve()).rejects.toThrow(/No organisation/i);
  });
});

describe("nothing at all is still an error", () => {
  it("throws when there is no frame, no header and no cookie", async () => {
    await expect(resolve()).rejects.toThrow(/No organisation/i);
  });

  it("does not fall back to a home organisation", async () => {
    // The fallback this replaced would have served a live company's data to a
    // request that had lost its organisation. Its absence is the whole point.
    await expect(resolve()).rejects.toThrow();
  });
});

describe("one tenant's session cannot reach another's data", () => {
  it("resolves tenant B's session to tenant B, never to tenant A", async () => {
    req.cookie = await session({ org: "apex" });
    // Whether "apex" is configured in this environment or not, the one answer
    // that must never come back is the other tenant.
    await resolve().then(
      (org) => expect(org).not.toBe("fortitude"),
      (e) => expect(String(e)).toMatch(/unknown organisation|No organisation/i),
    );
  });
});
