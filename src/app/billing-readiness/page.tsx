import { redirect } from "next/navigation";

import { getBillingReadiness, getMyDocumentationRequests } from "@/data/queries";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { PageShell } from "@/components/common/page-shell";
import { BillingReadinessView } from "@/components/billing/readiness-view";
import { CrewDocumentationRequests } from "@/components/billing/crew-requests";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing readiness · Vantara IQ" };

/**
 * One route, two screens, and the split is not a convenience.
 *
 * The office sees every code of approved production with the customer's rate
 * beside it. A crew sees only what is being asked of them, with no rate, no
 * amount and no invoice anywhere in the payload.
 *
 * The branch below decides which component renders, but it is not what enforces
 * the difference: `getBillingReadiness` calls `requireStaff()` and throws, and
 * `getMyDocumentationRequests` is scoped to the caller's own assignments. If the
 * branch were wrong, the accessor would still refuse. That is deliberate — a
 * conditional in a page is a thing somebody edits, and the customer's rate card
 * should not be one edit away from a subcontractor's phone.
 */
export default async function BillingReadinessPage() {
  const [me, t] = await Promise.all([getCurrentUser(), getT()]);
  if (!me) redirect("/login");

  // Employees are neither: they clock in and out and file no production.
  if (!isStaff(me.role) && me.role !== "SUBCONTRACTOR") redirect("/time-clock");

  if (!isStaff(me.role)) {
    const requests = await getMyDocumentationRequests();
    return (
      <PageShell
        eyebrow={t("My work")}
        title={t("Action required")}
        description={t(
          "Work you have already filed and had approved, waiting on documentation before it can be invoiced. Your dailies and your pay are unaffected.",
        )}
      >
        <CrewDocumentationRequests requests={requests} />
      </PageShell>
    );
  }

  const rows = await getBillingReadiness();
  return (
    <PageShell
      eyebrow={t("Financials")}
      title={t("Billing readiness")}
      description={t(
        "Every approved unit code and whether it can be invoiced. Work completed, documentation status, ready to bill, staged and billed are five different things — this is where they stay apart.",
      )}
    >
      <BillingReadinessView rows={rows} />
    </PageShell>
  );
}
