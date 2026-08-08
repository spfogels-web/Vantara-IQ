import { getProspectSummary, getProspects } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { ProspectsView } from "@/components/prospects/prospects-view";

export const dynamic = "force-dynamic";

export default async function ProspectsPage() {
  const [prospects, summary] = await Promise.all([getProspects(), getProspectSummary()]);

  return (
    <PageShell
      eyebrow="Network"
      title="Prospects"
      description="Workers, crews and prime contractors — who we know, and where."
    >
      <ProspectsView prospects={prospects} summary={summary} />
    </PageShell>
  );
}
