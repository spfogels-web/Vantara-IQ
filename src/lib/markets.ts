/**
 * What a market is, and the rules that follow from one.
 *
 * A market is not a state and it is not a customer — it is the combination,
 * because that is what the rate card follows. Two markets can run through the
 * same prime at different prices, so "who is the prime" does not identify a
 * job's money on its own, and neither does "which state".
 *
 * ## Why there is no list here any more
 *
 * There used to be three of them in this file, by name: North Georgia through
 * Globe Communications, South Georgia and Alabama through Trawick. That is one
 * contractor's commercial relationships written into the product — every other
 * organisation's project form offered them, and their rate sheets were filed
 * against them. Not a database leak; a worse one, because it looks like
 * working software.
 *
 * The list lives in each organisation's own database now (see
 * `src/data/markets.ts`). What stays here is the part that is true for
 * everybody: the shape of a market, and how rates resolve against one.
 *
 * No `server-only`: the type and `ratesForMarket` are used on both sides.
 */

export type Market = {
  id: string;
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

/** The label for a market id, from a list already loaded. Empty if unknown. */
export function labelOf(markets: Market[], id: string | null | undefined): string {
  if (!id) return "";
  return markets.find((m) => m.id === id)?.label ?? "";
}

/** Whether this id names a market this organisation actually has. */
export function isKnownMarket(markets: Market[], v: unknown): v is string {
  return typeof v === "string" && markets.some((m) => m.id === v);
}

/**
 * Work out which market a piece of free text means, or none.
 *
 * Rate sheets arrive with a market typed on them by hand, so "North Georgia",
 * "north-ga" and "N Georgia" all turn up meaning the same place. This used to
 * be a short if-ladder mapping exactly those spellings onto exactly three ids —
 * which is to say, one organisation's markets hardcoded into the importer, and
 * for anybody else a silent "no market" on every sheet.
 *
 * Matching against the organisation's own markets answers the same question
 * without knowing anything in advance: the id, the label, or the short hint,
 * each compared loosely enough to survive a space or a hyphen.
 *
 * Returns "" rather than guessing. A sheet filed under no market prices
 * everywhere, which is visible and fixable; a sheet filed under the wrong
 * market is invisible and bills at the wrong rate.
 */
export function resolveMarketText(markets: Market[], text: string | null | undefined): string {
  const loose = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const want = loose(text ?? "");
  if (!want) return "";

  for (const m of markets) if (loose(m.id) === want) return m.id;
  for (const m of markets) if (loose(m.label) === want) return m.id;
  for (const m of markets) if (m.hint && loose(m.hint) === want) return m.id;
  return "";
}

/**
 * Pick the rows that apply in a market, one per code.
 *
 * A row naming the market beats a row that names none. That is what lets one
 * customer hold two cards at different prices: a prime's sheet for one market
 * and the same prime's sheet for another both live under that customer, and a
 * job is priced off whichever matches the market it is in.
 *
 * A blank market means "everywhere". Most customers work one market and expect
 * their card to follow them, so that is the default and nothing has to be
 * tagged until there is a second card to tell apart.
 *
 * When a market-specific card omits a code the general card has, the general
 * one is used. That is deliberate: a card is usually a delta against a base,
 * and refusing to price a code somebody did not re-list would read as the work
 * being unbillable rather than as unchanged.
 */
export function ratesForMarket<T extends { code: string; market?: string | null }>(
  rows: T[],
  market: string | null | undefined,
): T[] {
  const m = (market ?? "").trim();
  const byCode = new Map<string, T>();

  for (const r of rows) {
    const rowMarket = (r.market ?? "").trim();
    // A row for some other market is not a fallback for this one — it is a
    // different price for a different place, and using it is the mistake this
    // whole column exists to prevent.
    if (rowMarket && rowMarket !== m) continue;

    const key = r.code.trim().toUpperCase();
    const held = byCode.get(key);
    if (!held) {
      byCode.set(key, r);
      continue;
    }
    // Both apply; the one that names the market is the more specific answer.
    const heldMarket = (held.market ?? "").trim();
    if (!heldMarket && rowMarket) byCode.set(key, r);
  }

  return [...byCode.values()];
}
