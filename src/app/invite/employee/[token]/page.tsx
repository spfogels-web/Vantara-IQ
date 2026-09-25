import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { orgName } from "@/lib/org-settings";
import { AcceptEmployeeInvite } from "@/components/workforce/accept-employee-invite";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your time clock · Vantara IQ" };

/**
 * The page an invited employee lands on.
 *
 * Public by necessity — they have no login yet, that is the whole point — and
 * safe because the token is the authority. It names one employee, fixed
 * before the link was sent, so nothing typed here can put somebody on the
 * payroll who was not invited.
 *
 * A used token shows a plain "already used" rather than a form that fails on
 * submit. These get forwarded around, and a second person opening the same
 * link is the ordinary case rather than an attack.
 */
export default async function AcceptEmployeeInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await prisma.employeeInvite.findUnique({
    where: { token },
    select: {
      token: true,
      email: true,
      used: true,
      employee: { select: { name: true, title: true, userId: true } },
    },
  });
  if (!invite || !invite.employee) notFound();

  // Somebody may have been given a login by hand since this was minted.
  const spent = invite.used || !!invite.employee.userId;

  return (
    <main className="mx-auto w-full max-w-md px-5 py-16">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Vantara IQ</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
        Set up your time clock
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        {await orgName()} has added you to Workforce
        {invite.employee.title ? ` as ${invite.employee.title}` : ""}. Choose a
        password and you can clock in from your phone.
      </p>

      {spent ? (
        <p className="mt-6 rounded-xl border border-border bg-foreground/[0.03] px-4 py-3 text-[13px] text-muted-foreground">
          This invitation has already been used.{" "}
          <Link href="/login" className="font-semibold text-brand-bright underline">
            Sign in instead
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6">
          <AcceptEmployeeInvite
            token={invite.token}
            email={invite.email}
            name={invite.employee.name}
          />
        </div>
      )}
    </main>
  );
}
