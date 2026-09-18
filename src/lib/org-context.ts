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
