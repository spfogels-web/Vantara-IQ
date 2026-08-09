import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Download one onboarding document.
 *
 * These are stored as base64 in the database, which is fine for holding a W-9
 * and ruinous for listing one: a page that embeds every document to render a
 * list of filenames ships megabytes to draw a few rows. The list carries names
 * and this hands over the bytes, once, when somebody actually opens one.
 *
 * A crew reaches their own documents and nobody else's. Staff reach any, so
 * they can review a packet.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const doc = await prisma.subDocument.findUnique({
    where: { id },
    select: {
      subcontractorId: true,
      fileName: true,
      mediaType: true,
      dataUrl: true,
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!isStaff(me.role) && me.subcontractorId !== doc.subcontractorId) {
    return NextResponse.json({ error: "That belongs to another subcontractor." }, { status: 403 });
  }

  // Stored as `data:<mime>;base64,<payload>`.
  const comma = doc.dataUrl.indexOf(",");
  if (comma < 0) return NextResponse.json({ error: "Stored file is unreadable." }, { status: 500 });
  const bytes = Buffer.from(doc.dataUrl.slice(comma + 1), "base64");

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": doc.mediaType || "application/octet-stream",
      // inline so a PDF or photo opens in the browser rather than landing in
      // the downloads folder unseen — most of these are opened to be looked at.
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
