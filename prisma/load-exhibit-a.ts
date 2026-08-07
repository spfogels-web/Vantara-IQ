/**
 * Load the signed Exhibit A onto the customer's rate card, exactly as printed.
 *
 * Run: npx tsx prisma/load-exhibit-a.ts "<path to Exhibit A.pdf>" "<customer name>"
 *
 * Reads the PDF's own text layer with the deterministic two-column parser — no
 * AI, no rounding, no invented codes. Existing rates for the same code are
 * updated in place so a code that was already correct keeps its history, and
 * anything already on the card that the sheet does not mention is left alone
 * rather than silently deleted.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { pdfTextLayer, parseRateSheet } from "../src/lib/parse-material-list";
import { isLabourOrEquipmentCode } from "../src/lib/unit-codes";

const db = new PrismaClient();

/**
 * Exhibit A prints a price table with no unit column, so units come from the
 * work itself — the same ones on the signed sub card. Anything we have no
 * evidence for stays blank; a guessed "ea" on a footage code is how a rate
 * card starts disagreeing with the contract.
 */
function unitFor(code: string): string {
  if (isLabourOrEquipmentCode(code)) return "hr";
  if (/^(BFO\d|BFO\d+RI|BFOV|BM6[01]|CO\d|UO\d|TRACEWIRE|CWR|CF\(|UF\d|SEB)/i.test(code)) return "ft";
  if (/^(BD[45O]|BHF|BM2|BM53|BM82|BMFA|BG2|PE\d|FDH)/i.test(code)) return "ea";
  return "";
}

async function main() {
  const [file, customerName] = process.argv.slice(2);
  if (!file || !customerName) {
    console.error('usage: tsx prisma/load-exhibit-a.ts "<pdf>" "<customer name>"');
    process.exit(1);
  }

  const customer = await db.customer.findFirst({ where: { name: customerName } });
  if (!customer) {
    console.error(`No customer named "${customerName}".`);
    process.exit(1);
  }

  const text = await pdfTextLayer(readFileSync(file));
  if (!text) {
    console.error("That PDF has no text layer — it is a scan, and needs OCR first.");
    process.exit(1);
  }

  const rows = parseRateSheet(text);
  if (rows.length < 100) {
    console.error(`Only ${rows.length} rows parsed — that is too few for an Exhibit A. Stopping rather than half-loading the card.`);
    process.exit(1);
  }

  const existing = await db.customerRate.findMany({
    where: { customerId: customer.id },
    select: { id: true, code: true, rate: true, unit: true, description: true },
  });
  const byCode = new Map(existing.map((r) => [r.code, r]));

  let added = 0;
  let changed = 0;
  let same = 0;
  const moved: string[] = [];

  for (const { code, rate } of rows) {
    const prior = byCode.get(code);
    if (!prior) {
      await db.customerRate.create({
        data: {
          customerId: customer.id,
          code,
          rate,
          unit: unitFor(code),
          description: "",
          source: "exhibit-a",
        },
      });
      added++;
      continue;
    }
    if (prior.rate !== rate) {
      moved.push(`${code}: ${prior.rate} -> ${rate}`);
      changed++;
    } else {
      same++;
    }
    await db.customerRate.update({
      where: { id: prior.id },
      data: { rate, unit: prior.unit || unitFor(code), source: "exhibit-a" },
    });
  }

  console.log(`\n${customer.name}`);
  console.log(`  parsed   ${rows.length} rows from ${file.split(/[\\/]/).pop()}`);
  console.log(`  added    ${added}`);
  console.log(`  matched  ${same} (already exact)`);
  console.log(`  changed  ${changed}`);
  for (const m of moved) console.log(`      ${m}`);
}

main().finally(() => db.$disconnect());
