import Link from "next/link";

import { getInvite } from "@/data/queries";
import { InviteOnboarding, type InviteProject } from "@/components/subcontractors/invite-onboarding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join Fortitude · Vantara IQ" };

/**
 * The onboarding entry point.
 *
 * The token used to be decorative: this page rendered the form for any string,
 * and read the project from a `?project=` query parameter anyone could edit.
 * Now the token is looked up, and it is what names the job — so a link cannot
 * be retargeted at another project, and a made-up one gets a refusal instead of
 * a working signup form. The link stays open for as many crews as the job
 * needs; what stops a stranger is that registering only produces a
 * PENDING_REVIEW record with no access until Fortitude approves it.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvite(token);

  if (!invite) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nexgen-banner.png" alt="NEXGEN BUILD AI" className="h-10 w-auto object-contain" />
        <h1 className="mt-8 text-[19px] font-semibold tracking-[-0.02em] text-foreground">
          This invitation link isn&apos;t valid
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          It may have been mistyped, or withdrawn. Ask Fortitude Infrastructure for the link to
          your project.
        </p>
        <Link
          href="/login"
          className="focus-ring mt-6 inline-flex h-9 items-center rounded-lg border border-border px-4 text-[12.5px] font-medium text-foreground hover:bg-foreground/[0.05]"
        >
          Log in instead
        </Link>
      </div>
    );
  }

  const project: InviteProject = invite.projectName
    ? { name: invite.projectName, client: invite.client, location: invite.location }
    : null;

  return <InviteOnboarding token={token} project={project} />;
}
