import { redirect } from "next/navigation";

import { getMySubInvoices } from "@/data/queries";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { PageShell } from "@/components/common/page-shell";
import { PayStatements } from "@/components/subcontractors/pay-statements";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your pay · Vantara IQ" };

/**
 * What a crew is owed.
 *
 * Scoped to "yours" — no id comes from the URL, so there is nothing to tamper
 * with by editing one. Every figure is their own production at their own signed
 * rates; nothing on this page knows what the work was billed for.
 */
export default async function PayPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (isStaff(me.role)) redirect("/invoicing");
  if (!me.subcontractorId) redirect("/dailies");

  const invoices = await getMySubInvoices();

  return (
    <PageShell
      eyebrow="Your money"
      title="Pay statements"
      description="One statement per week per job, priced from your approved dailies at your signed rates. Check the lines against your sheets, then accept — or tell us what's wrong and we'll fix it."
    >
      <PayStatements invoices={invoices} />
    </PageShell>
  );
}
