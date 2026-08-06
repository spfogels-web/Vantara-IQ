import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/authz";
import { buildRateSheetPdf } from "@/lib/rate-sheet-pdf";

export const runtime = "nodejs";

/**
 * Download a subcontractor's rate sheet as a PDF.
 *
 * Built from the rates as they stand right now, so editing a rate in the app
 * and downloading again produces a correct sheet — there is no second copy to
 * keep in step. Staff only: a sheet carries what every code pays, and a crew
 * has no business downloading another's.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ subcontractorId: string }> },
) {
  const { subcontractorId } = await params;
  await requireStaff();

  const [sub, org] = await Promise.all([
    prisma.subcontractor.findUnique({
      where: { id: subcontractorId },
      select: {
        company: true,
        legalName: true,
        rates: {
          orderBy: { code: "asc" },
          select: { code: true, description: true, unit: true, rate: true },
        },
      },
    }),
    prisma.organization.findFirst({ select: { name: true, logoUrl: true } }),
  ]);

  if (!sub) return NextResponse.json({ error: "Subcontractor not found." }, { status: 404 });
  if (sub.rates.length === 0) {
    return NextResponse.json(
      { error: "This crew has no rates yet — add them before generating a sheet." },
      { status: 400 },
    );
  }

  const logo = await companyLogo(org?.logoUrl ?? null);

  const generatedOn = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const pdf = await buildRateSheetPdf({
    companyName: org?.name ?? "Fortitude Infrastructure",
    subcontractorName: sub.legalName?.trim() || sub.company,
    title: "Subcontractor rates",
    subtitle: "Rates below apply to approved daily production on assigned projects.",
    terms: "NET 21 · Fast pay options available",
    lines: sub.rates,
    logo,
    generatedOn,
  });

  const safe = sub.company.replace(/[^\w.\-]+/g, "-").slice(0, 60);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rate-sheet-${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * The company's mark for the sheet header.
 *
 * Two ways in, deliberately. An upload in Settings wins, because that is
 * self-service and survives a deploy. Failing that it falls back to
 * public/fortitude-logo.png committed to the repo, so the brand can be set by
 * dropping in a file without waiting on anyone to click through a form.
 *
 * A logo that will not load never blocks the sheet — the rates are the point.
 */
async function companyLogo(
  logoUrl: string | null,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const mime = res.headers.get("content-type") ?? "image/png";
        if (/png|jpe?g/i.test(mime)) {
          return { bytes: new Uint8Array(await res.arrayBuffer()), mime };
        }
      }
    } catch {
      // fall through to the bundled file
    }
  }

  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const bytes = await readFile(path.join(process.cwd(), "public", "fortitude-logo.png"));
    return { bytes: new Uint8Array(bytes), mime: "image/png" };
  } catch {
    return null;
  }
}
