import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Download a document file.
 *
 * The stored key never reaches the browser. Every download comes through here
 * so access is checked against the document, not against whoever happens to
 * hold a URL — and so each one lands in the audit trail, which is the whole
 * point of tracking documents rather than filing them.
 *
 * The bytes are streamed rather than redirected. A redirect would hand the raw
 * storage URL to the browser, where it would sit in history and get sent as a
 * referrer; for a contract that is exactly what we are trying to avoid.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Sign in to download." }, { status: 401 });

  const file = await prisma.documentFile.findUnique({
    where: { id },
    include: {
      document: {
        select: {
          id: true,
          subcontractorId: true,
          deletedAt: true,
          access: { select: { subcontractorId: true, userId: true, canView: true } },
        },
      },
    },
  });

  if (!file || !file.document || file.document.deletedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Staff see everything. A crew sees a document addressed to their company,
  // or one explicitly shared with them — never by guessing an id.
  const doc = file.document;
  const allowed =
    isStaff(me.role) ||
    (!!me.subcontractorId &&
      (doc.subcontractorId === me.subcontractorId ||
        doc.access.some(
          (a) =>
            a.canView &&
            (a.subcontractorId === me.subcontractorId || a.userId === me.id),
        )));

  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const upstream = await fetch(file.storageKey);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "That file is no longer available." }, { status: 502 });
  }

  await prisma.documentAuditEvent.create({
    data: {
      documentId: doc.id,
      versionId: file.versionId,
      action: "document.downloaded",
      actorUserId: me.id,
      actorEmail: me.email,
      detail: { fileId: file.id, fileName: file.fileName },
      ip: request.headers.get("x-forwarded-for") ?? "",
      userAgent: request.headers.get("user-agent") ?? "",
    },
  });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
