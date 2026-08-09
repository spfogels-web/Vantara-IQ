import { serveOperativeDocument } from "@/lib/operative-document";

export const runtime = "nodejs";

/**
 * The subcontractor agreement, for a crew to download, sign and send back.
 *
 * Public on purpose: it is handed to someone part-way through onboarding who
 * may not yet have a session, and it is the blank template Fortitude gives
 * every sub — nothing about any particular crew, project or rate.
 */
export async function GET() {
  return serveOperativeDocument(
    "MASTER_SUBCONTRACTOR_AGREEMENT",
    "fortitude-subcontractor-agreement.pdf",
  );
}
