import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { prisma } from "@/lib/prisma";
import {
  AGREEMENT_INTRO,
  AGREEMENT_SECTIONS,
  AGREEMENT_TITLE,
} from "@/lib/subcontractor-agreement";

export const runtime = "nodejs";

/**
 * The subcontractor agreement, for a crew to download, sign and send back.
 *
 * Public on purpose: it is handed to someone part-way through onboarding who
 * may not yet have a session, and it contains the standard terms Fortitude
 * gives every sub — nothing about any particular crew, project or rate.
 *
 * If an executed master agreement has been uploaded to the document centre it
 * is served instead, so the operative paper always wins over the generated
 * copy. The generated one exists so onboarding never stalls waiting for
 * somebody to upload a file.
 */
export async function GET() {
  const uploaded = await prisma.document.findFirst({
    where: {
      type: "MASTER_SUBCONTRACTOR_AGREEMENT",
      deletedAt: null,
      subcontractorId: null,
      files: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    include: { files: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (uploaded?.files[0]) {
    const upstream = await fetch(uploaded.files[0].storageKey);
    if (upstream.ok && upstream.body) {
      return new NextResponse(upstream.body, {
        headers: {
          "Content-Type": uploaded.files[0].mime || "application/pdf",
          "Content-Disposition": 'attachment; filename="subcontractor-agreement.pdf"',
        },
      });
    }
  }

  const org = await prisma.organization.findFirst({ select: { name: true } });
  const pdf = await buildAgreement(org?.name ?? "Fortitude Infrastructure LLC");

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="subcontractor-agreement.pdf"',
      "Cache-Control": "no-store",
    },
  });
}

const PAGE = { w: 612, h: 792 };
const M = 56;

async function buildAgreement(company: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(AGREEMENT_TITLE);

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.08, 0.1, 0.13);
  const muted = rgb(0.36, 0.4, 0.46);

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;

  const space = (needed: number) => {
    if (y - needed < M) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - M;
    }
  };

  const paragraph = (text: string, size = 9.5, font = body, colour = ink, lead = 13) => {
    for (const line of wrap(text, font, size, PAGE.w - M * 2)) {
      space(lead);
      page.drawText(line, { x: M, y, size, font, color: colour });
      y -= lead;
    }
  };

  page.drawText(AGREEMENT_TITLE.toUpperCase(), { x: M, y, size: 16, font: bold, color: ink });
  y -= 22;
  page.drawText(company, { x: M, y, size: 10, font: bold, color: muted });
  y -= 20;
  paragraph(AGREEMENT_INTRO, 9, body, muted, 12);
  y -= 10;

  for (const section of AGREEMENT_SECTIONS) {
    space(28);
    y -= 6;
    page.drawText(section.heading.toUpperCase(), { x: M, y, size: 10.5, font: bold, color: ink });
    y -= 15;
    for (const p of section.body) {
      paragraph(p);
      y -= 4;
    }
  }

  // Signature block — this is the point of the download.
  space(150);
  y -= 20;
  page.drawText("SIGNATURES", { x: M, y, size: 10.5, font: bold, color: ink });
  y -= 8;
  page.drawLine({
    start: { x: M, y },
    end: { x: PAGE.w - M, y },
    thickness: 1,
    color: rgb(0.8, 0.83, 0.87),
  });
  y -= 26;

  for (const label of [
    "Subcontractor company name",
    "Authorised representative (print)",
    "Signature",
    "Title",
    "Date",
  ]) {
    space(32);
    page.drawText(label, { x: M, y, size: 9, font: body, color: muted });
    page.drawLine({
      start: { x: M + 190, y: y - 2 },
      end: { x: PAGE.w - M, y: y - 2 },
      thickness: 0.75,
      color: rgb(0.8, 0.83, 0.87),
    });
    y -= 30;
  }

  return pdf.save();
}

/** Greedy wrap — pdf-lib draws a line at a time and does no layout of its own. */
function wrap(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
