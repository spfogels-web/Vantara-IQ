/**
 * Apex's own vocabulary, customers and rate cards.
 *
 * None of it is Fortitude's. Different codes, different primes, different
 * prices, different markets, different states — because a demonstration tenant
 * that shares a single code or customer name with the live one is a leak
 * waiting to be mistaken for a feature.
 *
 * The rate architecture is the one protected in Step 4 and it is not bent here:
 *
 *     Organization -> Customer -> Market -> Rate Card
 *
 * A rate belongs to a customer and a market. Nothing is organisation-wide, and
 * there is no second list anywhere saying which codes may be billed.
 */

/** Apex's markets. `id` is what a Project carries in `market`. */
export const MARKETS = [
  { id: "tampa-bay", label: "Tampa Bay", prime: "Calderon Fiber Partners", hint: "Calderon", state: "FL", towns: ["brandon", "riverview", "plant city", "lutz", "wesley chapel"], customers: ["calderon fiber partners", "calderon"], sortOrder: 0 },
  { id: "gulf-coast", label: "Gulf Coast", prime: "Calderon Fiber Partners", hint: "Calderon · Sarasota & Venice", state: "FL", towns: ["sarasota", "venice", "north port", "osprey", "nokomis"], customers: [], sortOrder: 1 },
  { id: "orlando-metro", label: "Orlando Metro", prime: "Mereside Communications", hint: "Mereside", state: "FL", towns: ["apopka", "ocoee", "winter garden", "clermont", "kissimmee"], customers: ["mereside communications", "mereside"], sortOrder: 2 },
  { id: "space-coast", label: "Space Coast", prime: "Mereside Communications", hint: "Mereside · Brevard", state: "FL", towns: ["melbourne", "palm bay", "titusville", "rockledge", "cocoa"], customers: [], sortOrder: 3 },
  { id: "north-florida", label: "North Florida", prime: "Halstead Utility Networks", hint: "Halstead", state: "FL", towns: ["gainesville", "ocala", "lake city", "alachua", "starke"], customers: ["halstead utility networks", "halstead"], sortOrder: 4 },
] as const;

export type MarketId = (typeof MARKETS)[number]["id"];

/**
 * The work Apex sells, across the breadth of the product rather than one
 * contractor's trade.
 *
 * `family` drives nothing in the schema — it is here so the dataset can be read
 * and checked by a person, and so a project can be given a plausible mix of
 * codes for the work it actually is.
 */
export const CODES = [
  // Aerial telecom
  { code: "AFO48I", description: "Aerial fiber 48ct, install", unit: "ft", family: "aerial", base: 2.35 },
  { code: "AFO144I", description: "Aerial fiber 144ct, install", unit: "ft", family: "aerial", base: 3.85 },
  { code: "AFO288I", description: "Aerial fiber 288ct, install", unit: "ft", family: "aerial", base: 5.10 },
  { code: "AFOSTR", description: "Aerial strand, 6M", unit: "ft", family: "aerial", base: 1.45 },
  { code: "AFOANC", description: "Aerial anchor set", unit: "ea", family: "aerial", base: 185.0 },
  // Underground telecom
  { code: "UFO144I", description: "Underground fiber 144ct, install", unit: "ft", family: "underground", base: 4.20 },
  { code: "UFO288I", description: "Underground fiber 288ct, install", unit: "ft", family: "underground", base: 5.65 },
  { code: "UFOCND2", description: "Conduit 2in, placed", unit: "ft", family: "underground", base: 3.10 },
  { code: "UFOVLT", description: "Vault set 30x48x36", unit: "ea", family: "underground", base: 1450.0 },
  { code: "UFOHH24", description: "Handhole 24x36x24, set", unit: "ea", family: "underground", base: 620.0 },
  // Directional drilling
  { code: "DD2IN", description: "Directional bore 2in", unit: "ft", family: "drilling", base: 8.75 },
  { code: "DD4IN", description: "Directional bore 4in", unit: "ft", family: "drilling", base: 12.40 },
  { code: "DDRCK", description: "Directional bore, rock", unit: "ft", family: "drilling", base: 26.50 },
  // Plough, trench, missile
  { code: "PLW12", description: "Plow 12in depth", unit: "ft", family: "plow", base: 2.90 },
  { code: "TRN24", description: "Trench 24in depth", unit: "ft", family: "plow", base: 5.40 },
  { code: "MSL2IN", description: "Missile bore 2in, road crossing", unit: "ft", family: "plow", base: 9.20 },
  // Fibre blowing
  { code: "BLW144", description: "Blow fiber 144ct", unit: "ft", family: "blowing", base: 1.15 },
  { code: "BLW288", description: "Blow fiber 288ct", unit: "ft", family: "blowing", base: 1.60 },
  // Splicing
  { code: "SPLRIB", description: "Ribbon splice, per fiber", unit: "ea", family: "splicing", base: 11.50 },
  { code: "SPLCAS", description: "Splice case, install and seal", unit: "ea", family: "splicing", base: 340.0 },
  { code: "SPLTST", description: "OTDR test and certify", unit: "ea", family: "splicing", base: 92.0 },
  // FTTH / FTTx
  { code: "FTHDRP", description: "FTTH drop, placed and terminated", unit: "ea", family: "ftth", base: 245.0 },
  { code: "FTHNAP", description: "NAP enclosure, install", unit: "ea", family: "ftth", base: 410.0 },
  { code: "FTHONT", description: "ONT install and light", unit: "ea", family: "ftth", base: 165.0 },
  // Restoration
  { code: "RSTASP", description: "Asphalt restoration", unit: "sf", family: "restoration", base: 14.75 },
  { code: "RSTCON", description: "Concrete restoration", unit: "sf", family: "restoration", base: 22.30 },
  { code: "RSTSOD", description: "Sod and grade restoration", unit: "sf", family: "restoration", base: 3.60 },
  // Civil
  { code: "CIVPAD", description: "Equipment pad, formed and poured", unit: "ea", family: "civil", base: 2850.0 },
  { code: "CIVBOL", description: "Bollard set", unit: "ea", family: "civil", base: 395.0 },
] as const;

