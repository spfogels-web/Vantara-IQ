import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getProspectOverview, getProspectRows } from "@/data/prospects-crm";
import { getProspectSummary, getProspects } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { ProspectsCrm } from "@/components/prospects/prospects-crm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prospects · Vantara IQ" };

/**
 * The pipeline.
 *
 * Staff only — prequalification notes, lost reasons and rate evaluations are
 * internal judgements about companies we work with, and the query refuses
 * anybody else rather than the page hiding a button.
 */
export default async function ProspectsPage() {
  const me = await getCurrentUser();
  const staff = !!me && isStaff(me.role);

  if (!staff) {
    return (
      <PageShell
        eyebrow="Network"
        title="Prospects"
        description="Build and manage your network of crews, workers and prime contractors."
      >
        <p className="rounded-xl border border-border bg-foreground/[0.02] px-4 py-10 text-center text-[13px] text-muted-foreground">
          The prospect pipeline is internal to Fortitude.
        </p>
      </PageShell>
    );
  }

  // The full records and the state/market suggestions feed the add/edit form.
  const [rows, overview, editable, summary, owners] = await Promise.all([
    getProspectRows(),
    getProspectOverview(),
    getProspects(),
    getProspectSummary(),
    prisma.user.findMany({
      where: { subcontractorId: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <PageShell
      eyebrow="Network"
      title="Prospects"
      description="Build and manage your network of crews, workers and prime contractors."
    >
      <ProspectsCrm
        rows={rows}
        overview={overview}
        owners={owners.map((o) => ({ id: o.id, name: o.name || o.email }))}
        canManage={staff}
        editable={editable}
        knownStates={summary.states.map((x) => x.name)}
        knownMarkets={summary.markets.map((x) => x.name)}
      />
    </PageShell>
  );
}
