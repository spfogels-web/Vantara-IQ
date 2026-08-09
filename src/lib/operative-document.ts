import "server-only";

import { NextResponse } from "next/server";
import type { DocType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Serves the paper Fortitude actually signs.
 *
 * The operative copy is whatever was last uploaded to the document centre for
 * this type, so revising an agreement is an upload rather than a deploy, and
 * the version a crew downloads is always the version the office is holding.
 *
 * There is deliberately no fallback. This used to generate a stand-in PDF from
 * hardcoded prose when nothing was on file, which meant a crew could download,
 * sign and return an agreement whose terms Fortitude had never written — the
 * document looked official and was not. A missing agreement is a problem the
 * office has to fix; inventing one is worse than saying so.
 */
export async function serveOperativeDocument(type: DocType, downloadName: string) {
  const doc = await prisma.document.findFirst({
    where: {
      type,
      deletedAt: null,
      // The blank template, not a copy attached to one crew.
      subcontractorId: null,
      files: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    include: { files: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const file = doc?.files[0];
  if (!file) {
    return NextResponse.json(
      { error: "That document isn't on file yet. Ask Fortitude to upload it." },
      { status: 404 },
    );
  }

  const upstream = await fetch(file.storageKey).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json({ error: "That document could not be read." }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": file.mime || "application/pdf",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      // The office can replace the file at any time; a cached copy would keep
      // handing out the superseded one.
      "Cache-Control": "no-store",
    },
  });
}
