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
 * Assignments are stored as project *names* on the subcontractor rather than
 * ids, so they're resolved here — in one place, deliberately. If that ever
 * becomes a real relation, this function is the only thing that changes.
 * Names are compared case- and whitespace-insensitively because they're typed
 * by hand in two different screens.
 */
export async function visibleProjectIds(user: CurrentUser): Promise<string[] | null> {
  if (isStaff(user.role)) return null;
  if (!user.subcontractorId) return [];

  const sub = await prisma.subcontractor.findUnique({
    where: { id: user.subcontractorId },
    select: { assignedProjects: true },
  });
  const names = (sub?.assignedProjects ?? []).map(normalizeName).filter(Boolean);
  if (names.length === 0) return [];

  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  return projects.filter((p) => names.includes(normalizeName(p.name))).map((p) => p.id);
}

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

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
