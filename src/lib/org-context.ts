import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";

import { INCUMBENT_ORG, isKnownOrg, type OrgId } from "@/lib/org-registry";

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

export const ORG_HEADER = "x-vq-org";

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

/**
 * The organisation for the current request.
 *
 * Order: an explicit `runWithOrg` frame, then the request header, then the
 * incumbent.
 *
 * The last step is the one to watch. Today it is honest — this deployment
 * serves Fortitude and nothing else has a way in. It is a single named
 * constant rather than a literal buried here, so that when step 3 puts the
 * organisation on the session, removing the fallback is one deletion and the
 * compiler finds anything that depended on it. At that point a request with no
 * organisation is refused instead.
 */
export async function resolveOrg(): Promise<OrgId> {
  const explicit = storage.getStore();
  if (explicit) return explicit;

  try {
    const h = await headers();
    const named = h.get(ORG_HEADER);
    if (named) {
      if (!isKnownOrg(named)) {
        // A header naming an organisation we do not have is not something to
        // paper over by serving a different one.
        throw new Error(`Request names unknown organisation "${named}".`);
      }
      return named;
    }
  } catch (e) {
    // `headers()` throws outside a request scope — a script, a test, a
    // background job. That is expected and falls through. A genuine
    // unknown-organisation error is re-thrown.
    if (e instanceof Error && e.message.startsWith("Request names unknown organisation")) throw e;
  }

  return INCUMBENT_ORG;
}
