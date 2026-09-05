import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { visibleProjectIds } from "@/lib/authz";

export const runtime = "nodejs";

/**
 * The construction print, as a download.
 *
 * The panel already linked the map, but a link is not a download. The file
 * lives on Vercel Blob, which is a different origin, and the browser ignores
 * the `download` attribute across origins — so the "Full size" link opened a
 * tab and left the crew to work out how to save what was in it. On a phone in
 * a truck that is where it ended.
 *
 * Serving it from here fixes three things at once: it is a real attachment
 * with Content-Disposition, it arrives named after the job rather than
 * `KzQ1x2.pdf`, and the access check runs on our side instead of the file
 * being reachable by anyone holding the Blob URL.
 *
 * ?original=0 asks for the display copy instead. They are usually the same
 * file; they differ when a print was flattened on the way in, and the flat one
 * is the one that matches what the page is showing.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authorised." }, { status: 403 });

  const { projectId } = await ctx.params;

  // A crew may take the print for a job they are on, and no other. Same rule
  // the project page itself runs on, applied again here — a URL is guessable
  // and this one hands over a file.
  if (!isStaff(me.role)) {
    const allowed = await visibleProjectIds(me);
    if (allowed && !allowed.includes(projectId)) {
      return NextResponse.json({ error: "Not authorised." }, { status: 403 });
    }
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, number: true, mapUrl: true, mapOriginalUrl: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const wantOriginal = new URL(req.url).searchParams.get("original") !== "0";
  const url = wantOriginal
    ? project.mapOriginalUrl || project.mapUrl
    : project.mapUrl || project.mapOriginalUrl;
  if (!url) {
    return NextResponse.json({ error: "No map on this project yet." }, { status: 404 });
  }

  let body: Buffer;
  let type: string;

  if (url.startsWith("data:")) {
    // The small-file fallback path stores the map in the database as a data
    // URL. It is still a file to whoever asked for it.
    const comma = url.indexOf(",");
    const head = url.slice(5, comma);
    type = head.split(";")[0] || "application/octet-stream";
    body = Buffer.from(url.slice(comma + 1), head.includes("base64") ? "base64" : "utf8");
  } else {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      return NextResponse.json({ error: "Couldn't fetch the map." }, { status: 502 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Couldn't fetch the map (${res.status}).` }, { status: 502 });
    }
    body = Buffer.from(await res.arrayBuffer());
    type =
      res.headers.get("content-type") ||
      (url.toLowerCase().split("?")[0].endsWith(".pdf") ? "application/pdf" : "image/png");
  }

  // Named after the job, so a folder of these is still readable in a month.
  const ext = type.includes("pdf")
    ? "pdf"
    : type.includes("png")
      ? "png"
      : type.includes("jpeg") || type.includes("jpg")
        ? "jpg"
        : (url.toLowerCase().split("?")[0].split(".").pop() || "bin").slice(0, 4);
  const stem = [project.number, project.name, "map"]
    .filter(Boolean)
    .join(" ")
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 90);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `attachment; filename="${stem}.${ext}"`,
      // The print changes when the office replaces it, and a crew holding a
      // week-old cached copy is the whole problem this is meant to solve.
      "Cache-Control": "private, no-store",
    },
  });
}
