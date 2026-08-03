import { getProjects } from "@/data/queries";
import { PageShell } from "@/components/common/page-shell";
import { NewDailyForm, type ProjectOption } from "@/components/dailies/new-daily-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New daily · Vantara IQ" };

export default async function NewDailyPage() {
  const projects = await getProjects();
  const options: ProjectOption[] = projects.map((p) => ({
    id: p.id,
    number: p.number,
    name: p.name,
    client: p.client,
    location: p.location,
  }));

  return (
    <PageShell
      eyebrow="Dailies"
      title="New daily"
      description="Log a crew's production for the day, tied to its project number and name."
    >
      <NewDailyForm projects={options} />
    </PageShell>
  );
}
