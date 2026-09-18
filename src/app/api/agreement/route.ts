import { serveOperativeDocument } from "@/lib/operative-document";
import { runWithOrg } from "@/lib/org-context";
import { PLATFORM_HOME_ORG } from "@/lib/org-registry";

export const runtime = "nodejs";

/**
 * The subcontractor agreement, for a crew to download, sign and send back.
 *
 * Public on purpose: it is handed to someone part-way through onboarding who
 * may not yet have a session, and it is the blank template Fortitude gives
 * every sub — nothing about any particular crew, project or rate.
 */
export async function GET() {
  // No session behind this request — it is opened by someone who has not
  // signed in, or posted by a carrier. Phase One serves these from the
  // platform's home organisation, said here rather than defaulted anywhere.
  return runWithOrg(PLATFORM_HOME_ORG, () =>
    serveOperativeDocument(
      "MASTER_SUBCONTRACTOR_AGREEMENT",
      "fortitude-subcontractor-agreement.pdf",
    ),
  );
}
