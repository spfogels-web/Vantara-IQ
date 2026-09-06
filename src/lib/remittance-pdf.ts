import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Prisma } from "@prisma/client";

import { safe } from "@/lib/pdf-text";
import { addDays } from "@/lib/billing";
import { statementMoney } from "@/lib/fast-pay";
import { embedOrgLogo, logoBox } from "@/lib/pdf-logo";

/**
 * Remittance advice — the letter that goes out with a payment to a crew.
 *
 * It answers the three questions a foreman actually asks: what is this money
 * for, how was it worked out, and where is it going. So it carries the days
 * behind the figure, not just a total — a crew who can see the work dates and
 * footage can reconcile it against their own notes without ringing the office.
 *
 * Bank details are the last four digits and nothing more. This document gets
 * emailed, forwarded and printed, and a full account number on it would be a
 * liability we have no reason to take on: four digits is enough for the crew
 * to confirm it landed in the right account, which is all it is for.
 *
 * A fee only appears when one was charged. Standard terms are NET 21 with
 * nothing taken off, and printing "Fee $0.00" on a statement that never had a
 * fee invites the question of why it is there at all.
 */

export type RemittanceInvoice = Prisma.SubInvoiceGetPayload<{
  include: {
    subcontractor: {
      select: {
        company: true;
        lead: true;
        email: true;
        ach: {
          select: {
            legalName: true;
            bankName: true;
            accountType: true;
            accountLast4: true;
            routingLast4: true;
          };
        };
      };
    };
    lines: true;
    payments: true;
  };
}>;