export type CodeId = (typeof CODES)[number]["code"];

export const codeOf = (code: string) => CODES.find((c) => c.code === code)!;

/**
 * A customer, its markets, and the number its billing department issued Apex.
 *
 * Brightwater has no crew number on purpose. One customer's identifier must
 * never stand in for another's, and the only way a demo shows that is by
 * containing a customer that has none — its sheets render a blank field.
 */
export const CUSTOMERS = [
  {
    key: "calderon",
    name: "Calderon Fiber Partners",
    shortCode: "CAL",
    crewNumber: "APX-4410-T02-118",
    markets: ["tampa-bay", "gulf-coast"] as MarketId[],
    terms: "Net 45",
    retainagePct: 0.05,
    location: "Tampa, FL",
  },
  {
    key: "mereside",
    name: "Mereside Communications",
    shortCode: "MER",
    crewNumber: "MC-88231-A7",
    markets: ["orlando-metro", "space-coast"] as MarketId[],
    terms: "Net 30",
    retainagePct: 0.1,
    location: "Orlando, FL",
  },
  {
    key: "halstead",
    name: "Halstead Utility Networks",
    shortCode: "HAL",
    crewNumber: "HUN-2291",
    markets: ["north-florida"] as MarketId[],
    terms: "Net 45",
    retainagePct: 0.05,
    location: "Gainesville, FL",
  },
  {
    key: "brightwater",
    name: "Brightwater Civil",
    shortCode: "BRW",
    /** Deliberately none. See the note above. */
    crewNumber: "",
    markets: ["gulf-coast"] as MarketId[],
    terms: "Net 30",
    retainagePct: 0.0,
    location: "Venice, FL",
  },
  {
    key: "ardent",
    name: "Ardent Power & Water",
    shortCode: "ARD",
    crewNumber: "AP-7714-C",
    markets: ["north-florida"] as MarketId[],
    terms: "Net 60",
    retainagePct: 0.05,
    location: "Ocala, FL",
  },
] as const;

export type CustomerKey = (typeof CUSTOMERS)[number]["key"];
export const customerOf = (key: CustomerKey) => CUSTOMERS.find((c) => c.key === key)!;

/**
 * Which codes a customer prices, and at what, per market.
 *
 * `market: null` is a price that applies wherever the job is. A market-named
 * row beats a blank one; a row for another market does not apply at all. That
 * is the rule `ratesForMarket` implements, and the demo has to exercise both
 * halves of it or it proves nothing.
 */
