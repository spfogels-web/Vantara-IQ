import { notFound } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth";
import { getIncident, getTaggablePhotos } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { IncidentDetailView } from "@/components/incidents/incident-detail";
import { EvidencePicker } from "@/components/incidents/evidence-picker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incident = await getIncident(id);
  return { title: incident ? `${incident.number} · Vantara IQ` : "Incident · Vantara IQ" };
}

/**
 * One incident, and everything that has happened to it.
 *
 * The scope is inside `getIncident`, so an id belonging to somebody else comes
 * back as a 404 rather than as a refusal — a refusal confirms the incident
 * exists, which is itself worth something to whoever typed the id.
 */
export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [incident, me] = await Promise.all([getIncident(id), getCurrentUser()]);
  if (!incident) notFound();

  const staff = !!me && isStaff(me.role);
  const taggable = await getTaggablePhotos(incident.projectId);

  return (
    <PageShell
      eyebrow={<span className="num">{incident.number}</span>}
      title={incident.summary}
      description={`${incident.projectName}${incident.projectNumber ? ` · ${incident.projectNumber}` : ""}`}
    >
      <IncidentDetailView
        incident={incident}
        staff={staff}
        canClose={me?.role === "ADMIN" || me?.role === "PM"}
        canVoid={me?.role === "ADMIN"}
        role={me?.role ?? "SUBCONTRACTOR"}
        evidencePicker={
          me?.role === "EMPLOYEE" ? null : (
            <EvidencePicker incidentId={incident.id} photos={taggable} />
          )
        }
      />
    </PageShell>
  );
}
