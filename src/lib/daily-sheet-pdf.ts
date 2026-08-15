import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { safe } from "@/lib/pdf-text";

/**
 * The Globe "Subcontractor Daily Billing Sheet" (GLS-203155) as a PDF.
 *
 * The browser can already print this page, and that path stays. This exists
 * because printing depends on a setting we do not control: the form is 17
 * columns wide and only fits sideways, and a print dialog left on portrait
 * silently crops the right-hand unit code columns off the paper. A sheet
 * texted to a supervisor that way showed 5 of 10 unit codes with nothing on
 * the page to say the rest existed.
 *
 * Built server-side at a fixed landscape size, this cannot be cropped by
 * anyone's dialog. What is in the file is what was on the sheet.
 */

/** Letter, landscape. The whole point — the form does not fit portrait. */
const PAGE = { w: 792, h: 612 };
const M = 22;

const ROW_H = 13.5;
const HEAD_H = 20;

/** The saved sheet, as it comes back out of the JSON columns. */
export type SheetForPdf = {
  projectName: string;
  workDate: string;
  header: Record<string, unknown>;
  laborCodes: string[];
  laborRows: { print: string; location: string; cells: string[]; remarks: string }[];
  matCodes: string[];
  matRows: {
    print: string;
    start: string;
    stop: string;
    mat: boolean;
    cells: string[];
    reel: string;
    cableStart: string;
    cableStop: string;
  }[];
  notes: string;
  status: string;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: string) => Number.parseFloat(v) || 0;

/** Column totals, the way the paper form foots each code column. */
function columnTotals(rows: { cells: string[] }[], cols: number): number[] {
  return Array.from({ length: cols }, (_, c) =>
    rows.reduce((sum, r) => sum + num(r.cells?.[c] ?? ""), 0),
  );
}

const fmt = (n: number) =>
  n === 0 ? "" : Number(n.toFixed(2)).toLocaleString("en-US");

