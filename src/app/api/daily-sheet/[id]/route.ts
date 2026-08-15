import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { visibleProjectIds } from "@/lib/authz";
import { buildDailySheetPdf, type SheetForPdf } from "@/lib/daily-sheet-pdf";

export const runtime = "nodejs";

/** Saved JSON is untyped by the time it comes back — coerce, never trust. */
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => (typeof s === "string" ? s : "")) : [];

const s = (v: unknown): string => (typeof v === "string" ? v : "");

function laborRows(v: unknown): SheetForPdf["laborRows"] {
  return (Array.isArray(v) ? v : []).map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      print: s(r.print),
      location: s(r.location),
      cells: strings(r.cells),
      remarks: s(r.remarks),
    };
  });
}

function matRows(v: unknown): SheetForPdf["matRows"] {
  return (Array.isArray(v) ? v : []).map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      print: s(r.print),
      start: s(r.start),
      stop: s(r.stop),
      mat: r.mat === true,
      cells: strings(r.cells),
      reel: s(r.reel),
      cableStart: s(r.cableStart),
      cableStop: s(r.cableStop),
    };
  });
}

/**
 * The daily billing sheet as a PDF, for emailing or texting.
 *
 * The browser print path stays and is unchanged. This exists because printing
 * depends on a setting we do not control: the form only fits landscape, and a
 * dialog left on portrait crops the right-hand unit code columns off the paper
 * with nothing on the page to say they existed. Built server-side at a fixed
 * landscape size, this cannot be cropped by anyone's dialog.
 *
 * Authorisation is done here rather than leaned on from the query layer -
 * getDailySheet takes an id and returns the sheet, with no check of its own, so
 * a route that called it and trusted it would hand any signed-in subcontractor
 * any other crew's day. A sub may fetch a sheet for a project assigned to them;
 * staff may fetch any.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authorised." }, { status: 403 });

  const sheet = await prisma.dailySheet.findUnique({
    where: { id },
    select: {
      projectId: true,
      projectName: true,
      workDate: true,
      status: true,
      notes: true,
      header: true,
      laborCodes: true,
      laborRows: true,
      matCodes: true,
      matRows: true,
    },
  });
  if (!sheet) return NextResponse.json({ error: "Sheet not found." }, { status: 404 });

  if (!isStaff(me.role)) {
    const allowed = await visibleProjectIds(me);
    // A sheet with no project cannot be tied to a crew's assignments, so it is
    // office-only rather than open to everyone.
    if (allowed !== null && (!sheet.projectId || !allowed.includes(sheet.projectId))) {
      return NextResponse.json({ error: "Not authorised." }, { status: 403 });
    }
  }

  let pdf: Uint8Array;
  try {
    pdf = await buildDailySheetPdf({
      projectName: sheet.projectName,
      workDate: sheet.workDate,
      status: sheet.status,
      notes: sheet.notes ?? "",
      header: (sheet.header ?? {}) as Record<string, unknown>,
      laborCodes: strings(sheet.laborCodes),
      laborRows: laborRows(sheet.laborRows),
      matCodes: strings(sheet.matCodes),
      matRows: matRows(sheet.matRows),
    });
  } catch (e) {
    // Reported as an error rather than allowed to fall through as an error page
    // the browser saves under a .pdf name - which is how this looked the first
    // time the invoice PDF broke.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not render this sheet." },
      { status: 500 },
    );
  }

  const date = (sheet.workDate || "").replace(/[^\w-]/g, "-") || "daily";
  const job = (sheet.projectName || "sheet").replace(/[^\w-]/g, "-").slice(0, 40);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="daily-${job}-${date}.pdf"`,
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
