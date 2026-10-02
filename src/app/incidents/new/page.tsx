import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getProjectsForViewer } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { ReportIncidentForm } from "@/components/incidents/report-incident-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Report an incident · Vantara IQ" };

/**
 * The route the placeholder promised: a crew opens one straight from their
 * phone without starting a daily first.
 *
 * Deliberately short. The person filling this in may be standing next to a
 * severed gas main, and every field that is not needed in the first five
 * minutes belongs on the incident afterwards, not on this form.
 */
export default async function NewIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const projects = await getProjectsForViewer();

  return (
    <PageShell
      title="Report an incident"
      description="A struck line, damage, or somebody hurt. Takes a minute."
    >
      <ReportIncidentForm projects={projects} initialProjectId={sp.project ?? ""} />
    </PageShell>
  );
}
