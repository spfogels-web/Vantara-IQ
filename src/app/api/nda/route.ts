import { serveOperativeDocument } from "@/lib/operative-document";
import { runWithOrg } from "@/lib/org-context";
import { PLATFORM_HOME_ORG } from "@/lib/org-registry";

export const runtime = "nodejs";

/**
 * The mutual NDA, signed alongside the subcontractor agreement.
 *
 * Public for the same reason as the agreement — it is handed over before there
 * is an account, and confidentiality is the one thing that has to be agreed
 * before anything worth protecting is discussed.
 */
export async function GET() {
  // Opened before there is an account, so nothing has said which organisation
  // this belongs to. Phase One serves it from the platform's home
  // organisation, said here rather than defaulted anywhere.
  return runWithOrg(PLATFORM_HOME_ORG, () =>
    serveOperativeDocument("NDA", "fortitude-mutual-nda.pdf"),
  );
}
