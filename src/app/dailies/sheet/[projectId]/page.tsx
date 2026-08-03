import { notFound } from "next/navigation";

import { getDailySheet, getProject } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { DailyBillingSheet } from "@/components/dailies/daily-billing-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily billing sheet · Vantara IQ" };

export default async function ProjectDailySheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  /** `?sheet=<id>` reopens a saved sheet instead of starting a blank one. */
  searchParams: Promise<{ sheet?: string }>;
}) {
  const [{ projectId }, sp] = await Promise.all([params, searchParams]);
  const project = await getProject(projectId);
  if (!project) notFound();

  const saved = sp.sheet ? await getDailySheet(sp.sheet) : null;

  return (
    <PageShell
      eyebrow="Dailies"
      title="Subcontractor daily billing sheet"
      description={
        saved
          ? `${project.number ? `${project.number} · ` : ""}${project.name} — ${
              saved.status === "SUBMITTED" ? "submitted sheet" : "saved draft"
            }, reopened for review.`
          : `${project.number ? `${project.number} · ` : ""}${project.name} — job numbers prefilled. Redline the map and print or submit when the crew is done.`
      }
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
        initialSheetId={saved?.id}
        saved={saved}
      />
    </PageShell>
  );
}
