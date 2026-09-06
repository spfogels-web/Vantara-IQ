import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { buildRemittancePdf } from "@/lib/remittance-pdf";

export const runtime = "nodejs";

/**
 * The remittance advice for one pay statement.
 *
 * Reachable by the office, and by the crew the money is going to — nobody
 * else. A crew reading their own remittance is the point of it; a crew reading
 * another company's is a disclosure of what a competitor is paid, which is the
 * single thing this business most needs kept apart.
 *
 * The check is against the statement's own subcontractor rather than a project
 * assignment: a pay statement belongs to a company, not to a job.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authorised." }, { status: 403 });

  const { id } = await ctx.params;

  const inv = await prisma.subInvoice.findUnique({
    where: { id },
    include: {
      subcontractor: {
        select: {
          id: true,
          company: true,
          lead: true,
          email: true,
          ach: {
            select: {
              legalName: true,
              bankName: true,
              accountType: true,
              accountLast4: true,
              routingLast4: true,
            },
          },
        },
      },
      lines: { orderBy: { workDate: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!inv) return NextResponse.json({ error: "Statement not found." }, { status: 404 });

  if (!isStaff(me.role)) {
    if (!me.subcontractorId || me.subcontractorId !== inv.subcontractorId) {
      return NextResponse.json({ error: "Not authorised." }, { status: 403 });
    }
  }

  const org = await prisma.organization.findFirst({ select: { name: true } });
  const pdf = await buildRemittancePdf(inv, org?.name || "Fortitude Infrastructure LLC");

  const stem = `remittance-${inv.number}`.replace(/[^\w.-]+/g, "-");

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename="${stem}.pdf"`,
      // A statement changes when a payment is recorded against it, and a crew
      // holding a cached copy that says "not yet recorded" is the confusion
      // this document exists to prevent.
      "Cache-Control": "private, no-store",
    },
  });
}
