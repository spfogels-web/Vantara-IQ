"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword, signSession, setSessionCookie } from "@/lib/auth";

/**
 * Turn an invitation into a login.
 *
 * Deliberately takes no session and no subcontractor id. The token is the
 * whole authority: it was minted by staff against one company with one job
 * title, and everything written here comes off it rather than off the form. A
 * caller who edits the payload can change their own name and nothing else.
 *
 * The write is a transaction with the token burn, so two people opening the
 * same forwarded link cannot both get an account.
 */
export async function acceptSubUserInvite(input: {
  token: string;
  name: string;
  password: string;
}) {
  const invite = await prisma.subUserInvite.findUnique({
    where: { token: input.token },
    select: {
      token: true,
      used: true,
      email: true,
      subUserRole: true,
      subcontractorId: true,
    },
  });
  if (!invite) return { ok: false as const, error: "That invitation link isn't valid." };
  if (invite.used) {
    return { ok: false as const, error: "That invitation has already been used." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Enter your name." };
  if (!input.password || input.password.length < 8) {
    return { ok: false as const, error: "Use a password of at least 8 characters." };
  }

  // Somebody may have been given a login by hand between the invite going out
  // and it being opened.
  const clash = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });
  if (clash) {
    return {
      ok: false as const,
      error: "There is already a login for this address. Sign in instead, or ask the office.",
    };
  }

  const passwordHash = await hashPassword(input.password);

  let userId: string;
  try {
    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          email: invite.email,
          name,
          passwordHash,
          role: "SUBCONTRACTOR",
          subcontractorId: invite.subcontractorId,
          subUserRole: invite.subUserRole,
        },
        select: { id: true, role: true },
      }),
      // Burned in the same transaction as the account it creates. A second
      // person opening a forwarded copy of the link finds it spent.
      prisma.subUserInvite.update({
        where: { token: invite.token, used: false },
        data: { used: true },
      }),
    ]);
    userId = user.id;
  } catch {
    return { ok: false as const, error: "That invitation has already been used." };
  }

  await setSessionCookie(await signSession({ userId, role: "SUBCONTRACTOR" }));
  return { ok: true as const };
}
