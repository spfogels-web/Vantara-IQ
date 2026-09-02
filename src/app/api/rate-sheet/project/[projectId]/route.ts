import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/authz";
import { assertProjectAccess } from "@/lib/authz";
import { buildRateSheetPdf } from "@/lib/rate-sheet-pdf";
import { companyLogo } from "@/lib/rate-sheet-logo";

export const runtime = "nodejs";

/**
 * The pay rates on one job, as a sheet to send.
 *
 * The other rate-sheet route builds from a crew's signed card, which is no use
 * for the case this exists for: agreeing rates with somebody who has not been
 * onboarded yet. There is no crew to build from — the numbers live on the job
 * as its budget, typed into the "we pay" column, and this turns those into the
 * sheet that gets sent.
 *
 * It carries the pay column and nothing else. What the customer pays us, the
 * spread and the job margin are all on the same screen these rates were typed
 * into, and none of them belong in a subcontractor's hands. That is not a
 * matter of filtering carefully here — the generator is only ever handed a
 * code, a description, a unit and one rate, so there is nothing else for it to
 * print even by mistake.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  await requireStaff();
  await assertProjectAccess(projectId);

  const [project, org] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        number: true,
        rates: {
          orderBy: { code: "asc" },
          select: { code: true, description: true, unit: true, rate: true },
        },
      },
    }),
    prisma.organization.findFirst({ select: { name: true, logoUrl: true } }),
  ]);

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  // A rate of zero is a line nobody has filled in yet, not an agreement to
  // work for nothing. Sending it would be quoting a crew zero.
  const lines = project.rates.filter((r) => r.rate > 0);
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "No pay rates set on this job yet — fill the we-pay column first." },
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
    // Left for the recipient to be written in. The sheet goes out before
    // anyone is signed, so naming a company on it would be presumptuous and
    // would have to be corrected by hand on every copy.
    subcontractorName: "",
    title: "Subcontractor rates",
    subtitle: `${project.name.trim()}${project.number ? ` · ${project.number}` : ""} — rates below apply to approved daily production on this job.`,
    terms: "NET 21 · Fast pay options available",
    lines,
    logo,
    generatedOn,
  });

  const safe = (project.number || project.name).replace(/[^\w.\-]+/g, "-").slice(0, 60);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rate-sheet-${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
