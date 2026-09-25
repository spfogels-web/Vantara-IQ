"use server";

import { prisma } from "@/lib/prisma";
import { runWithOrg } from "@/lib/org-context";
import { PLATFORM_HOME_ORG } from "@/lib/org-registry";
import { hashPassword, signSession, setSessionCookie } from "@/lib/auth";

/**
 * Turn an employee's invitation into a login.
 *
 * Deliberately separate from acceptSubUserInvite. The two do the same shape of
 * thing and mean different things: that one puts a person inside a company we
 * engage, this one puts a person on our own payroll with a time clock. Fusing
 * them would mean one function deciding, from a flag, whether it was creating
 * a subcontractor's foreman or Fortitude's operator — and the day those rules
 * diverge, both would be wrong.
 *
 * Takes no session, because having no account is the entire point. The token
 * is the whole authority: it names one employee and one address, both fixed
 * before the link was sent, so nothing typed on the page can move the account
 * to a different person. The name is not even accepted from the form — it is
 * the employee's own, as the office recorded it.
 *
 * The write is a transaction with the token burn, so two people opening the
 * same forwarded link cannot both get an account.
 */
export async function acceptEmployeeInvite(input: { token: string; password: string }) {
  /**
   * An invitation arrives with no session, so nothing has told this request
   * which organisation it belongs to — and unlike a page it cannot be
   * refused. Employees are staff of the organisation that holds the accounts,
   * which is where the invitation was minted.
   */
  return runWithOrg(PLATFORM_HOME_ORG, () => accept(input));
}

async function accept(input: { token: string; password: string }) {
  const invite = await prisma.employeeInvite.findUnique({
    where: { token: input.token },
    select: {
      token: true,
      used: true,
      email: true,
      employeeId: true,
      employee: { select: { id: true, name: true, userId: true, status: true } },
    },
  });
  if (!invite) return { ok: false as const, error: "That invitation link isn't valid." };
  if (invite.used) {
    return { ok: false as const, error: "That invitation has already been used." };
  }
  if (!invite.employee) {
    return { ok: false as const, error: "That invitation is no longer valid." };
  }
  // Somebody may have been given a login by hand between the invite going out
  // and it being opened. One employee, one login — see Employee.userId, which
  // is unique.
  if (invite.employee.userId) {
    return { ok: false as const, error: "This person already has a login." };
  }

  if (!input.password || input.password.length < 8) {
    return { ok: false as const, error: "Use a password of at least 8 characters." };
  }

  // And somebody may have taken the address in the meantime.
  const clash = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });
  if (clash) {
    return {
      ok: false as const,
      error: "There is already a login for that address. Ask the office to sort it out.",
    };
  }

  const passwordHash = await hashPassword(input.password);

  let userId: string;
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: invite.email,
          name: invite.employee!.name,
          passwordHash,
          // Not staff. isStaff in lib/auth lists ADMIN, PM, OFFICE and
          // SUPERVISOR and does not include this; the middleware allowlist is
          // what holds an employee to their own time clock.
          role: "EMPLOYEE",
        },
        select: { id: true },
      });

      // The link, made here rather than anywhere else. Employee.userId is
      // unique, so this is also the constraint that stops one login ever
      // controlling two timecards.
      //
      // updateMany, and the count is checked: the `userId: null` filter is
      // what makes this safe against two requests arriving together, and a
      // plain update cannot carry it. Zero rows means somebody won the race,
      // and throwing rolls the new User back with it.
      const linked = await tx.employee.updateMany({
        where: { id: invite.employeeId, userId: null },
        data: { userId: created.id },
      });
      if (linked.count !== 1) throw new Error("already linked");

      // Burned in the same transaction as the account it creates. A second
      // person opening a forwarded copy finds it spent.
      await tx.employeeInvite.update({
        where: { token: invite.token, used: false },
        data: { used: true },
      });

      return created;
    });
    userId = user.id;
  } catch {
    return { ok: false as const, error: "That invitation has already been used." };
  }

  await setSessionCookie(
    await signSession({
      userId,
      role: "EMPLOYEE",
      org: PLATFORM_HOME_ORG,
      home: PLATFORM_HOME_ORG,
    }),
  );
  return { ok: true as const };
}
