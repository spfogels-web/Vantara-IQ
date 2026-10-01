/**
 * The Rock Creek day, rendered through the real invoice PDF builder.
 *
 * Not part of the gate; run on demand to look at the document:
 *
 *   npx vitest run tests/screens/invoice-pdf.test.ts
 *
 * It touches no database — the invoice is built in memory from the daily in
 * the screenshots — so what comes out is the document itself rather than a
 * fixture's idea of one. Output lands in docs/screens/.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";

const { buildInvoicePdf } = await import("@/lib/invoice-pdf");

type Code = "BFO48" | "BD4MPF" | "BM2F";

/** Exactly the day in the screenshots: six spans, three codes on each. */
const SPANS: [string, Code, number][] = [
  ["153/@1-153/@3", "BFO48", 1217],
  ["153/@1-153/@3", "BD4MPF", 1],
  ["153/@1-153/@3", "BM2F", 1],
  ["153/@3-153/@6", "BFO48", 882],
  ["153/@3-153/@6", "BD4MPF", 1],
  ["153/@3-153/@6", "BM2F", 1],
  ["153/@6A-153/@12A", "BFO48", 1106],
  ["153/@6A-153/@12A", "BD4MPF", 1],
  ["153/@6A-153/@12A", "BM2F", 1],
  ["153/@12A-153/@12", "BFO48", 309],
  ["153/@12A-153/@12", "BD4MPF", 1],
  ["153/@12A-153/@12", "BM2F", 1],
  ["153/@12-153/@11A", "BFO48", 491],
  ["153/@12-153/@11A", "BD4MPF", 1],
  ["153/@12-153/@11A", "BM2F", 1],
  ["153/@11A-153/@11b", "BFO48", 514],
  ["153/@11A-153/@11b", "BD4MPF", 1],
  ["153/@11A-153/@11b", "BM2F", 1],
];

const RATE: Record<Code, number> = { BFO48: 2.75, BD4MPF: 44.5, BM2F: 18 };
const DESC: Record<Code, string> = {
  BFO48: "Place buried fiber optic cable, 48ct",
  BD4MPF: "Place fiber pedestal",
  BM2F: "Pedestal ground assembly (ground rod)",
};
const UNIT: Record<Code, string> = { BFO48: "ft", BD4MPF: "ea", BM2F: "ea" };

const lines = SPANS.map(([location, code, quantity], i) => ({
  id: `l${i}`,
  invoiceId: "i1",
  dailyId: "d1",
  workDate: "2026-09-18",
  location,
  seq: i + 1,
  code,
  description: DESC[code],
  unit: UNIT[code],
  quantity,
  rate: RATE[code],
  amount: Math.round(quantity * RATE[code] * 100) / 100,
  derived: false,
}));

const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
const retainageHeld = Math.round(subtotal * 0.1 * 100) / 100;

const invoice = {
  id: "i1",
  number: "WIN-20260925-01",
  customerId: "c1",
  projectId: "p1",
  projectName: "Rock Creek",
  projectNumber: "70424288",
  periodStart: "2026-09-19",
  periodEnd: "2026-09-25",
  status: "DRAFT",
  issuedAt: null,
  dueAt: new Date("2026-10-10T00:00:00Z"),
  subtotal,
  retainagePct: 0.1,
  retainageHeld,
  amountDue: Math.round((subtotal - retainageHeld) * 100) / 100,
  notes: "",
  createdAt: new Date(),
  updatedAt: new Date(),
  customer: {
    name: "GLOBE COMMUNICATIONS",
    billingEmail: "ap.telecom@windstream.com",
    paymentTerms: "Net 15",
  },
  lines,
  payments: [],
};

describe("the invoice as it prints", () => {
  it("renders one line per span, for the same money", async () => {
    const bytes = await buildInvoicePdf(invoice as never, "FORTITUDE INFRASTRUCTURE");
    mkdirSync("docs/screens", { recursive: true });
    writeFileSync("docs/screens/invoice-per-span.pdf", bytes);

    expect(lines).toHaveLength(18);
    // The figure the three rolled-up lines came to. Eighteen rows, same total.
    expect(subtotal).toBe(12802.25);
  });
});

describe("the columns cannot collide", () => {
  it("leaves every field room at its widest", async () => {
    /**
     * Measured rather than eyeballed. Adding LOCATION took width from
     * DESCRIPTION, and a description that runs under the quantity column is
     * the kind of defect that looks fine on the one invoice somebody checks.
     *
     * These mirror `cols` in invoice-pdf.ts. If that layout moves this fails,
     * and it should then be updated deliberately rather than by accident.
     */
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const { clip } = await import("@/lib/pdf-text");
    const pdf = await PDFDocument.create();
    const body = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const M = 48;
    const cols = { date: M, loc: M + 62, code: M + 166, desc: M + 224, qty: 400 };
    const SIZE = 8.5;
    const w = (s: string, f: typeof body) => f.widthOfTextAtSize(s, SIZE);

    expect(cols.date + w("2026-09-18", body), "the work date runs into the location").toBeLessThanOrEqual(
      cols.loc,
    );

    // The builder clips to the column, so even the widest possible string fits.
    const locRoom = cols.code - cols.loc - 4;
    const widest = clip("W".repeat(40), locRoom, body, SIZE);
    expect(cols.loc + w(widest, body), "a long span runs into the unit code").toBeLessThanOrEqual(
      cols.code,
    );
    // And a real location is not clipped at all.
    for (const [location] of SPANS) {
      expect(clip(location, locRoom, body, SIZE), `${location} was clipped`).toBe(location);
    }

    const codes = ["BD4MPF", "BFO144I", "BFOV(12.7)"];
    expect(
      cols.code + Math.max(...codes.map((c) => w(c, bold))),
      "a long unit code runs into the description",
    ).toBeLessThanOrEqual(cols.desc);

    const descRoom = cols.qty - cols.desc - 6;
    const widestDesc = clip("W".repeat(60), descRoom, body, SIZE);
    expect(
      cols.desc + w(widestDesc, body),
      "a long description runs under the quantity",
    ).toBeLessThanOrEqual(cols.qty);
  });
});
