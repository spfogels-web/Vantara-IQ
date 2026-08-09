import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * The invoice as a PDF, for sending, filing or printing.
 *
 * Available at any status, including a draft. A draft is the version somebody
 * needs to read before deciding to send it, and gating the download behind
 * sending would mean the only way to check an invoice properly is to commit to
 * it first. A draft is watermarked instead, so a copy that leaves the building
 * can never be mistaken for one that was issued.
 *
 * Rendered from the stored lines rather than recomputed. What is on the record
 * is what prints, which is the only way the paper and the system can be held to
 * the same figures.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const me = await getCurrentUser();
  if (!me || !isStaff(me.role)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, billingEmail: true, paymentTerms: true } },
      lines: { orderBy: [{ workDate: "asc" }, { code: "asc" }] },
      payments: { orderBy: { receivedOn: "asc" } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const org = await prisma.organization.findFirst({ select: { name: true } });
  const pdf = await build(invoice, org?.name ?? "Fortitude Infrastructure LLC");

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

type InvoiceWith = Prisma.InvoiceGetPayload<{
  include: {
    customer: { select: { name: true; billingEmail: true; paymentTerms: true } };
    lines: true;
    payments: true;
  };
}>;

const PAGE = { w: 612, h: 792 };
const M = 48;
const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function build(invoice: InvoiceWith, company: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${invoice.number} — ${company}`);

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.08, 0.1, 0.13);
  const muted = rgb(0.4, 0.44, 0.5);
  const rule = rgb(0.85, 0.87, 0.9);

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;

  const text = (
    s: string,
    x: number,
    size = 9.5,
    font = body,
    colour = ink,
  ) => page.drawText(s, { x, y, size, font, color: colour });

  const right = (s: string, xRight: number, size = 9.5, font = body, colour = ink) =>
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color: colour });

  const line = (yy: number) =>
    page.drawLine({
      start: { x: M, y: yy },
      end: { x: PAGE.w - M, y: yy },
      thickness: 0.75,
      color: rule,
    });

  // --- Header ---------------------------------------------------------------
  text(company.toUpperCase(), M, 15, bold);
  right("INVOICE", PAGE.w - M, 17, bold);
  y -= 16;
  text("1309 Coffeen Avenue, Suite 1200 · Sheridan, WY 82801", M, 8.5, body, muted);
  right(invoice.number, PAGE.w - M, 11, bold, muted);
  y -= 22;
  line(y);
  y -= 18;

  // --- Who and when ---------------------------------------------------------
  const colR = PAGE.w / 2 + 10;
  text("BILL TO", M, 8, bold, muted);
  page.drawText("PERIOD", { x: colR, y, size: 8, font: bold, color: muted });
  y -= 13;
  text(invoice.customer?.name ?? "—", M, 10.5, bold);
  page.drawText(`${invoice.periodStart} to ${invoice.periodEnd}`, {
    x: colR, y, size: 10, font: body, color: ink,
  });
  y -= 13;
  if (invoice.customer?.billingEmail) {
    text(invoice.customer.billingEmail, M, 9, body, muted);
  }
  page.drawText(`Project: ${invoice.projectName || "—"}`, {
    x: colR, y, size: 9, font: body, color: muted,
  });
  y -= 13;
  page.drawText(
    `Terms: ${invoice.customer?.paymentTerms || "—"}${invoice.dueAt ? ` · Due ${invoice.dueAt}` : ""}`,
    { x: colR, y, size: 9, font: body, color: muted },
  );
  y -= 22;

  // --- Lines ----------------------------------------------------------------
  const cols = { date: M, code: M + 74, desc: M + 148, qty: 400, unit: 415, rate: 470, amt: PAGE.w - M };

  const header = () => {
    text("DATE", cols.date, 7.5, bold, muted);
    text("CODE", cols.code, 7.5, bold, muted);
    text("DESCRIPTION", cols.desc, 7.5, bold, muted);
    right("QTY", cols.qty, 7.5, bold, muted);
    text("UNIT", cols.unit, 7.5, bold, muted);
    right("RATE", cols.rate, 7.5, bold, muted);
    right("AMOUNT", cols.amt, 7.5, bold, muted);
    y -= 6;
    line(y);
    y -= 12;
  };
  header();

  for (const l of invoice.lines) {
    if (y < M + 130) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - M;
      header();
    }
    text(l.workDate || "—", cols.date, 8.5);
    text(l.code, cols.code, 8.5, bold);
    // Clipped rather than wrapped: one line per unit keeps the column of
    // amounts scannable, which is what this page is read for.
    const desc = l.description.length > 46 ? `${l.description.slice(0, 45)}…` : l.description;
    text(desc, cols.desc, 8.5, body, muted);
    right(String(l.quantity), cols.qty, 8.5);
    text(l.unit, cols.unit, 8.5, body, muted);
    right(l.rate.toFixed(2), cols.rate, 8.5);
    right(money(l.amount), cols.amt, 8.5);
    y -= 14;
  }

  y -= 4;
  line(y);
  y -= 16;

  // --- Totals ---------------------------------------------------------------
  const totalRow = (label: string, value: string, strong = false) => {
    right(label, cols.rate, strong ? 10 : 9, strong ? bold : body, strong ? ink : muted);
    right(value, cols.amt, strong ? 11 : 9.5, strong ? bold : body, ink);
    y -= strong ? 18 : 14;
  };

  totalRow("Subtotal", money(invoice.subtotal));
  if (invoice.retainageHeld > 0) {
    totalRow(`Retainage (${invoice.retainagePct}%)`, `−${money(invoice.retainageHeld)}`);
  }
  totalRow("Amount due", money(invoice.amountDue), true);

  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0);
  if (paid > 0) {
    totalRow("Received", `−${money(paid)}`);
    totalRow("Balance", money(invoice.amountDue - paid), true);
  }

  // --- Status footer --------------------------------------------------------
  y = M + 46;
  line(y + 14);
  if (invoice.status === "DRAFT") {
    text("DRAFT — not yet issued to the customer", M, 9, bold, rgb(0.75, 0.45, 0.05));
  } else if (invoice.status === "VOID") {
    text("VOID", M, 9, bold, rgb(0.7, 0.15, 0.15));
  } else {
    text(
      `${invoice.status === "PAID" ? "Paid in full" : "Issued"}${invoice.issuedAt ? ` ${invoice.issuedAt.toISOString().slice(0, 10)}` : ""}`,
      M,
      9,
      body,
      muted,
    );
  }
  y -= 12;
  text(
    `${invoice.lines.length} line${invoice.lines.length === 1 ? "" : "s"} · billed from approved daily production`,
    M,
    8,
    body,
    muted,
  );

  // A draft has to be unmistakable from across a desk, not only in the footer.
  if (invoice.status === "DRAFT" || invoice.status === "VOID") {
    const mark = invoice.status;
    for (const p of pdf.getPages()) {
      p.drawText(mark, {
        x: 118,
        y: 300,
        size: 96,
        font: bold,
        color: invoice.status === "VOID" ? rgb(0.95, 0.86, 0.86) : rgb(0.96, 0.93, 0.86),
        opacity: 0.55,
        rotate: { type: "degrees", angle: 32 } as never,
      });
    }
  }

  return pdf.save();
}
