import { getProjects, getSubPeople, getSubcontractors } from "@/data/queries";
import { SubcontractorsView } from "@/components/subcontractors/subcontractors-view";
import { requireStaffPage } from "@/lib/authz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subcontractors · Vantara IQ" };

export default async function SubcontractorsPage() {
  // Authoritative: the current database role, not the token's claim.
  await requireStaffPage();

  const [subs, projects, people] = await Promise.all([
    getSubcontractors(),
    getProjects(),
    getSubPeople(),
  ]);

  // The page's own banner carries the title, so PageShell's header would be a
  // second one. Same gutter and max width as every other module, kept here
  // rather than by passing an empty title into a component that requires one.
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <SubcontractorsView subs={subs} projects={projects} people={people} />
    </div>
  );
}
