import { getSubInvoices } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { PayApplicationsView } from "@/components/financials/pay-applications-view";
import { requireStaffPage } from "@/lib/authz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay applications · Vantara IQ" };

/**
 * The pay register.
 *
 * Reads the statements themselves rather than the flattened register row it
 * used to: the figures are the same, and the lines come along, so opening one
 * can answer "what is this made of" without a second round trip. getSubInvoices
 * is staff-gated at the accessor — this page is the office's, and a crew's view
 * of their own pay is /pay, built from a different query.
 */
export default async function PayApplicationsPage() {
  // Authoritative: the current database role, not the token's claim.
  await requireStaffPage();

  const statements = await getSubInvoices();

  return (
    <PageShell
      eyebrow="Financials"
      title="Pay applications"
      description="Subcontractor pay, driven by approved dailies. Retainage, fast pay and the remittance handled in one register with a full audit trail."
      actions={
        <span className="text-[11.5px] text-muted-foreground">
          {/* There was an "Export ACH batch" button here wired to nothing. On a
              screen about money, a control that silently does nothing reads as
              a step that has been taken. */}
          Arrange the transfer at the bank, then record it here.
        </span>
      }
    >
      <PayApplicationsView statements={statements} />
    </PageShell>
  );
}
