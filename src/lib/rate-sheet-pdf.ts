import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Render a subcontractor rate sheet as a real PDF.
 *
 * Generated from the live rates rather than edited as a file, which is the
 * whole point: change a rate from $5.00 to $5.50 in the app and re-generate,
 * and the sheet is correct everywhere it matters — the PDF you send, the
 * pricing engine, and the pay application — instead of a spreadsheet and a
 * database drifting apart.
 *
 * Laid out to match the Georgia sheet the crews already know: work grouped
 * under its heading, unit and rate to the right, notes beside the group, and a
 * signature block at the foot.
 */

export interface RateSheetLine {
  code: string;
  description: string;
  unit: string;
  rate: number;
}

export interface RateSheetInput {
  companyName: string;
  subcontractorName: string;
  title: string;
  subtitle: string;
  terms: string;
  lines: RateSheetLine[];
  /** PNG or JPEG bytes for the company mark, when one is on file. */
  logo?: { bytes: Uint8Array; mime: string } | null;
  generatedOn: string;
}

const PAGE = { w: 612, h: 792 };
const M = 48;

const INK = rgb(0.09, 0.11, 0.14);
const MUTED = rgb(0.42, 0.46, 0.52);
const RULE = rgb(0.82, 0.85, 0.89);
const BAND = rgb(0.95, 0.96, 0.98);
const ACCENT = rgb(0.11, 0.4, 0.85);

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Group the codes the way the paper sheet does.
 *
 * Order matters — a crew reads down looking for their work, and plow before
 * bore before hardware is the order the day happens in.
 */
function groupOf(code: string): string {
  const c = code.trim().toUpperCase();
  if (/^BFOV/.test(c)) return c.includes("(D)") ? "Adders" : "Plow — microduct";
  if (/RI$/.test(c)) return "Microfiber";
  if (/^BFO/.test(c)) return "Plow — main";
  if (/^BM6[01]/.test(c)) return "Missile / bore";
  if (/^BD\d/.test(c) || /^BDO/.test(c)) return "Pedestals";
  if (/^BM2F$/.test(c)) return "Ground rod";
  if (/^BMFA/.test(c)) return "Ant control";
  return "Other";
}

const GROUP_ORDER = [
  "Plow — microduct",
  "Adders",
  "Plow — main",
  "Microfiber",
  "Missile / bore",
  "Pedestals",
  "Ground rod",
  "Ant control",
  "Other",
];

export async function buildRateSheetPdf(input: RateSheetInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(input.title);
  pdf.setSubject(`Rate sheet for ${input.subcontractorName}`);
  pdf.setProducer("Vantara IQ");

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;

  // ---- header ------------------------------------------------------------
  if (input.logo) {
    try {
      const img = input.logo.mime.includes("png")
        ? await pdf.embedPng(input.logo.bytes)
        : await pdf.embedJpg(input.logo.bytes);
      const h = 38;
      const w = (img.width / img.height) * h;
      page.drawImage(img, { x: M, y: y - h, width: Math.min(w, 150), height: h });
    } catch {
      // A logo that won't embed must not cost you the rate sheet.
    }
  }

  page.drawText(input.companyName, { x: M + 160, y: y - 12, size: 13, font: bold, color: INK });
  page.drawText(input.title, { x: M + 160, y: y - 27, size: 10, font: body, color: MUTED });
  y -= 56;

  page.drawLine({ start: { x: M, y }, end: { x: PAGE.w - M, y }, thickness: 1, color: RULE });
  y -= 20;

  page.drawText(input.subcontractorName || "Subcontractor: ______________________", {
    x: M,
    y,
    size: 12,
    font: bold,
    color: INK,
  });
  y -= 15;
  page.drawText(input.subtitle, { x: M, y, size: 9, font: body, color: MUTED });
  y -= 12;
  page.drawText(input.terms, { x: M, y, size: 9, font: bold, color: ACCENT });
  y -= 22;

  // ---- rates -------------------------------------------------------------
  const grouped = new Map<string, RateSheetLine[]>();
  for (const line of input.lines) {
    const g = groupOf(line.code);
    grouped.set(g, [...(grouped.get(g) ?? []), line]);
  }

  const newPage = () => {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
  };

  for (const group of GROUP_ORDER) {
    const rows = grouped.get(group);
    if (!rows?.length) continue;

    if (y < M + 90) newPage();

    page.drawRectangle({ x: M, y: y - 14, width: PAGE.w - M * 2, height: 18, color: BAND });
    page.drawText(group.toUpperCase(), {
      x: M + 6,
      y: y - 9,
      size: 8.5,
      font: bold,
      color: INK,
    });
    y -= 26;

    for (const r of rows.sort((a, b) => a.code.localeCompare(b.code))) {
      if (y < M + 40) newPage();

      page.drawText(r.code, { x: M + 6, y, size: 9.5, font: bold, color: INK });
      if (r.description) {
        page.drawText(truncate(r.description, body, 8.5, 250), {
          x: M + 150,
          y,
          size: 8.5,
          font: body,
          color: MUTED,
        });
      }
      page.drawText(r.unit || "", { x: PAGE.w - M - 108, y, size: 8.5, font: body, color: MUTED });

      const rate = money(r.rate);
      page.drawText(rate, {
        x: PAGE.w - M - 6 - bold.widthOfTextAtSize(rate, 10),
        y,
        size: 10,
        font: bold,
        color: INK,
      });
      y -= 15;
    }
    y -= 6;
  }

  // ---- signature ---------------------------------------------------------
  if (y < M + 120) newPage();
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE.w - M, y }, thickness: 1, color: RULE });
  y -= 26;

  for (const label of ["Subcontractor company name", "Subcontractor signature", "Date"]) {
    page.drawText(label, { x: M, y, size: 9, font: body, color: MUTED });
    page.drawLine({
      start: { x: M + 150, y: y - 2 },
      end: { x: PAGE.w - M, y: y - 2 },
      thickness: 0.75,
      color: RULE,
    });
    y -= 30;
  }

  // A generated sheet must say when it was generated — otherwise two printouts
  // of different versions are indistinguishable on the desk.
  page.drawText(`Generated ${input.generatedOn} · ${input.lines.length} unit rates`, {
    x: M,
    y: M - 14,
    size: 7.5,
    font: body,
    color: MUTED,
  });

  return pdf.save();
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

export type { PDFPage };
