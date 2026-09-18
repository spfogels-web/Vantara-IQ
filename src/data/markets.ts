import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { isKnownMarket, labelOf, type Market } from "@/lib/markets";

/**
 * This organisation's markets, from this organisation's database.
 *
 * Read once per request — twenty screens ask for the label of the same market
 * and there is no reason for twenty queries. A market added or renamed takes
 * effect on the next request, which is the right granularity for something
 * that changes about never.
 *
 * An organisation with no markets gets an empty list, and every screen that
 * offers a market picker offers nothing. That is correct: it has not told us
 * where it works. The alternative — showing it somebody else's markets — is
 * the bug this replaced.
 */
export const getMarkets = cache(async (): Promise<Market[]> => {
  const rows = await prisma.market
    .findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] })
    .catch(() => []);

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    prime: r.prime,
    hint: r.hint,
    state: r.state,
    towns: r.towns,
    customers: r.customers,
  }));
});

/** The label for one of this organisation's markets. Empty when unknown. */
export async function marketLabel(id: string | null | undefined): Promise<string> {
  return labelOf(await getMarkets(), id);
}

/** Whether this id names a market this organisation has. */
export async function isMarketId(v: unknown): Promise<boolean> {
  return isKnownMarket(await getMarkets(), v);
}
