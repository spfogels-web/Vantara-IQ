import { notFound } from "next/navigation";

import {
  getBillableCodes,
  getDailySheet,
  getProject,
  getProjectCrews,
} from "@/data/queries";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getLocateRows } from "@/data/locates-ops";
import { PageShell } from "@/components/common/page-shell";
import { LocatePreWork } from "@/components/locates/locate-prework";
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

  const [saved, me, billableCodes, locates] = await Promise.all([
    sp.sheet ? getDailySheet(sp.sheet) : Promise.resolve(null),
    getCurrentUser(),
    getBillableCodes(project.id),
    // What the locates say about this job. Scoped by the same project access
    // the rest of the page uses, so a crew sees their own jobs and no others.
    getLocateRows({ projectId: project.id, take: 200 }),
  ]);
  // Staff review filed sheets; the crew that submitted one cannot reopen it.
  const canReview = me ? isStaff(me.role) : false;

  // Only the office picks who a sheet is for. A crew filing their own is
  // identified by their login, so they are never offered the choice.
  const crews = canReview ? await getProjectCrews(project.id) : [];

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
      {/* Before the form, not after it. A crew that has already filled in a
          sheet has already done the work — this only closes the gap between
          the office knowing a locate is outstanding and the field being told
          if it is the first thing on the page. */}
      <LocatePreWork rows={locates.rows} projectId={project.id} />

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
        canReview={canReview}
        crews={crews.map((c) => ({ id: c.id, company: c.company }))}
        initialFiledForId={saved?.filedForId ?? null}
        initialRoads={saved?.roads ?? null}
        billableCodes={billableCodes}
      />
    </PageShell>
  );
}
