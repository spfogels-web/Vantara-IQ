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

/**
 * A centre this build has no integration for.
 *
 * Returned instead of quietly substituting Georgia, which is what used to
 * happen and is worse than it sounds: an organisation working Florida would
 * have had "Georgia 811" on its board, with a validator for the wrong ticket
 * format and a link to the wrong search page — all of it looking like working
 * software.
 *
 * Nothing automated is offered. Tickets arrive by paste or by email, which is
 * a supported way to run this module and is exactly what an unintegrated
 * centre means.
 */
function unintegrated(id: string): LocateProvider {
  const key = id.trim().toUpperCase() || "UNKNOWN";
  return {
    id: key,
    name: key,
    state: "",
    ready: () => false,
    readyDetail: () =>
      `There is no automated integration for ${key} in this build. Tickets can still be pasted or emailed in.`,
    validateNumber: (input: string) => {
      const number = input.trim().toUpperCase();
      return number
        ? { ok: true, number, revision: "" }
        : { ok: false, number: "", revision: "", error: "Enter a ticket number." };
    },
    ticketUrl: () => "",
    lookupTicket: async () => ({ status: "LOOKUP_UNAVAILABLE", ticket: null }) as never,
    parseText: async () => [],
  };
}

/**
 * Look up a provider by id.
 *
 * An id this build does not implement gets an unintegrated stand-in carrying
 * that id, never another centre's. A ticket saved against a provider since
 * removed still renders on the board rather than taking the page down.
 */
export function providerFor(id: string | null | undefined): LocateProvider {
  const key = String(id ?? "").toUpperCase();
  return PROVIDERS[key] ?? unintegrated(key);
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
