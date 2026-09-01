/**
 * The markets Fortitude works in.
 *
 * A market is not a state and it is not a customer — it is the combination,
 * because that is what the rate card follows. Two of these run through Trawick
 * and pay differently, so "who is the prime" does not identify a job's money on
 * its own and neither does "which state".
 *
 * Kept as data rather than a database table: there are three of them, they
 * change about never, and a table would mean a join on every project read for
 * something a constant answers.
 */

export type MarketId = "north-ga" | "south-ga" | "alabama";

export type Market = {
  id: MarketId;
  label: string;
  /** Who the work is billed through. */
  prime: string;
  /** For the filter chip, so a market reads without opening it. */
  hint: string;
  /**
   * Towns that place a job in this market, lowercase. Used only to suggest a
   * market for a project that has none — never to override one a person set.
   */
  towns: string[];
  /** Customer names that point here, lowercase. Same suggestion-only rule. */
  customers: string[];
  state: string;
};

export const MARKETS: Market[] = [
  {
    id: "north-ga",
    label: "North Georgia",
    prime: "Globe Communications",
    hint: "Globe",
    state: "GA",
    towns: [
      "toccoa",
      "eastanollee",
      "colbert",
      "lexington",
      "white plains",
      "hartwell",
      "royston",
      "carnesville",
      "clarkesville",
      "cornelia",
    ],
    customers: ["globe communications", "globe"],
  },
  {
    id: "south-ga",
    label: "South Georgia",
    prime: "Trawick Construction",
    hint: "Trawick",
    state: "GA",
    towns: [
      "milledgeville",
      "dublin",
      "sandersville",
      "eatonton",
      "gray",
      "macon",
      "swainsboro",
      "vidalia",
    ],
    // Trawick runs two markets, so the customer alone cannot place a job —
    // the town is what separates this from Alabama. Listed anyway so a
    // Trawick project with an unfamiliar town lands somewhere reviewable
    // rather than nowhere.
    customers: ["trawick construction", "trawick"],
  },
  {
    id: "alabama",
    label: "Alabama",
    prime: "Trawick Construction",
    hint: "Trawick · Odenville & Springville",
    state: "AL",
    towns: ["odenville", "springville", "moody", "trussville", "pell city", "ashville"],
    customers: [],
  },
];

export const MARKET_BY_ID = new Map(MARKETS.map((m) => [m.id, m]));

export function isMarketId(v: unknown): v is MarketId {
  return typeof v === "string" && MARKET_BY_ID.has(v as MarketId);
}

export function marketLabel(id: string): string {
  return MARKET_BY_ID.get(id as MarketId)?.label ?? "";
}

/**
 * A guess at which market a job belongs to, from its town and its customer.
 *
 * Town first, deliberately. Trawick runs both South Georgia and Alabama on
 * different rates, so the customer cannot decide between them — reading the
 * customer first would put every Alabama job on the Georgia card.
 *
 * Returns null rather than guessing when nothing matches. An unassigned job
 * shows up in the filter as unassigned, which somebody fixes in a moment; a
 * wrongly assigned one is invisible and gets billed at the wrong rate.
 */
export function inferMarket(input: {
  location?: string | null;
  client?: string | null;
  customer?: string | null;
}): MarketId | null {
  const where = (input.location ?? "").toLowerCase();

  for (const m of MARKETS) {
    if (m.towns.some((town) => where.includes(town))) return m.id;
  }

  // No town matched. Fall back to the customer, which can only ever resolve a
  // market that does not share its prime with another.
  const who = `${input.customer ?? ""} ${input.client ?? ""}`.toLowerCase();
  const byCustomer = MARKETS.filter((m) => m.customers.some((c) => who.includes(c)));
  const unambiguous = byCustomer.filter(
    (m) => MARKETS.filter((o) => o.prime === m.prime).length === 1,
  );
  return unambiguous.length === 1 ? unambiguous[0].id : null;
}
