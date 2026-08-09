import { serveOperativeDocument } from "@/lib/operative-document";

export const runtime = "nodejs";

/**
 * The mutual NDA, signed alongside the subcontractor agreement.
 *
 * Public for the same reason as the agreement — it is handed over before there
 * is an account, and confidentiality is the one thing that has to be agreed
 * before anything worth protecting is discussed.
 */
export async function GET() {
  return serveOperativeDocument("NDA", "fortitude-mutual-nda.pdf");
}
