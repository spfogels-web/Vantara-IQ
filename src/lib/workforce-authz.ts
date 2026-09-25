import "server-only";

import { prisma } from "@/lib/prisma";
import { isStaff, type CurrentUser } from "@/lib/auth";
import { NotAuthorizedError, requireUser } from "@/lib/authz";

/**
 * Who may do what in Workforce, decided in one place.
 *
 * Every rule here is enforced on the server. None of it is a hidden button:
 * an employee who knows a URL and an id gets the same answer as an employee
 * who guesses one, because the checks run before anything is read.
 *
 * The distinction that matters most is the one the rest of this product does
 * not yet draw. `isStaff` lumps ADMIN, PM, OFFICE and SUPERVISOR together,
 * and on the financial pages that is exactly what it means — all four can
 * read revenue today. Workforce does not widen that and does not rely on it:
 * management here is ADMIN, and the operational roles get a deliberately
 * narrower view that carries no money at all.
 */

/** An employee acting for themselves, resolved from the session. */
export type EmployeeIdentity = {
  employeeId: string;
  name: string;
  userId: string;
};

/**
 * The employee this session *is*.
 *
 * Resolved from the authenticated user and nothing else. No action takes an
 * employeeId from the client for a self-service operation, because an id in a
 * request body is a request, not an identity — and the whole of "an employee
 * cannot clock somebody else in" rests on never confusing the two.
 *
 * Returns null rather than throwing: a manager has no employee record and
 * that is not an error.
 */
export async function employeeForSession(): Promise<EmployeeIdentity | null> {
  const user = await requireUser();
  const employee = await prisma.employee.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, status: true },
  });
  if (!employee) return null;
  // Somebody who has left keeps their history and loses the clock.
  if (employee.status !== "ACTIVE") return null;
  return { employeeId: employee.id, name: employee.name, userId: user.id };
}

/**
 * The employee this session is, or a refusal.
 *
 * For the self-service paths: clocking in, clocking out, reading one's own
 * hours. A manager hitting these gets refused rather than silently acting as
 * nobody.
 */
export async function requireEmployeeSelf(): Promise<EmployeeIdentity> {
  const me = await employeeForSession();
  if (!me) {
    throw new NotAuthorizedError("This account is not set up as an employee.");
  }
  return me;
}

/**
 * Somebody who may manage other people's time.
 *
 * ADMIN only in V1. PM, OFFICE and SUPERVISOR are staff but are not given
 * other people's timecards or location history by default — that is a
 * deliberate narrowing, and widening it is a decision to take on purpose
 * rather than inherit from `isStaff`.
 */
export async function requireWorkforceManager(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new NotAuthorizedError("Workforce management is limited to administrators.");
  }
  return user;
}

/**
 * The operational view: who is on the clock, on what, since when.
 *
 * Open to staff, because a supervisor needs to know whether a crew turned up.
 * Carries no money and no location history — see the query layer, which
 * selects neither. An employee is not included: their own shift is theirs to
 * see, and everybody else's is not their business.
 */
export async function requireWorkforceOperational(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) {
    throw new NotAuthorizedError("That is not yours to see.");
  }
  return user;
}

/**
 * May this viewer read this timecard?
 *
 * Their own, or they manage. Deliberately takes the entry's id and does the
 * lookup here, so a caller cannot answer the ownership question itself and
 * get it wrong.
 */
export async function assertCanViewTimeEntry(timeEntryId: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;

  const entry = await prisma.timeEntry.findUnique({
    where: { id: timeEntryId },
    select: { employee: { select: { userId: true } } },
  });
  // Not found and not yours are the same answer on purpose: a probe must not
  // be able to tell the difference between a timecard that does not exist and
  // one that belongs to somebody else.
  if (!entry || entry.employee.userId !== user.id) {
    throw new NotAuthorizedError("That timecard isn't yours.");
  }
  return user;
}

/**
 * May this viewer *change* this timecard?
 *
 * Management only, and never the employee whose hours they are. Somebody
 * correcting their own clock-out is the one edit this system must not accept
 * quietly — that is what the audit trail exists to make visible, and letting
 * the subject make it would defeat it.
 */
export async function assertCanEditTimeEntry(timeEntryId: string): Promise<CurrentUser> {
  const user = await requireWorkforceManager();
  const exists = await prisma.timeEntry.findUnique({
    where: { id: timeEntryId },
    select: { id: true },
  });
  if (!exists) throw new NotAuthorizedError("That timecard isn't there.");
  return user;
}

/**
 * May this viewer read where somebody's device reported?
 *
 * The strictest of these, and the same rule as the timecard it hangs off:
 * your own, or you manage. A supervisor with the operational view gets hours
 * and status, not a map of where a person was — that is a different question
 * and needs a different answer.
 */
export async function assertCanViewLocation(timeEntryId: string): Promise<CurrentUser> {
  return assertCanViewTimeEntry(timeEntryId);
}

/**
 * The jobs this employee may book hours against.
 *
 * EmployeeProject is the authority and the only one. Not ProjectCrew — that
 * links a project to a subcontractor, a company we engage rather than a
 * person we employ — and not Project.crew, which is free text that defaults
 * to "Unassigned" and could not carry a permission if it tried.
 *
 * Assignment is authorization, not a schedule: it says where somebody *may*
 * put time, and says nothing about when they are expected there. A scheduling
 * feature can read this later; it must not be folded into it, because
 * "allowed to" and "expected to" come apart the first time somebody covers.
 *
 * An employee with no assignments gets an empty list and can book to no job.
 * That is the correct answer, not a broken one.
 */
export async function authorizedProjectsForEmployee(
  employeeId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.employeeProject.findMany({
    where: { employeeId },
    select: { project: { select: { id: true, name: true, status: true } } },
    orderBy: { project: { name: "asc" } },
  });
  // A finished job is not somewhere to start a shift.
  return rows
    .map((r) => r.project)
    .filter((p) => p.status !== "Completed")
    .map((p) => ({ id: p.id, name: p.name }));
}

/**
 * Whether this employee may book hours to this job, asked of the database.
 *
 * Clock In calls this again at submit time rather than trusting that the id
 * came from the list it rendered. The page and the punch are separate
 * requests, and an assignment can be removed between them — quite apart from
 * the person who never loaded the page at all.
 */
export async function isEmployeeAssignedToProject(
  employeeId: string,
  projectId: string,
): Promise<boolean> {
  const hit = await prisma.employeeProject.findUnique({
    where: { employeeId_projectId: { employeeId, projectId } },
    select: { id: true },
  });
  return Boolean(hit);
}
