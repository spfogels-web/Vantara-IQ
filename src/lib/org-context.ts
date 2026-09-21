import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { isKnownOrg, type OrgId } from "@/lib/org-registry";

/**
 * Which organisation the current request belongs to.
 *
 * Two mechanisms, because neither covers everything on its own.
 *
 * **The header.** Next.js gives no hook to wrap server-component rendering in
 * an AsyncLocalStorage frame — middleware runs on the edge, in a different
 * runtime, and returns before the render begins. What middleware *can* do is
 * set a request header, and `headers()` is readable from server components,
 * route handlers and server actions alike. So the organisation travels on the
 * request itself. This is the path that carries real traffic.
 *
 * **AsyncLocalStorage.** For everything with no request at all: the cron
 * sweep, seed scripts, tests. `runWithOrg()` establishes the frame explicitly
 * and it wins over the header, because a caller who has said which
 * organisation they mean has said it more deliberately than a proxy header.
 *
 * Resolution is asynchronous because `headers()` is. That is why the Prisma
 * proxy hands back lazy delegates rather than a client: the decision cannot be
 * made in a synchronous property access.
 */

export { ORG_HEADER } from "@/lib/org-header";
import { ORG_HEADER } from "@/lib/org-header";

const storage = new AsyncLocalStorage<OrgId>();

/** Must match SESSION_COOKIE in lib/auth — duplicated to avoid an import cycle. */
const SESSION_COOKIE = "vq_session";

/** Run `fn` with an explicitly chosen organisation. Used off the request path. */
export function runWithOrg<T>(org: OrgId, fn: () => T): T {
  if (!isKnownOrg(org)) {
    throw new Error(`runWithOrg called with unknown organisation "${org}".`);
  }
  return storage.run(org, fn);
}

/** The organisation established by `runWithOrg`, if any. Never guesses. */
export function explicitOrg(): OrgId | undefined {
  return storage.getStore();
}

/** Thrown when a query is attempted with no organisation to send it to. */
export class NoOrganisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoOrganisationError";
  }
}

/**
 * The organisation for the current request.
 *
 * An explicit `runWithOrg` frame, then the request header middleware set from
 * the signed session. If neither says, this throws.
 *
 * It used to fall back to Fortitude. That fallback was the single most
 * dangerous line in the tenancy work: a request that lost its organisation for
 * any reason — a missed header, a background job, a route nobody thought about
 * — would not fail, it would quietly serve a real company's live data to
 * whoever asked. Nothing about that looks wrong in a log. Throwing is loud,
 * happens before a single row is read, and is trivially fixed by naming the
 * organisation at the call site that lacked one.
 *
 * The doors that legitimately have no session behind them — signing in,
 * accepting an invitation, a carrier's webhook — say which organisation they
 * mean, in their own code, where the decision is visible.
 */
/**
 * The organisation named by a cryptographically valid session cookie.
 *
 * Deliberately duplicates the few lines of verification rather than importing
 * them: `lib/auth` already imports this module, and a cycle between the thing
 * that decides which database to read and the thing that decides who is asking
 * is not worth the saved lines. The contract is narrow enough to keep honest —
 * verify the signature, require an org claim, return nothing otherwise.
 */
async function orgFromVerifiedSession(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;

  try {
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    // Both claims, as the middleware requires. A token carrying one without
    // the other was not issued by this application in a state we recognise.
    const org = typeof payload.org === "string" ? payload.org : "";
    const home = typeof payload.home === "string" ? payload.home : "";
    return org && home ? org : null;
  } catch {
    // Expired, tampered with, signed by a different secret, or read outside a
    // request. All of them mean the same thing here: no organisation.
    return null;
  }
}

export async function resolveOrg(): Promise<OrgId> {
  const explicit = storage.getStore();
  if (explicit) return explicit;

  let named: string | null = null;
  try {
    // Imported here rather than at the top of the file so that everything with
    // no request behind it — the cron sweep, seed scripts, the test suite —
    // can import this module without dragging Next's request machinery in.
    const { headers } = await import("next/headers");
    named = (await headers()).get(ORG_HEADER);
  } catch {
    // `headers()` throws outside a request scope — a script, a test, a
    // background job. Those must use `runWithOrg`, and the throw below says so.
  }

  if (!named) {
    // Third and last: the organisation inside the signed session cookie.
    //
    // Onboarding creates a session partway through a request that arrived
    // without one. Middleware runs before the route and cannot go back and add
    // a header for a session that did not exist when it looked, so the render
    // that follows the account-creating action has a valid session and no
    // header — and threw, after the account had already been written.
    //
    // This is the same value the middleware would have used, verified the same
    // way: jwtVerify against AUTH_SECRET, rejecting anything expired, tampered
    // with, or signed by another secret. Nothing here reads an unsigned cookie,
    // a query parameter, or a form field, and there is still no default: an
    // unreadable session falls through to the throw below exactly as before.
    named = await orgFromVerifiedSession();
  }

  if (!named) {
    throw new NoOrganisationError(
      "No organisation on this request, so there is no database to read from. " +
        "A signed-in request carries one in its session; anything without a session — " +
        "a script, the cron sweep, a webhook — must name one with runWithOrg().",
    );
  }

  if (!isKnownOrg(named)) {
    // A header naming an organisation we do not have is not something to paper
    // over by serving a different one.
    throw new NoOrganisationError(`Request names unknown organisation "${named}".`);
  }

  return named;
}
