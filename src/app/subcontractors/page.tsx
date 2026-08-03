import { getSubcontractors } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { SubcontractorsView } from "@/components/subcontractors/subcontractors-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subcontractors · Vantara IQ" };

export default async function SubcontractorsPage() {
  const subs = await getSubcontractors();

  return (
    <PageShell
      eyebrow="Network"
      title="Subcontractors"
      description="The contractor portal — compliance, assignments and a running scorecard for every crew you work with."
    >
      <SubcontractorsView subs={subs} />
    </PageShell>
  );
}
