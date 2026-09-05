import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/authz";
import { assertProjectAccess } from "@/lib/authz";
import { buildRateSheetPdf } from "@/lib/rate-sheet-pdf";
import { companyLogo } from "@/lib/rate-sheet-logo";
import { normalizeCode, rateFamilyOf, RATE_FAMILIES } from "@/lib/unit-codes";
import { marketLabel } from "@/lib/markets";

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
  request: Request,
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
        market: true,
        rates: {
          orderBy: { code: "asc" },
          select: { code: true, description: true, unit: true, rate: true },
        },
        // What the job actually builds. The pay card accumulates codes from
        // every sheet ever loaded onto it; this is the shorter, real list.
        // Planned quantity comes along because it decides which of two
        // disagreeing siblings is the one somebody meant.
        materials: { where: { inScope: true }, select: { code: true, planned: true } },
      },
    }),
    prisma.organization.findFirst({ select: { name: true, logoUrl: true } }),
  ]);

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  /**
   * What goes on the sheet.
   *
   * The codes this job uses, plus every handhole. A crew quoting a job needs
   * the handhole prices whether or not this particular material list happens
   * to call for that size — the size found in the ground is rarely the size on
   * the print, and a rate agreed after the hole is open is a rate agreed
   * badly.
   *
   * Everything else on the card is left off. The pay card collects codes from
   * every sheet ever loaded onto it, so it had grown to twenty-five lines on a
   * sixteen-code job — and a sheet padded with work that is not on the job
   * reads as a price list to negotiate rather than an offer to sign.
   */
  /**
   * A chosen set of codes, when the page sent one.
   *
   * Ticking rows is how somebody tailors a sheet to what they are actually
   * putting out to bid, and the choice has to survive the trip to the PDF.
   * Absent — a link opened directly, or a bookmark — it falls back to the
   * whole job, which is the sheet this route produced before there was
   * anything to tick.
   */
  const asked = new URL(request.url).searchParams.get("codes");
  const chosen = asked
    ? new Set(
        asked
          .split(",")
          .map((c) => normalizeCode(decodeURIComponent(c)))
          .filter(Boolean),
      )
    : null;

  const used = new Set(project.materials.map((m) => normalizeCode(m.code)));
  const isHandhole = (code: string) => /^BHF/i.test(code.trim());

  // A rate of zero is a line nobody has filled in yet, not an agreement to
  // work for nothing. Sending it would be quoting a crew zero.
  const candidates = project.rates.filter((r) => {
    if (r.rate <= 0) return false;
    // Handholes ride along either way: a crew needs the price for the size
    // found in the ground, not just the size on the print.
    if (isHandhole(r.code)) return true;
    return chosen ? chosen.has(normalizeCode(r.code)) : used.has(normalizeCode(r.code));
  });

  /**
   * One row per code.
   *
   * The same code gets stored under both spellings the paperwork uses —
   * BFOV(12.7)(2W)12"DEPTH and BFOV(12.7)(2W)12IN DEPTH — at two different
   * prices, and the sheet printed both. A crew reading two prices for one
   * piece of work will pick one, and it will not be ours.
   *
   * The spelling the material list uses wins, because that is the one the job
   * is measured and billed against.
   */
  const exactOnJob = new Set(project.materials.map((m) => m.code.trim().toUpperCase()));
  const byCode = new Map<string, (typeof candidates)[number]>();
  for (const r of candidates) {
    const key = normalizeCode(r.code);
    const held = byCode.get(key);
    if (!held) {
      byCode.set(key, r);
      continue;
    }
    if (exactOnJob.has(r.code.trim().toUpperCase())) byCode.set(key, r);
  }

  /**
   * Codes that are one price under several names go on together.
   *
   * A job's material list might only call for BFO48, but placing buried fibre
   * is the same work at the same money whatever the count in the sheath — so a
   * crew quoting the job needs to see that BFO12 and BFO144 pay the same. Left
   * off, the first sheet with a different count on it becomes a conversation
   * about price on the day.
   *
   * The rate comes from the sibling this job actually builds, since that is
   * the one somebody set deliberately.
   */
  const plannedOf = new Map(
    project.materials.map((m) => [normalizeCode(m.code), m.planned] as const),
  );

  // One rate per family, then every member of it on the sheet.
  //
  // Where two siblings are both on the job at different money — which has
  // happened, BFO48 at $1.18 beside BFO12 at $1.50 — the sheet cannot print
  // both without inviting an argument on the day. The one the job builds most
  // of wins, because that is the number somebody set with the work in front of
  // them rather than the one that came along with a card.
  const familyRate = new Map<string, { row: (typeof candidates)[number]; planned: number }>();
  for (const row of byCode.values()) {
    const family = rateFamilyOf(row.code);
    if (!family) continue;
    const planned = plannedOf.get(normalizeCode(row.code)) ?? 0;
    const held = familyRate.get(family);
    if (!held || planned > held.planned) familyRate.set(family, { row, planned });
  }

  for (const [family, { row }] of familyRate) {
    for (const sibling of RATE_FAMILIES[family]) {
      byCode.set(normalizeCode(sibling), { ...row, code: sibling });
    }
  }

  const lines = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Nothing to put on a sheet — tick some codes, or fill the we-pay column." },
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
    /**
     * The market and the job number, not the project name.
     *
     * These jobs are named after the people above us — "GA Windstream_Trawick"
     * puts the end customer and the prime on a sheet we hand to a crew who is
     * not party to either contract. The market is what a crew needs to know,
     * because it is what the rates follow, and the number identifies the job
     * without naming anybody.
     *
     * A job with no market falls back to its number alone rather than to the
     * name, since the name is the thing being kept off the page.
     */
    subtitle: [
      project.market ? marketLabel(project.market) : "",
      project.number,
    ]
      .filter(Boolean)
      .join(" · ")
      .concat(" — rates below apply to approved daily production on this job."),
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
