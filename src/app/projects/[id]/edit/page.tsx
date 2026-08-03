import { notFound } from "next/navigation";

import { getCustomers, getProject } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { ProjectForm } from "@/components/projects/project-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit project · Vantara IQ" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, customers] = await Promise.all([getProject(id), getCustomers()]);
  if (!project) notFound();

  return (
    <PageShell eyebrow={`Project ${project.number}`} title="Edit project" description={project.name}>
      <ProjectForm
        customerNames={customers.map((c) => c.name)}
        initial={{
          id: project.id,
          number: project.number,
          name: project.name,
          client: project.client,
          location: project.location,
          status: project.status,
          crew: project.crew,
          remainingFt: project.remainingFt,
          requiredFtPerDay: project.requiredFtPerDay,
          actualFtPerDay: project.actualFtPerDay,
          pctComplete: project.pctComplete,
          health: project.health,
          forecast: project.forecast,
        }}
      />
    </PageShell>
  );
}
