import { notFound } from "next/navigation";

import { getProject } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { DailyBillingSheet } from "@/components/dailies/daily-billing-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily billing sheet · Vantara IQ" };

export default async function ProjectDailySheetPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <PageShell
      eyebrow="Dailies"
      title="Subcontractor daily billing sheet"
      description={`${project.number ? `${project.number} · ` : ""}${project.name} — job numbers prefilled. Redline the map and print or submit when the crew is done.`}
    >
      <DailyBillingSheet
        project={{
          id: project.id,
          number: project.number,
          name: project.name,
          client: project.client,
          location: project.location,
          crew: project.crew,
          mapUrl: project.mapUrl ?? null,
          markups: project.markups ?? null,
        }}
      />
    </PageShell>
  );
}
