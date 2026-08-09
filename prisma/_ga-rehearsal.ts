/**
 * Rehearses the Georgia buried-cable card against a copy of the Tall Lewis day.
 *
 * Runs entirely on the ZZ TEST sandbox so the real Tall Lewis record keeps
 * saying what is true — that Fortitude self-performed it. The daily here is the
 * same four codes and quantities, filed by the sandbox crew, so the figures
 * come out identical to the real job while the record stays honest.
 *
 *   npx tsx prisma/_ga-rehearsal.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Confirmed with Sean: the plow row covers every BFO size at $1.50/ft. */
const PLOW_SIZES = ["BFO12", "BFO24", "BFO48", "BFO144"];

/** What Tall Lewis actually billed, so the rehearsal matches it line for line. */
const CUSTOMER_RATES = [
  { code: "BFO48", description: "Place buried fiber optic cable, 48ct", unit: "ea", rate: 2.75 },
  { code: "BMFAF", description: "Ant control", unit: "ea", rate: 4.0 },
];

const DAILY_LINES = [
  { code: "BFO48", unit: "ea", location: "8075/45", quantity: 1600 },
  { code: "BD4MPF", unit: "ea", location: "8075/45", quantity: 1 },
  { code: "BDO", unit: "ea", location: "8075/45", quantity: 1 },
  { code: "BMFAF", unit: "ea", location: "8075/45", quantity: 2 },
];

async function main() {
  const crew = await db.subcontractor.findFirst({ where: { company: "ZZ TEST CREW" } });
  const project = await db.project.findFirst({ where: { name: "ZZ TEST PROJECT" } });
  const customer = await db.customer.findFirst({ where: { name: "ZZ TEST CUSTOMER" } });
  if (!crew || !project || !customer) {
    console.error("Sandbox missing. Run prisma/_sandbox.ts first.");
    process.exit(1);
  }

  // --- The Georgia card onto the sandbox crew -------------------------------
  const imp = await db.rateImport.findFirst({
    where: { fileName: { contains: "GEORGIA BURIED CABLE" } },
    include: { rows: true },
  });
  if (!imp) {
    console.error("Georgia rate import not found.");
    process.exit(1);
  }

  await db.subcontractorRate.deleteMany({ where: { subcontractorId: crew.id } });

  const seen = new Set<string>();
  let written = 0;
  for (const r of imp.rows) {
    // An extracted row can carry no rate at all — a line the reader saw but
    // could not price. Writing it as zero would put free work on a rate card.
    if (r.rate == null) {
      console.log(`skipped unpriced   ${r.code} (${r.description})`);
      continue;
    }
    const rate = r.rate;

    // The card prints BM60(1)(1 1/4) twice — missile at $5, drill at $6. Taking
    // the first silently would make the rate a coin flip, so only one is
    // written and the other is reported for a human to resolve.
    if (seen.has(r.code)) {
      console.log(`skipped duplicate  ${r.code} $${rate.toFixed(2)} (${r.description})`);
      continue;
    }
    seen.add(r.code);

    const codes = r.code === "BFO12" ? PLOW_SIZES : [r.code];
    for (const code of codes) {
      await db.subcontractorRate.create({
        data: {
          subcontractorId: crew.id,
          code,
          description: r.description,
          unit: r.unit,
          rate,
          rules: r.rules,
          source: "GEORGIA BURIED CABLE RATES - Sheet1 (10).pdf",
        },
      });
      written++;
    }
  }
  console.log(`\nGeorgia card on ${crew.company}: ${written} rates`);

  // --- Make sure the sandbox customer can bill the same codes ---------------
  for (const c of CUSTOMER_RATES) {
    const has = await db.customerRate.findFirst({ where: { customerId: customer.id, code: c.code } });
    if (!has) await db.customerRate.create({ data: { customerId: customer.id, ...c } });
  }

  // --- A copy of the Tall Lewis day, filed by the sandbox crew --------------
  await db.daily.deleteMany({ where: { projectId: project.id } });
  await db.invoice.deleteMany({ where: { projectId: project.id } });
  await db.subInvoice.deleteMany({ where: { projectId: project.id } });

  const daily = await db.daily.create({
    data: {
      sheetNumber: "ZZ-GA-0001",
      projectId: project.id,
      projectName: project.name,
      customer: customer.name,
      subcontractor: crew.company,
      crew: "GA rehearsal",
      workDate: "2026-08-07", // a Friday: closes the week 2026-08-01..2026-08-07
      submittedAt: "2026-08-07T18:00:00.000Z",
      status: "Approved",
      tone: "success",
      totalFt: 1600,
      lineItems: DAILY_LINES,
      photos: 2,
      hasAsBuilt: true,
    },
  });
  console.log(`daily ${daily.sheetNumber} filed and approved for ${crew.company}`);
}

main().finally(() => db.$disconnect());
