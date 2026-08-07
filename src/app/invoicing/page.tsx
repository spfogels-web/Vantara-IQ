import { getArTotals, getCustomers, getInvoiceRows } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { InvoicingView } from "@/components/invoicing/invoicing-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoicing · Vantara IQ" };

export default async function InvoicingPage() {
  const [invoices, ar, customers] = await Promise.all([
    getInvoiceRows(),
    getArTotals(),
    getCustomers(),
  ]);

  return (
    <PageShell
      eyebrow="Financials"
      title="Invoicing"
      description="Approved dailies price themselves against the customer's rate card and batch into a weekly bill. The office reviews, sends, and records what comes back — it doesn't calculate."
    >
      <InvoicingView
        invoices={invoices}
        ar={ar}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      />
    </PageShell>
  );
}
