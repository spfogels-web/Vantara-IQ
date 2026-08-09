import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

/**
 * The invoice as a PDF, for sending, filing or printing.
 *
 * Available at any status, including a draft. A draft is the version somebody
 * needs to read before deciding to send it, and gating the download behind
 * sending would mean the only way to check an invoice properly is to commit to
 * it first. Drafts and voids are watermarked instead, so a copy that leaves the
 * building can never be mistaken for one that was issued.
 *
 * If building the PDF fails, that is reported as an error rather than allowed
 * to fall through as an error page the browser saves under a .pdf name — which
 * is how this looked the first time it broke.
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

  let pdf: Uint8Array;
  try {
    pdf = await buildInvoicePdf(invoice, org?.name ?? "Fortitude Infrastructure LLC");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not render this invoice." },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