const PAGE = { w: 612, h: 792 };
const M = 48;
const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function buildRemittancePdf(
  inv: RemittanceInvoice,
  company: string,
  logoUrl?: string | null,
  /** This deployment's own origin, so the mark can be resized on the way in. */
  origin?: string | null,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Remittance advice ${inv.number} — ${inv.subcontractor.company}`);

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.08, 0.1, 0.13);
  const muted = rgb(0.4, 0.44, 0.5);
  const rule = rgb(0.85, 0.87, 0.9);
  const gold = rgb(0.54, 0.36, 0.04);

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;

  const text = (s: string, x: number, size = 9.5, font = body, colour = ink) =>
    page.drawText(safe(s), { x, y, size, font, color: colour });
  const right = (s: string, xRight: number, size = 9.5, font = body, colour = ink) =>
    page.drawText(safe(s), {
      x: xRight - font.widthOfTextAtSize(safe(s), size),
      y,
      size,
      font,
      color: colour,
    });
  const line = (colour = rule) =>
    page.drawLine({
      start: { x: M, y: y },
      end: { x: PAGE.w - M, y: y },
      thickness: 0.7,
      color: colour,
    });
  /** Start a fresh page when the next block will not fit on this one. */
  const room = (needed: number) => {
    if (y - needed > M + 40) return;
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
  };

  const R = PAGE.w - M;

  // ── Heading ──────────────────────────────────────────────────────────
  // The mark, when there is one. The name still prints beside it: a logo is
  // recognition, the legal name is what a bank and an accountant need.
  const logo = await embedOrgLogo(pdf, logoUrl, origin);
  let nameX = M;
  if (logo) {
    const { width, height } = logoBox(logo, 46, 30);
    page.drawImage(logo, { x: M, y: y - height + 11, width, height });
    nameX = M + width + 10;
  }
  text(company, nameX, 15, bold);
  right("REMITTANCE ADVICE", R, 13, bold, gold);
  y -= 15;
  text("Underground utility and fiber construction", nameX, 9, body, muted);
  right(inv.number, R, 10, bold);
  y -= 12;
  right(
    inv.fastPay ? `Fast pay — NET ${inv.termsDays}, wire` : `NET ${inv.termsDays}`,
    R,
    9,
    body,
    muted,
  );
  y -= 14;
  line(gold);
  y -= 20;

  // ── Who it is for, and what it covers ────────────────────────────────
  const colR = PAGE.w / 2 + 10;
  text("PAID TO", M, 8, bold, muted);
  page.drawText(safe("FOR WORK"), { x: colR, y, size: 8, font: bold, color: muted });
  y -= 13;

  const ach = inv.subcontractor.ach;
  const payee = ach?.legalName?.trim() || inv.subcontractor.company;
  text(payee, M, 11, bold);
  page.drawText(safe(`Period ${inv.periodStart} to ${inv.periodEnd}`), {
    x: colR,
    y,
    size: 9.5,
    font: body,
    color: ink,
  });
  y -= 12;

  if (payee !== inv.subcontractor.company) {
    text(inv.subcontractor.company, M, 9, body, muted);
  }
  const due = inv.periodEnd ? addDays(inv.periodEnd, inv.termsDays) : "";
  page.drawText(safe(due ? `Due ${due}` : ""), {
    x: colR,
    y,
    size: 9,
    font: body,
    color: muted,
  });
  y -= 12;

  if (inv.subcontractor.lead) text(inv.subcontractor.lead, M, 9, body, muted);
  page.drawText(safe(inv.projectName ? `Job ${inv.projectName}` : ""), {
    x: colR,
    y,
    size: 9,
    font: body,
    color: muted,
  });
  y -= 12;
  if (inv.subcontractor.email) text(inv.subcontractor.email, M, 9, body, muted);
  y -= 22;

  // ── The days behind the figure ───────────────────────────────────────
  text("WORK COVERED", M, 8, bold, muted);
  y -= 12;
  line();
  y -= 12;

  const cols = { date: M, code: M + 78, qty: M + 250, rate: M + 330, amount: R };
  text("WORK DATE", cols.date, 7.5, bold, muted);
  text("UNIT CODE", cols.code, 7.5, bold, muted);
  page.drawText("QUANTITY", { x: cols.qty, y, size: 7.5, font: bold, color: muted });
  page.drawText("RATE", { x: cols.rate, y, size: 7.5, font: bold, color: muted });
  right("AMOUNT", cols.amount, 7.5, bold, muted);
  y -= 11;
  line();
  y -= 13;

  for (const l of inv.lines) {
    room(30);
    text(l.workDate || "—", cols.date, 9);
    text(l.code || "—", cols.code, 9);
    page.drawText(safe(`${l.quantity.toLocaleString("en-US")} ${l.unit || ""}`.trim()), {
      x: cols.qty,
      y,
      size: 9,
      font: body,
      color: ink,
    });
    page.drawText(safe(money(l.rate)), { x: cols.rate, y, size: 9, font: body, color: ink });
    right(money(l.amount), cols.amount, 9);
    y -= 13;
  }

  if (inv.lines.length === 0) {
    text("No lines on this statement.", cols.date, 9, body, muted);
    y -= 13;
  }

  y -= 4;
  line();
  y -= 16;

  // ── The money ────────────────────────────────────────────────────────
  room(90);
  // Every figure from the one place that knows the order: retainage first,
  // then any fast-pay fee on what is left.
  const m = statementMoney(inv);

  text("Gross earned", cols.rate - 60, 9.5, body, muted);
  right(money(m.gross), R, 9.5);
  y -= 14;

  if (m.retainage > 0) {
    text(
      `Retainage held (${Math.round(m.retainagePct * 1000) / 10}%)`,
      cols.rate - 60,
      9.5,
      body,
      muted,
    );
    right(`-${money(m.retainage)}`, R, 9.5);
    y -= 14;
  }

  if (m.fee > 0) {
    text(`Fast pay fee (${m.feePct}%)`, cols.rate - 60, 9.5, body, muted);
    right(`-${money(m.fee)}`, R, 9.5);
    y -= 14;
  }

  line();
  y -= 16;
  text("NET PAID", cols.rate - 60, 11, bold);
  right(money(m.net), R, 13, bold, gold);
  y -= 24;

  if (m.retainage > 0) {
    // Said plainly. Retainage is the single line on this document most likely
    // to prompt a phone call, and "held" and "deducted" are different words.
    text(
      `Retainage is held against the job, not deducted. It is released when the job's retainage is.`,
      M,
      8.5,
      body,
      muted,
    );
    y -= 16;
  }

  // ── Where it went ────────────────────────────────────────────────────
  room(110);
  text("PAYMENT", M, 8, bold, muted);
  y -= 12;
  line();
  y -= 14;

  const paid = inv.payments[0] ?? null;
  const method = paid?.method || (inv.fastPay ? "WIRE" : inv.payMethod);

  const pair = (label: string, value: string) => {
    text(label, M, 9, body, muted);
    page.drawText(safe(value), { x: M + 130, y, size: 9.5, font: body, color: ink });
    y -= 13;
  };

  pair("Method", method);
  if (paid) {
    pair("Sent", paid.paidOn || "—");
    pair("Amount", money(paid.amount));
    if (paid.reference) pair("Trace / confirmation", paid.reference);
  } else {
    // Said plainly rather than left blank. This document is often produced to
    // send *with* a payment, before the transfer has been keyed.
    pair("Sent", "Not yet recorded");
  }

  if (ach?.bankName) pair("Bank", ach.bankName);
  if (ach?.accountLast4) {
    pair(
      "Account",
      `${ach.accountType || "checking"} ending ${ach.accountLast4}${
        ach.routingLast4 ? ` · routing ending ${ach.routingLast4}` : ""
      }`,
    );
  }

  if (paid?.note) {
    y -= 4;
    text(paid.note.slice(0, 160), M, 9, body, muted);
    y -= 13;
  }

  // ── Footer ───────────────────────────────────────────────────────────
  y = Math.max(y - 14, M + 26);
  line();
  y -= 13;
  text(
    ach?.accountLast4
      ? "Bank details are shown as the last four digits only."
      : "No ACH authorization on file for this crew — bank details cannot be shown.",
    M,
    8,
    body,
    muted,
  );
  y -= 11;
  text(
    `Questions about this payment: reply to the email this came from, or ring the office. Statement ${inv.number}.`,
    M,
    8,
    body,
    muted,
  );

  return pdf.save();
}
