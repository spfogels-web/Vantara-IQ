/**
 * The registry.
 *
 * Everything above this line asks for a provider by id and gets the interface.
 * Adding Alabama is a file beside ga811.ts and a line in this map.
 */

import { ga811 } from "./ga811";
import type { LocateProvider } from "./types";

export * from "./types";

const PROVIDERS: Record<string, LocateProvider> = {
  GA811: ga811,
};

export const DEFAULT_PROVIDER = "GA811";

/**
 * Look up a provider.
 *
 * Falls back to Georgia rather than throwing: a ticket saved before another
 * state existed carries "GA811", and a ticket saved with a provider we have
 * since removed should still render on the board rather than take the page
 * down. The board shows the id it holds either way.
 */
export function providerFor(id: string | null | undefined): LocateProvider {
  return PROVIDERS[String(id ?? "").toUpperCase()] ?? PROVIDERS[DEFAULT_PROVIDER];
}

export function allProviders(): LocateProvider[] {
  return Object.values(PROVIDERS);
}

/** Which centres can currently be queried automatically, for the admin view. */
export function providerHealth(): { id: string; name: string; ready: boolean; detail: string }[] {
  return allProviders().map((p) => ({
    id: p.id,
    name: p.name,
    ready: p.ready(),
    detail: p.readyDetail(),
  }));
}