export async function buildDailySheetPdf(sheet: SheetForPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const h = sheet.header ?? {};
  pdf.setTitle(safe(`Daily billing sheet — ${sheet.projectName || "Fortitude"}`));

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const ink = rgb(0, 0, 0);
  const muted = rgb(0.42, 0.45, 0.5);
  const rule = rgb(0.33, 0.33, 0.33);
  const shade = rgb(0.94, 0.95, 0.96);

  let page: PDFPage = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;

  const text = (
    s: string,
    x: number,
    yy: number,
    size = 7,
    font: PDFFont = body,
    colour = ink,
  ) => page.drawText(safe(s), { x, y: yy, size, font, color: colour });

  /** Centre a string in a column — the grid cells are all centred. */
  const centre = (s: string, x: number, w: number, yy: number, size = 7, font: PDFFont = body) => {
    const t = safe(s);
    if (!t) return;
    const tw = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: x + (w - tw) / 2, y: yy, size, font, color: ink });
  };

  /** Clip a string to a column so a long location number cannot bleed out. */
  const clip = (s: string, w: number, size: number, font: PDFFont) => {
    let t = safe(s);
    if (!t) return t;
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > w - 4) t = t.slice(0, -1);
    return t;
  };

  const box = (x: number, yy: number, w: number, hh: number, fill?: ReturnType<typeof rgb>) =>
    page.drawRectangle({
      x,
      y: yy,
      width: w,
      height: hh,
      borderColor: rule,
      borderWidth: 0.5,
      ...(fill ? { color: fill } : {}),
    });

  // ── Masthead ────────────────────────────────────────────────────────
  const W = PAGE.w - M * 2;
  text("GLOBE COMMUNICATIONS, LLC.", M + W / 2 - 78, y - 9, 10.5, bold);
  text("GLS - 203155", PAGE.w - M - 52, y - 9, 8, bold);
  y -= 20;
  text("SUBCONTRACTOR DAILY BILLING SHEET", M + W / 2 - 82, y - 2, 8, bold);
  if (sheet.status !== "SUBMITTED") {
    text("DRAFT", M, y - 2, 8, bold, rgb(0.7, 0.2, 0.2));
  }
  y -= 14;

  // ── Header fields ───────────────────────────────────────────────────
  // Two rows of labelled boxes, same order as the paper form so a foreman
  // reads it in the place they expect.
  const fieldRow = (fields: { label: string; value: string }[], rowY: number) => {
    const fw = W / fields.length;
    fields.forEach((f, i) => {
      const x = M + i * fw;
      box(x, rowY - HEAD_H, fw, HEAD_H);
      text(f.label, x + 3, rowY - 7.5, 5, bold, muted);
      text(clip(f.value, fw, 7.5, body), x + 3, rowY - 16.5, 7.5, body);
    });
  };

  const employees = Array.isArray(h.employees) ? (h.employees as unknown[]).map(str) : [];

  fieldRow(
    [
      { label: "EXCHANGE / WORK ORDER NUMBER", value: str(h.exchange) },
      { label: "CREW NUMBER", value: str(h.crewNumber) },
      { label: "CUSTOMER NAME", value: str(h.customer) },
      { label: "WORK ORDER TITLE / JOB NAME", value: str(h.jobName) || sheet.projectName },
    ],
    y,
  );
  y -= HEAD_H;
  fieldRow(
    [
      { label: "DATE WORK PERFORMED", value: str(h.dateWorked) || sheet.workDate },
      { label: "PROJECT NUMBER", value: str(h.projectNumber) },
      {
        label: "WORK ORDER COMPLETE",
        value: h.complete === "yes" ? "YES" : h.complete === "no" ? "NO" : "",
      },
      { label: "SUPERVISOR APPROVAL / DATE", value: str(h.supervisorSignature) },
    ],
    y,
  );
  y -= HEAD_H;
  fieldRow(
    [
      { label: "SUBCONTRACTOR EMPLOYEE NAME", value: employees[0] ?? "" },
      { label: "SUBCONTRACTOR EMPLOYEE NAME", value: employees[1] ?? "" },
      { label: "SUBCONTRACTOR EMPLOYEE NAME", value: employees[2] ?? "" },
      { label: "SUBCONTRACTOR APPROVAL / DATE", value: str(h.subcontractorSignature) },
    ],
    y,
  );
  y -= HEAD_H + 6;

  // ── Production grid ─────────────────────────────────────────────────
  const nUnit = Math.max(sheet.laborCodes.length, 1);
  const LAB = { print: 46, loc: 118, remarks: 74 };
  const unitW = (W - LAB.print - LAB.loc - LAB.remarks) / nUnit;

  /** Column header band for the production grid. Redrawn on a new page. */
  const drawLaborHead = () => {
    let x = M;
    box(x, y - HEAD_H, LAB.print, HEAD_H, shade);
    text("PRINT NUMBER", x + 3, y - 12, 5, bold, muted);
    x += LAB.print;
    box(x, y - HEAD_H, LAB.loc, HEAD_H, shade);
    text("PED / POLE LOCATION NUMBER", x + 3, y - 12, 5, bold, muted);
    x += LAB.loc;
    for (let i = 0; i < nUnit; i++) {
      box(x, y - HEAD_H, unitW, HEAD_H, shade);
      text("UNIT CODE", x + 2, y - 7, 4.2, body, muted);
      centre(clip(sheet.laborCodes[i] ?? "", unitW, 6, bold), x, unitW, y - 16, 6, bold);
      x += unitW;
    }
    box(x, y - HEAD_H, LAB.remarks, HEAD_H, shade);
    text("REMARKS", x + 3, y - 12, 5, bold, muted);
    y -= HEAD_H;
  };

  /** A new page mid-grid keeps its column headers, or the numbers are orphaned. */
  const ensureRoom = (need: number, redrawHead: () => void) => {
    if (y - need >= M) return;
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
    redrawHead();
  };

  drawLaborHead();

  for (const row of sheet.laborRows) {
    ensureRoom(ROW_H, drawLaborHead);
    let x = M;
    box(x, y - ROW_H, LAB.print, ROW_H);
    centre(clip(row.print, LAB.print, 7, body), x, LAB.print, y - 9.5, 7);
    x += LAB.print;
    box(x, y - ROW_H, LAB.loc, ROW_H);
    text(clip(row.location, LAB.loc, 7, body), x + 3, y - 9.5, 7);
    x += LAB.loc;
    for (let i = 0; i < nUnit; i++) {
      box(x, y - ROW_H, unitW, ROW_H);
      centre(clip(row.cells?.[i] ?? "", unitW, 7, mono), x, unitW, y - 9.5, 7, mono);
      x += unitW;
    }
    box(x, y - ROW_H, LAB.remarks, ROW_H);
    text(clip(row.remarks, LAB.remarks, 6, body), x + 2, y - 9.5, 6);
    y -= ROW_H;
  }

  // Totals — the row the invoice is actually built from.
  ensureRoom(ROW_H, drawLaborHead);
  {
    const totals = columnTotals(sheet.laborRows, nUnit);
    let x = M;
    box(x, y - ROW_H, LAB.print + LAB.loc, ROW_H, shade);
    text("TOTALS", x + 4, y - 9.5, 6.5, bold);
    x += LAB.print + LAB.loc;
    for (let i = 0; i < nUnit; i++) {
      box(x, y - ROW_H, unitW, ROW_H, shade);
      centre(fmt(totals[i]), x, unitW, y - 9.5, 7, bold);
      x += unitW;
    }
    box(x, y - ROW_H, LAB.remarks, ROW_H, shade);
    y -= ROW_H + 6;
  }

  // ── Material-only section ───────────────────────────────────────────
  const nMat = Math.max(sheet.matCodes.length, 1);
  const MAT = { print: 46, start: 66, stop: 78, mat: 26, reel: 56, cs: 50, ce: 50 };
  const matW =
    (W - MAT.print - MAT.start - MAT.stop - MAT.mat - MAT.reel - MAT.cs - MAT.ce) / nMat;

  const drawMatHead = () => {
    let x = M;
    const cell = (w: number, label: string) => {
      box(x, y - HEAD_H, w, HEAD_H, shade);
      text(label, x + 2, y - 12, 4.6, bold, muted);
      x += w;
    };
    cell(MAT.print, "PRINT NUMBER");
    cell(MAT.start, "PED / POLE START");
    cell(MAT.stop, "STOP (OR) INCOMPLETE");
    cell(MAT.mat, "MAT");
    for (let i = 0; i < nMat; i++) {
      box(x, y - HEAD_H, matW, HEAD_H, shade);
      text("MAT CODE", x + 2, y - 7, 4.2, body, muted);
      centre(clip(sheet.matCodes[i] ?? "", matW, 6, bold), x, matW, y - 16, 6, bold);
      x += matW;
    }
    cell(MAT.reel, "CABLE / PIPE REEL");
    cell(MAT.cs, "CABLE START");
    cell(MAT.ce, "CABLE STOP");
    y -= HEAD_H;
  };

  ensureRoom(HEAD_H + ROW_H * 2, () => {});
  page.drawRectangle({
    x: M,
    y: y - 12,
    width: W,
    height: 12,
    color: shade,
    borderColor: rule,
    borderWidth: 0.5,
  });
  text(
    "REPORT MATERIAL ONLY IN THE SECTION BELOW - CIRCLE (MAT) IF MATERIAL ONLY APPLIES",
    M + W / 2 - 132,
    y - 8.5,
    6,
    bold,
  );
  y -= 12;
  drawMatHead();

  for (const row of sheet.matRows) {
    ensureRoom(ROW_H, drawMatHead);
    let x = M;
    box(x, y - ROW_H, MAT.print, ROW_H);
    centre(clip(row.print, MAT.print, 7, body), x, MAT.print, y - 9.5, 7);
    x += MAT.print;
    box(x, y - ROW_H, MAT.start, ROW_H);
    centre(clip(row.start, MAT.start, 7, body), x, MAT.start, y - 9.5, 7);
    x += MAT.start;
    box(x, y - ROW_H, MAT.stop, ROW_H);
    centre(clip(row.stop, MAT.stop, 7, body), x, MAT.stop, y - 9.5, 7);
    x += MAT.stop;
    box(x, y - ROW_H, MAT.mat, ROW_H);
    if (row.mat) centre("MAT", x, MAT.mat, y - 9.5, 5.5, bold);
    x += MAT.mat;
    for (let i = 0; i < nMat; i++) {
      box(x, y - ROW_H, matW, ROW_H);
      centre(clip(row.cells?.[i] ?? "", matW, 7, mono), x, matW, y - 9.5, 7, mono);
      x += matW;
    }
    box(x, y - ROW_H, MAT.reel, ROW_H);
    centre(clip(row.reel, MAT.reel, 6.5, body), x, MAT.reel, y - 9.5, 6.5);
    x += MAT.reel;
    box(x, y - ROW_H, MAT.cs, ROW_H);
    centre(clip(row.cableStart, MAT.cs, 6.5, body), x, MAT.cs, y - 9.5, 6.5);
    x += MAT.cs;
    box(x, y - ROW_H, MAT.ce, ROW_H);
    centre(clip(row.cableStop, MAT.ce, 6.5, body), x, MAT.ce, y - 9.5, 6.5);
    y -= ROW_H;
  }

  ensureRoom(ROW_H, drawMatHead);
  {
    const totals = columnTotals(sheet.matRows, nMat);
    const lead = MAT.print + MAT.start + MAT.stop + MAT.mat;
    let x = M;
    box(x, y - ROW_H, lead, ROW_H, shade);
    text("TOTALS", x + 4, y - 9.5, 6.5, bold);
    x += lead;
    for (let i = 0; i < nMat; i++) {
      box(x, y - ROW_H, matW, ROW_H, shade);
      centre(fmt(totals[i]), x, matW, y - 9.5, 7, bold);
      x += matW;
    }
    box(x, y - ROW_H, MAT.reel + MAT.cs + MAT.ce, ROW_H, shade);
    y -= ROW_H;
  }

  // ── Notes ───────────────────────────────────────────────────────────
  // Where "hit rock at STA 12+40, switched to missile" lives. It is the only
  // record of why a day's production looks the way it does, so it ships with
  // the numbers rather than being dropped for space.
  if (sheet.notes.trim()) {
    const lines: string[] = [];
    let line = "";
    for (const word of safe(sheet.notes).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (body.widthOfTextAtSize(next, 7) > W - 40) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);

    ensureRoom(14 + lines.length * 9, () => {});
    box(M, y - (12 + lines.length * 9), W, 12 + lines.length * 9);
    text("NOTES", M + 3, y - 8.5, 5.5, bold, muted);
    lines.forEach((l, i) => text(l, M + 34, y - 8.5 - i * 9, 7));
    y -= 12 + lines.length * 9;
  }

  return pdf.save();
}
