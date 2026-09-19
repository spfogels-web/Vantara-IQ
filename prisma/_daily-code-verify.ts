/**
 * Read-only: what a Daily's code picker will offer, per customer, per market.
 *
 * Runs the *real* helpers the page runs — `ratesForMarket` from src/lib/markets
 * and `isMainBillableCode` from src/lib/unit-codes — over production rows, so
 * this measures the shipped decision rather than a second copy of it. The only
 * part of getBillableCodes not reproduced here is the access check, which
 * decides who may ask, not which codes come back.
 *
 * Nothing in this file writes. No create, update, upsert, delete or $executeRaw.
 */
import { PrismaClient } from "@prisma/client";

import { ratesForMarket } from "../src/lib/markets";
import { isMainBillableCode, normalizeCode } from "../src/lib/unit-codes";

const prisma = new PrismaClient();

/** getBillableCodes, from the customer's rows onward. */
function pickerFor(
  rows: { code: string; description: string; market: string | null }[],
  market: string | null,
) {
  const card = ratesForMarket(rows, market);
  const seen = new Set<string>();
  return card
    .filter((r) => isMainBillableCode(r.code))
    .filter((r) => {
      const k = normalizeCode(r.code);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

async function main() {
  const customers = await prisma.customer.findMany({ select: { id: true, name: true } });

  for (const c of customers) {
    const rows = await prisma.customerRate.findMany({
      where: { customerId: c.id },
      select: { code: true, description: true, market: true },
      orderBy: { code: "asc" },
    });
    if (!rows.length) continue;

    // Every market this customer's jobs are actually in, plus the unset case,
    // because a job with no market is priced off the blank rows.
    const projects = await prisma.project.findMany({
      where: { OR: [{ customerId: c.id }, { client: c.name }] },
      select: { market: true },
    });
    const markets = [...new Set(projects.map((p) => p.market ?? ""))].sort();

    console.log(`\n${c.name}  —  ${rows.length} rows on the card`);
    for (const m of markets.length ? markets : [""]) {
      const card = ratesForMarket(rows, m || null);
      const offered = pickerFor(rows, m || null);
      console.log(
        `  market ${JSON.stringify(m || null).padEnd(20)} card ${String(card.length).padStart(5)}` +
          `   offered ${String(offered.length).padStart(4)}` +
          `   withheld ${String(card.length - offered.length).padStart(5)}`,
      );
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
