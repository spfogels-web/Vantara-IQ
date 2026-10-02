import { getCurrentUser, isStaff } from "@/lib/auth";
import { getIncidents, getIncidentKpis } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { IncidentsView } from "@/components/incidents/incidents-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Incidents · Vantara IQ" };

/**
 * Every incident the company has, in one place.
 *
 * The same authoritative records the project accordion shows — this is the
 * management view of them, not a second copy. Scoping is done by the query, not
 * by this page: staff see the organisation, a crew sees its own company's
 * incidents on jobs it is assigned to, and an employee sees the ones they filed
 * and nothing else.
 */
export default async function IncidentsPage() {
  const me = await getCurrentUser();
  const staff = !!me && isStaff(me.role);

  const [rows, kpis] = await Promise.all([getIncidents({ limit: 300 }), getIncidentKpis()]);

  return (
    <PageShell
      title="Incidents"
      description="Utility strikes, property damage, safety incidents and claims"
    >
      <IncidentsView rows={rows} kpis={kpis} staff={staff} role={me?.role ?? "SUBCONTRACTOR"} />
    </PageShell>
  );
}
