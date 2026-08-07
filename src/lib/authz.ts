import "server-only";

import { getCurrentUser, isStaff, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Who is allowed to do what.
 *
 * The edge middleware gates page URLs, which is a coarse first pass and not a
 * security boundary: Server Actions are POSTs to whatever route the browser is
 * already on, so a subcontractor sitting on /projects — a page they're allowed
 * to load — could invoke any exported action, including ones that read another
 * crew's rate card. Route gating cannot see that. Authorization therefore lives
 * here and is called inside the action or query itself, where the actual data
 * access happens.
 *
 * Two rules drive everything below:
 *
 *   1. A subcontractor sees only projects they're assigned to — including the
 *      maps, material lists and redlines that hang off those projects.
 *   2. A subcontractor never sees a rate card other than their own. Not
 *      Fortitude's contract rates with the GC, and not another sub's pricing,
 *      because no two subs are on the same numbers.
 *
 * Failures throw rather than return an error shape. An unauthorized call is a
 * bug or an attack, never a form validation problem, and throwing means a
 * missed guard fails closed instead of silently returning data.
 */

export class NotAuthorizedError extends Error {
  constructor(message = "You don't have access to that.") {
    super(message);
    this.name = "NotAuthorizedError";
  }
}

/** The signed-in user, or null. Never throws — for read paths that degrade. */
export async function viewer(): Promise<CurrentUser | null> {
  return getCurrentUser();
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new NotAuthorizedError("You need to be signed in.");
  return user;
}

/** Fortitude staff only — anything a subcontractor must never reach. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) throw new NotAuthorizedError();
  return user;
}

/**
 * Project ids this user may see, or `null` meaning "everything" for staff.
 *
 * Assignments are a foreign-key relation, so this is a straight read — there's
 * no name matching to get wrong. Renaming a project cannot revoke a crew's
 * access, two projects sharing a job number stay distinct, and deleting a
 * project drops its assignments rather than leaving them dangling.
 */
export async function visibleProjectIds(user: CurrentUser): Promise<string[] | null> {
  if (isStaff(user.role)) return null;
  if (!user.subcontractorId) return [];

  const sub = await prisma.subcontractor.findUnique({
    where: { id: user.subcontractorId },
    select: { projects: { select: { id: true } } },
  });
  return (sub?.projects ?? []).map((p) => p.id);
}

/**
 * Throws unless the user may see this project. Everything hanging off a
 * project — the map, the redlines, the material list, the sheets — is gated on
 * this one check, so there's a single place to be right.
 */
export async function assertProjectAccess(projectId: string): Promise<CurrentUser> {
  const user = await requireUser();
  const allowed = await visibleProjectIds(user);
  if (allowed === null) return user; // staff
  if (!allowed.includes(projectId)) {
    throw new NotAuthorizedError("That project isn't assigned to you.");
  }
  return user;
}

/**
 * Throws unless the user is staff or belongs to this subcontractor. Guards
 * rate cards, compliance documents and anything else scoped to one company.
 */
export async function assertOwnSubcontractor(subcontractorId: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (isStaff(user.role)) return user;
  if (user.subcontractorId !== subcontractorId) {
    throw new NotAuthorizedError("That belongs to another subcontractor.");
  }
  return user;
}

/** True when this viewer is a subcontractor login rather than Fortitude staff. */
export function isSubViewer(user: CurrentUser | null): boolean {
  return !!user && !isStaff(user.role);
}

/**
 * Permission to write into one subcontractor's record, during or after onboarding.
 *
 * Onboarding genuinely runs before anyone has a login — a crew follows an invite
 * link and starts filling the packet in. So these actions cannot demand a
 * session. What they can demand is the invite token that created the record,
 * which binds the caller to exactly one company.
 *
 * Three ways in, in order: Fortitude staff, the sub's own login, or the invite
 * token bound to that subcontractor. Nothing else. Without this an action that
 * takes a subcontractor id lets anyone on the internet write into any sub's
 * file — upload a document into a competitor's packet, or rewrite their
 * capabilities — because a Server Action is just a POST to the page.
 */
export async function assertSubcontractorWrite(
  subcontractorId: string,
  inviteToken?: string | null,
): Promise<void> {
  if (!subcontractorId) throw new NotAuthorizedError("No subcontractor given.");

  const user = await viewer();
  if (user && isStaff(user.role)) return;
  if (user && user.subcontractorId === subcontractorId) return;

  if (inviteToken) {
    const invite = await prisma.invite.findUnique({
      where: { token: inviteToken },
      select: { subcontractorId: true },
    });
    // The token has to already own this record. A valid token for some other
    // company is not a key to this one.
    if (invite?.subcontractorId && invite.subcontractorId === subcontractorId) return;
  }

  throw new NotAuthorizedError("That belongs to another subcontractor.");
}

/**
 * Claim a fresh invite for the subcontractor it just created.
 *
 * One-way: a token that already points at a company cannot be repointed at
 * another, or a leaked link would become a key to whichever record the holder
 * named last.
 */
export async function bindInviteToSubcontractor(
  inviteToken: string,
  subcontractorId: string,
): Promise<void> {
  if (!inviteToken || !subcontractorId) return;
  const invite = await prisma.invite.findUnique({
    where: { token: inviteToken },
    select: { subcontractorId: true },
  });
  if (!invite || invite.subcontractorId) return;
  await prisma.invite.update({
    where: { token: inviteToken },
    data: { subcontractorId },
  });
}
