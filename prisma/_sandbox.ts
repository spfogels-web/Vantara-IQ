/**
 * A throwaway sandbox for walking a daily from filing to payment.
 *
 * Everything it creates is prefixed "ZZ TEST" and isolated from real work: its
 * own customer, its own project, its own crew. Filing a test daily against a
 * live job would put a real line on a real customer's invoice and move that
 * job's percent complete, which is a strange price to pay for a rehearsal.
 *
 *   npx tsx prisma/_sandbox.ts            # create it
 *   npx tsx prisma/_sandbox.ts --destroy  # remove every trace
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const TAG = "ZZ TEST";
const EMAIL = "test.crew@vantara-test.local";

/** The codes the sandbox prices, copied from the real cards so figures are realistic. */
const CODES = ["BFO12", "BM61(2)F", "BDO", "BD4MPF"];

async function destroy() {
  const project = await db.project.findFirst({ where: { name: { startsWith: TAG } } });
  if (project) {
    // Invoice lines and statements hang off these; clear the invoices first so
    // nothing is left pointing at a project that no longer exists.
    await db.invoice.deleteMany({ where: { projectId: project.id } });
    await db.subInvoice.deleteMany({ where: { projectId: project.id } });
    await db.daily.deleteMany({ where: { projectId: project.id } });
    await db.dailySheet.deleteMany({ where: { projectId: project.id } });
  }
  await db.user.deleteMany({ where: { email: EMAIL } });
  await db.subcontractor.deleteMany({ where: { company: { startsWith: TAG } } });
  if (project) await db.project.delete({ where: { id: project.id } });
  await db.customer.deleteMany({ where: { name: { startsWith: TAG } } });
  console.log("Sandbox removed.");
}

async function main() {
  if (process.argv.includes("--destroy")) return destroy();

  const password = process.env.VQ_PASSWORD;
  if (!password) {
    console.error("Set VQ_PASSWORD so the password never reaches this file.");
    process.exit(1);
  }

  await destroy(); // idempotent — re-running gives a clean sandbox

  // --- Customer, with real rates for the codes we will file -----------------
  // Whichever customer actually carries the rate card — every project points at
  // the same one, and it is not named after the client on the job.
  const source = await db.customer.findFirst({
    where: { rates: { some: {} } },
    orderBy: { rates: { _count: "desc" } },
  });
  const sourceRates = source
    ? await db.customerRate.findMany({
        where: { customerId: source.id, code: { in: CODES } },
        select: { code: true, description: true, unit: true, rate: true },
      })
    : [];

  const customer = await db.customer.create({
    data: {
      name: `${TAG} CUSTOMER`,
      shortCode: "ZZTEST",
      industry: "Telecom",
      tone: "neutral",
      status: "Active",
      logoTint: "neutral",
      location: "Greenville, SC",
      paymentTerms: "Net 30",
      notes: "Sandbox for testing the daily → approval → invoice flow. Safe to delete.",
    },
  });
  for (const r of sourceRates) {
    await db.customerRate.create({ data: { customerId: customer.id, ...r } });
  }

  // --- Project --------------------------------------------------------------
  const project = await db.project.create({
    data: {
      number: "ZZ-TEST-0001",
      name: `${TAG} PROJECT`,
      client: customer.name,
      customerId: customer.id,
      location: "Greenville, SC",
      status: "On schedule",
      tone: "success",
      forecast: "Sandbox",
      forecastTone: "neutral",
      crew: `${TAG} CREW`,
      updatedAt: "just now",
    },
  });

  // --- Crew, cleared to work ------------------------------------------------
  // The assignment gate wants approval, a complete packet and equipment on
  // file, so the sandbox crew is given all three rather than half-created.
  const compliance = [
    "General liability COI",
    "Workers' comp",
    "W-9",
    "Master subcontract",
    "Mutual NDA",
  ].map(
    (label) => ({ label, status: "valid", daysOut: 365, expires: "Dec 31, 2027" }),
  );

  const crew = await db.subcontractor.create({
    data: {
      company: `${TAG} CREW`,
      lead: "Test Operator",
      email: EMAIL,
      phone: "(864) 555-0100",
      location: "Greenville, SC",
      trades: ["Directional bore", "Plow"],
      state: "ACTIVE",
      tone: "success",
      compliance,
      complianceTone: "success",
      crewSize: 4,
      equipment: ["D20x22", "Plow", "Mini-ex"],
      notes: "Sandbox crew. Safe to delete.",
      projects: { connect: { id: project.id } },
    },
  });

  // Their own card, copied from J&P so the margin is realistic.
  const jp = await db.subcontractor.findFirst({ where: { company: { contains: "J&P" } } });
  const subRates = jp
    ? await db.subcontractorRate.findMany({
        where: { subcontractorId: jp.id, code: { in: CODES } },
        select: { code: true, description: true, unit: true, rate: true },
      })
    : [];
  for (const r of subRates) {
    await db.subcontractorRate.create({ data: { subcontractorId: crew.id, ...r } });
  }

  // --- Login ----------------------------------------------------------------
  const org = await db.organization.findFirst();
  await db.user.create({
    data: {
      email: EMAIL,
      name: "Test Operator",
      role: "SUBCONTRACTOR",
      passwordHash: await bcrypt.hash(password, 10),
      subcontractorId: crew.id,
      organizationId: org?.id,
    },
  });

  console.log(`Sandbox ready.

  Project   ${project.name}  (#${project.number})
  Customer  ${customer.name} — ${sourceRates.length} rates for ${CODES.join(", ")}
  Crew      ${crew.company} — ${subRates.length} rates, ACTIVE, packet complete
  Login     ${EMAIL}

Priced codes:`);
  for (const c of CODES) {
    const cust = sourceRates.find((r) => r.code === c);
    const sub = subRates.find((r) => r.code === c);
    console.log(
      `  ${c.padEnd(12)} bills $${(cust?.rate ?? 0).toFixed(2).padStart(8)} ${(cust?.unit ?? "?").padEnd(4)}` +
        `  costs $${(sub?.rate ?? 0).toFixed(2).padStart(8)}`,
    );
  }
}

main().finally(() => db.$disconnect());
