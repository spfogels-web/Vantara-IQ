import { getProject } from "@/data/queries";
import { InviteOnboarding, type InviteProject } from "@/components/subcontractors/invite-onboarding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join Fortitude · Vantara IQ" };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const found = sp.project ? await getProject(sp.project) : undefined;

  const project: InviteProject = found
    ? { name: found.name, client: found.client, location: found.location }
    : null;

  return <InviteOnboarding token={token} project={project} />;
}