export type RateRow = { customer: CustomerKey; market: MarketId | null; code: CodeId; rate: number };

/** A price multiplier per customer, so no two cards are the same numbers. */
const CUSTOMER_FACTOR: Record<CustomerKey, number> = {
  calderon: 1.0,
  mereside: 1.06,
  halstead: 0.94,
  brightwater: 1.12,
  ardent: 1.03,
};

/** Which families each customer actually buys. */
const CUSTOMER_FAMILIES: Record<CustomerKey, string[]> = {
  calderon: ["aerial", "underground", "drilling", "plow", "blowing", "splicing", "ftth", "restoration"],
  mereside: ["ftth", "aerial", "splicing", "blowing", "underground", "restoration"],
  halstead: ["underground", "drilling", "plow", "restoration", "civil"],
  brightwater: ["civil", "restoration", "plow"],
  ardent: ["underground", "drilling", "civil", "restoration"],
};

/**
 * The market-specific pricing demonstration, stated once and asserted by the
 * validator: the same code, the same customer, two markets, two prices.
 *
 * Gulf Coast is the harder ground and the longer haul, and it is priced that
 * way. A job in Tampa Bay billed at the Gulf Coast rate is not a rounding
 * error, it is an overbilled customer.
 */
export const PRICE_PROOF = {
  customer: "calderon" as CustomerKey,
  code: "AFO144I" as CodeId,
  tampaBay: 3.85,
  gulfCoast: 4.40,
};

/** Codes only one of Calderon's two markets prices, proving exclusion. */
export const MARKET_ONLY = {
  tampaBayOnly: "FTHONT" as CodeId,
  gulfCoastOnly: "RSTCON" as CodeId,
};

export function buildRateCard(): RateRow[] {
  const rows: RateRow[] = [];
  const seen = new Set<string>();

  const push = (r: RateRow) => {
    const k = `${r.customer}|${r.market ?? ""}|${r.code}`;
    if (seen.has(k)) return;
    seen.add(k);
    rows.push(r);
  };

  for (const c of CUSTOMERS) {
    const families = CUSTOMER_FAMILIES[c.key];
    const codes = CODES.filter((x) => families.includes(x.family));

    for (const m of c.markets) {
      for (const code of codes) {
        // Markets price the same work differently: the second market of a
        // customer carries its own, dearer card.
        const marketFactor = m === "gulf-coast" || m === "space-coast" ? 1.14 : 1.0;
        const rate = Math.round(code.base * CUSTOMER_FACTOR[c.key] * marketFactor * 100) / 100;
        push({ customer: c.key, market: m, code: code.code, rate });
      }
    }

    // One code priced the same wherever the job is — the legitimate fallback,
    // so the validator can tell narrowing from over-narrowing.
    if (families.includes("splicing")) {
      push({ customer: c.key, market: null, code: "SPLTST", rate: Math.round(92 * CUSTOMER_FACTOR[c.key] * 100) / 100 });
    }
  }

  // The stated demonstration, pinned to exact numbers rather than derived.
  for (const r of rows) {
    if (r.customer === PRICE_PROOF.customer && r.code === PRICE_PROOF.code) {
      if (r.market === "tampa-bay") r.rate = PRICE_PROOF.tampaBay;
      if (r.market === "gulf-coast") r.rate = PRICE_PROOF.gulfCoast;
    }
  }

  // Exclusivity: remove the code each market is not supposed to price.
  return rows.filter((r) => {
    if (r.customer !== "calderon") return true;
    if (r.code === MARKET_ONLY.tampaBayOnly && r.market === "gulf-coast") return false;
    if (r.code === MARKET_ONLY.gulfCoastOnly && r.market === "tampa-bay") return false;
    return true;
  });
}

/**
 * The price a job pays for a code — the same narrowing the application does.
 *
 * A market-named row wins; a blank row applies; another market's row is not a
 * fallback and returns nothing at all.
 */
export function rateFor(rows: RateRow[], customer: CustomerKey, market: MarketId | null, code: CodeId): number | null {
  const mine = rows.filter((r) => r.customer === customer && r.code === code);
  const exact = mine.find((r) => r.market === market);
  if (exact) return exact.rate;
  const blank = mine.find((r) => r.market === null);
  return blank ? blank.rate : null;
}
