import { getCustomers } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { ProjectForm } from "@/components/projects/project-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New project · Vantara IQ" };

export default async function NewProjectPage() {
  const customers = await getCustomers();
  return (
    <PageShell eyebrow="Projects" title="New project" description="Create a job with its number, name, customer and schedule.">
      <ProjectForm customerNames={customers.map((c) => c.name)} />
    </PageShell>
  );
}
