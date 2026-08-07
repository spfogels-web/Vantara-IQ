import { getCustomerContractValues, getCustomers } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { CustomersView } from "@/components/customers/customers-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Customers · Vantara IQ" };

export default async function CustomersPage() {
  const [customers, contractValues] = await Promise.all([
    getCustomers(),
    getCustomerContractValues(),
  ]);

  return (
    <PageShell
      eyebrow="Network"
      title="Customers"
      description="Every customer carries its own billing identity — contacts, rate sheet, terms and rules the billing engine reads from."
    >
      <CustomersView customers={customers} contractValues={contractValues} />
    </PageShell>
  );
}
