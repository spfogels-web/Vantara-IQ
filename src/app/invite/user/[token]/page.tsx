import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { AcceptSubUserInvite } from "@/components/subcontractors/accept-user-invite";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join your crew · Vantara IQ" };

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Office / admin",
  PM: "Project manager",
  FOREMAN: "Foreman",
  SUPERVISOR: "Supervisor",
};

/**
 * The page an invited person lands on.
 *
 * Public by necessity — they have no login yet, that is the whole point — and
 * safe because the token is the authority. It names one company and one job
 * title, both fixed before the link was sent, so nothing typed here can put
 * somebody on a crew they were not invited to.
 *
 * A used token shows a plain "already accepted" rather than a form that fails
 * on submit. These get forwarded around a company and a second person opening
 * the same link is the normal case, not an attack.
 */
export default async function AcceptSubUserInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await prisma.subUserInvite.findUnique({
    where: { token },
    select: {
      token: true,
      email: true,
      name: true,
      subUserRole: true,
      used: true,
      subcontractor: { select: { company: true } },
    },
  });
  if (!invite) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-5 py-16">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Vantara IQ</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
        Join {invite.subcontractor.company}
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        Fortitude Infrastructure has added you to this crew as{" "}
        <span className="font-semibold text-foreground">
          {ROLE_LABEL[invite.subUserRole] ?? invite.subUserRole}
        </span>
        . Set a password and you can start filing dailies.
      </p>

      {invite.used ? (
        <p className="mt-6 rounded-xl border border-border bg-foreground/[0.03] px-4 py-3 text-[13px] text-muted-foreground">
          This invitation has already been used.{" "}
          <Link href="/login" className="font-semibold text-brand-bright underline">
            Sign in instead
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6">
          <AcceptSubUserInvite
            token={invite.token}
            email={invite.email}
            name={invite.name}
            company={invite.subcontractor.company}
          />
        </div>
      )}
    </main>
  );
}
