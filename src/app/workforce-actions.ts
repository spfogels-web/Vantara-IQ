"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { easternDate } from "@/lib/billing";
import {
  assertCanEditTimeEntry,
  isEmployeeAssignedToProject,
  requireEmployeeSelf,
  requireWorkforceManager,
} from "@/lib/workforce-authz";
import {
  HEARTBEAT_SECONDS,
  MAX_PERIODIC_ACCURACY_METRES,
  MIN_MOVEMENT_METRES,
  MIN_SECONDS_BETWEEN_POINTS,
  isFiniteNumber,
  isValidPosition,
  metresBetween,
} from "@/lib/workforce-location";

/**
 * Starting and ending a shift.
 *
 * Both take their employee from the session and never from the request. An
 * employeeId in a form body is a claim, not an identity, and the difference
 * between those two is the whole of "nobody can clock somebody else in".
 *
 * Both timestamps are the server's. A phone with a wrong clock — or a helpful
 * one — is not evidence of when work started.
 */

/** A shift, begun. */
export async function clockIn(input: {
  projectId?: string | null;
  note?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number | null;
}) {
  const me = await requireEmployeeSelf();

  /**
   * A shift starts with a position, or it does not start.
   *
   * The clock-in fix is the one location that is worth most later: it is the
   * only point taken at a moment the employee deliberately chose, and it is
   * what a dispute about whether somebody turned up actually turns on. A
   * shift that begins with no position at all is a weaker record than one
   * that begins with a poor one, so this refuses rather than shrugging.
   *
   * Note the accuracy rule is looser than for periodic points: a first fix
   * indoors is often vague and gets better within a minute. Refusing it would
   * strand somebody in a warehouse doorway pressing a button that never
   * works, which is how a rule designed for accuracy produces no record.
   */
  if (!isValidPosition(input.latitude, input.longitude)) {
    return {
      ok: false as const,
      error: "Location is required to clock in. Allow location access and try again.",
      needsLocation: true as const,
    };
  }

  /**
   * The job, checked again here rather than trusted from the form.
   *
   * The page that offered the list and the punch that names a job are two
   * separate requests. An assignment can be withdrawn between them, and a
   * request need never have come from that page at all — so the question is
   * asked of EmployeeProject at submit time, every time.
   *
   * The project's own name is read from the project rather than accepted
   * alongside the id, so a timecard cannot be labelled with one job while
   * pointing at another.
   */
  const projectId = input.projectId?.trim() || null;
  let projectName = "";
  if (projectId) {
    const assigned = await isEmployeeAssignedToProject(me.employeeId, projectId);
    if (!assigned) {
      return {
        ok: false as const,
        error: "You are not assigned to that job, so hours cannot be booked to it.",
      };
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    projectName = project?.name ?? "";
  }

  const now = new Date();

  /**
   * One open shift, decided twice.
   *
   * The read-then-write below is the courteous half: it turns a double-tap
   * into a clear message instead of a database error. The half that actually
   * holds is the partial unique index in 007, which refuses the second insert
   * whoever asks and whatever raced — see the catch.
   */
  const open = await prisma.timeEntry.findFirst({
    where: { employeeId: me.employeeId, clockOutAt: null },
    select: { id: true },
  });
  if (open) {
    return { ok: false as const, error: "You are already clocked in.", entryId: open.id };
  }

  try {
    const entry = await prisma.timeEntry.create({
      data: {
        employeeId: me.employeeId,
        projectId,
        projectName,
        clockInAt: now,
        // Fixed at clock-in so an overnight shift stays on the day it began.
        // Duration never uses this — see clockOut.
        workDate: easternDate(now) ?? now.toISOString().slice(0, 10),
        status: "OPEN",
        clockInNote: (input.note ?? "").trim(),
        clockInLocationOk: true,
      },
      select: { id: true },
    });

    // The opening position, on the same row's terms as every other point.
    await prisma.timeEntryLocation.create({
      data: {
        timeEntryId: entry.id,
        capturedAt: now,
        latitude: input.latitude as number,
        longitude: input.longitude as number,
        accuracyMeters: isFiniteNumber(input.accuracyMeters) ? input.accuracyMeters : null,
        kind: "CLOCK_IN",
      },
    });

    revalidatePath("/time-clock");
    return { ok: true as const, entryId: entry.id };
  } catch {
    // The index refused it. Somebody clocked in twice faster than a read.
    return { ok: false as const, error: "You are already clocked in." };
  }
}

/**
 * A shift, ended.
 *
 * DELIBERATELY ASYMMETRIC WITH clockIn: this does not consult
 * EmployeeProject, and must not be "tidied up" to match.
 *
 * Assignment decides where somebody may *start* putting time. Once a shift is
 * open it is a fact about work already being done, and taking the person off
 * that job cannot be allowed to strand them on the clock — the office removes
 * somebody from Tall Lewis at two in the afternoon and they are still stood
 * on it until five. A check here would turn an administrative edit into hours
 * nobody can close, and the only way out would be a manual correction with an
 * audit trail, for something that was never wrong.
 *
 * So the open shift is found by employee alone. See the regression test.
 */
export async function clockOut(input: {
  note?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number | null;
}) {
  const me = await requireEmployeeSelf();

  const open = await prisma.timeEntry.findFirst({
    where: { employeeId: me.employeeId, clockOutAt: null },
    select: { id: true, clockInAt: true },
  });
  if (!open) return { ok: false as const, error: "You are not clocked in." };

  const now = new Date();
  /**
   * Duration from the two timestamps, on the server.
   *
   * Not from workDate, and not from anything the browser counted. A shift
   * that crosses midnight is the ordinary case this protects: the elapsed
   * timer on the phone is a convenience, and this is the number.
   */
  const seconds = Math.max(0, Math.round((now.getTime() - open.clockInAt.getTime()) / 1000));

  /**
   * The closing fix is attempted and never required.
   *
   * A phone in a basement, a revoked permission, a dead GPS, a browser that
   * times out — none of those are a reason to leave somebody on the clock
   * overnight. The shift closes either way and the record says which
   * happened, because "we did not get a final position" is a fact worth
   * keeping and a trapped employee is a support call and a wrong timesheet.
   *
   * Nothing is copied from the last periodic point to stand in for it. A
   * position invented at clock-out would be a claim about where somebody
   * finished work, which is exactly the claim nobody should be making up.
   */
  const gotFinalFix = isValidPosition(input.latitude, input.longitude);
  if (gotFinalFix) {
    await prisma.timeEntryLocation.create({
      data: {
        timeEntryId: open.id,
        capturedAt: now,
        latitude: input.latitude as number,
        longitude: input.longitude as number,
        accuracyMeters: isFiniteNumber(input.accuracyMeters) ? input.accuracyMeters : null,
        kind: "CLOCK_OUT",
      },
    });
  }

  await prisma.timeEntry.update({
    where: { id: open.id },
    data: {
      clockOutAt: now,
      durationSeconds: seconds,
      status: "COMPLETE",
      clockOutNote: (input.note ?? "").trim(),
      clockOutLocationOk: gotFinalFix,
    },
  });

  revalidatePath("/time-clock");
  return { ok: true as const, entryId: open.id, seconds, locationRecorded: gotFinalFix };
}

/**
 * One position, offered by a browser and checked before it is believed.
 *
 * Nothing about this trusts the caller. The employee comes from the session,
 * the shift is looked up server-side from that employee, and the coordinates
 * are range-checked before anything is written. There is no timeEntryId
 * parameter on purpose: a client that could name the entry could append a
 * morning's positions to somebody else's timecard, and no amount of checking
 * an id afterwards is as good as never accepting one.
 *
 * `capturedAt` is the server's clock. The browser's fix timestamp is not
 * used: it is client-controlled, it can be wrong by hours on a phone whose
 * clock has drifted, and it is the field a person would forge to claim they
 * were somewhere earlier. Points are sent as they are taken, so server
 * receipt time and capture time differ by a network hop.
 */
export async function recordLocation(input: {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
}) {
  const me = await requireEmployeeSelf();

  if (!isValidPosition(input.latitude, input.longitude)) {
    return { ok: false as const, error: "That is not a position on Earth." };
  }
  const accuracy =
    input.accuracyMeters === null || input.accuracyMeters === undefined
      ? null
      : isFiniteNumber(input.accuracyMeters) && input.accuracyMeters >= 0
        ? input.accuracyMeters
        : NaN;
  if (Number.isNaN(accuracy)) {
    return { ok: false as const, error: "That accuracy is not a number of metres." };
  }
  // A fix this vague locates a town, not a jobsite.
  if (accuracy !== null && accuracy > MAX_PERIODIC_ACCURACY_METRES) {
    return { ok: false as const, error: "Too imprecise to record.", skipped: "ACCURACY" as const };
  }

  // The shift is found, never supplied. No open shift, no location.
  const open = await prisma.timeEntry.findFirst({
    where: { employeeId: me.employeeId, clockOutAt: null },
    select: { id: true, clockInAt: true },
  });
  if (!open) {
    return { ok: false as const, error: "You are not clocked in.", skipped: "NO_SHIFT" as const };
  }

  const now = new Date();

  /**
   * The throttle, enforced here as well as in the browser.
   *
   * The client already spaces its sends; this is what stops a client that
   * does not. Without it a loop could write a row a second and turn one
   * shift into a hundred thousand rows — which is a denial of service
   * against our own database dressed as diligence.
   */
  const last = await prisma.timeEntryLocation.findFirst({
    where: { timeEntryId: open.id },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true, latitude: true, longitude: true },
  });

  if (last) {
    const sinceSeconds = (now.getTime() - last.capturedAt.getTime()) / 1000;
    if (sinceSeconds < MIN_SECONDS_BETWEEN_POINTS) {
      return { ok: false as const, error: "Too soon.", skipped: "TOO_SOON" as const };
    }
    // Still here, and not long enough since the last one to be worth saying so.
    const moved = metresBetween(last, { latitude: input.latitude, longitude: input.longitude });
    if (moved < MIN_MOVEMENT_METRES && sinceSeconds < HEARTBEAT_SECONDS) {
      return { ok: false as const, error: "Hasn't moved.", skipped: "STATIONARY" as const };
    }
  }

  await prisma.timeEntryLocation.create({
    data: {
      timeEntryId: open.id,
      capturedAt: now,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: accuracy,
      kind: "PERIODIC",
    },
  });

  return { ok: true as const };
}

/**
 * Putting somebody on a job, and taking them off it.
 *
 * Management only. Assignment is what decides where an employee may book
 * hours, so this is an authorization change wearing the clothes of an
 * administrative one — hence requireWorkforceManager rather than staff.
 */
export async function assignEmployeeToProject(input: {
  employeeId: string;
  projectId: string;
}) {
  const user = await requireWorkforceManager();

  const [employee, project] = await Promise.all([
    prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } }),
    prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } }),
  ]);
  if (!employee || !project) return { ok: false as const, error: "That employee or job is gone." };

  try {
    await prisma.employeeProject.create({
      data: {
        employeeId: input.employeeId,
        projectId: input.projectId,
        assignedBy: user.name || user.email || "",
      },
    });
  } catch {
    // The unique pairing refused it. Assigning twice is not two permissions,
    // and saying "already assigned" is more useful than an error.
    return { ok: true as const, alreadyAssigned: true };
  }

  revalidatePath("/workforce");
  return { ok: true as const };
}

/**
 * Taking somebody off a job.
 *
 * Removes the permission and nothing else. Hours already booked keep their
 * projectId and projectName, and an open shift on that job stays open and
 * closeable — see clockOut, which deliberately does not consult assignment.
 */
export async function unassignEmployeeFromProject(input: {
  employeeId: string;
  projectId: string;
}) {
  await requireWorkforceManager();

  await prisma.employeeProject
    .delete({
      where: {
        employeeId_projectId: {
          employeeId: input.employeeId,
          projectId: input.projectId,
        },
      },
    })
    .catch(() => undefined);

  revalidatePath("/workforce");
  return { ok: true as const };
}

/**
 * Correcting a punch somebody got wrong.
 *
 * Forgetting to clock out is the commonest mistake in timekeeping and the one
 * this has to handle without becoming a way to rewrite history. So: the
 * TimeEntry carries the corrected value, TimeEntryAudit keeps what it was,
 * and every change needs a reason from a named person. Nothing here is a
 * silent overwrite.
 *
 * GPS IS NOT CORRECTABLE, AND THERE IS NO PARAMETER FOR IT. A location point
 * is an observation: the device said it was here at this moment. A manager
 * may be right that somebody worked until 5:37, and still has no standing to
 * claim the phone reported a position it never reported. Moving the clock-out
 * later is therefore allowed to *lower* the coverage figure, because the
 * extra half hour genuinely was not observed, and a coverage number that
 * stayed flattering through a correction would be worth nothing.
 */
export async function correctTimeEntry(input: {
  timeEntryId: string;
  clockInAt?: string;
  clockOutAt?: string;
  projectId?: string | null;
  reason: string;
}) {
  const user = await assertCanEditTimeEntry(input.timeEntryId);

  const reason = (input.reason ?? "").trim();
  // A correction without a reason is a correction nobody can check later.
  if (reason.length < 3) {
    return { ok: false as const, error: "Give a reason for the correction." };
  }

  const entry = await prisma.timeEntry.findUnique({
    where: { id: input.timeEntryId },
    select: {
      id: true,
      clockInAt: true,
      clockOutAt: true,
      projectId: true,
      projectName: true,
      workDate: true,
    },
  });
  if (!entry) return { ok: false as const, error: "That timecard is gone." };

  const nextIn = input.clockInAt ? new Date(input.clockInAt) : entry.clockInAt;
  const nextOut =
    input.clockOutAt === undefined
      ? entry.clockOutAt
      : input.clockOutAt === ""
        ? null
        : new Date(input.clockOutAt);

  if (Number.isNaN(nextIn.getTime()) || (nextOut && Number.isNaN(nextOut.getTime()))) {
    return { ok: false as const, error: "That is not a time." };
  }
  // A shift cannot end before it started, whatever anybody types.
  if (nextOut && nextOut.getTime() < nextIn.getTime()) {
    return { ok: false as const, error: "Clock out cannot be before clock in." };
  }

  /**
   * The work date follows the corrected start.
   *
   * Fixed from the clock-in exactly as it is at clock-in, so a shift moved
   * back across midnight lands on the day it now says it began rather than
   * keeping a date that no longer matches its own timestamps. The change is
   * audited like any other, because it can move a day between billing weeks.
   */
  const nextWorkDate = easternDate(nextIn) ?? entry.workDate;

  // Duration from the timestamps, on the server. Never from the browser.
  const nextDuration = nextOut
    ? Math.max(0, Math.round((nextOut.getTime() - nextIn.getTime()) / 1000))
    : null;

  let nextProjectId = entry.projectId;
  let nextProjectName = entry.projectName;
  if (input.projectId !== undefined && input.projectId !== entry.projectId) {
    if (input.projectId === null || input.projectId === "") {
      nextProjectId = null;
      // The name is kept: a timecard that once said which job it was should
      // still read that way after the link is cleared.
    } else {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true },
      });
      if (!project) return { ok: false as const, error: "That job is gone." };
      nextProjectId = project.id;
      nextProjectName = project.name;
    }
  }

  /** What actually moved, in the words the history will be read in. */
  const changes: { field: string; oldValue: string; newValue: string }[] = [];
  const iso = (d: Date | null) => (d ? d.toISOString() : "");
  if (iso(nextIn) !== iso(entry.clockInAt)) {
    changes.push({ field: "clockInAt", oldValue: iso(entry.clockInAt), newValue: iso(nextIn) });
  }
  if (iso(nextOut) !== iso(entry.clockOutAt)) {
    changes.push({ field: "clockOutAt", oldValue: iso(entry.clockOutAt), newValue: iso(nextOut) });
  }
  if (nextWorkDate !== entry.workDate) {
    changes.push({ field: "workDate", oldValue: entry.workDate, newValue: nextWorkDate });
  }
  if (nextProjectId !== entry.projectId) {
    changes.push({
      field: "projectId",
      oldValue: entry.projectName || entry.projectId || "",
      newValue: nextProjectName || nextProjectId || "",
    });
  }

  if (changes.length === 0) {
    return { ok: false as const, error: "Nothing was changed." };
  }

  /**
   * The record and its history move together or not at all.
   *
   * A correction that updated the timecard and then failed to write its audit
   * row would be exactly the silent overwrite this exists to prevent.
   */
  await prisma.$transaction(async (tx) => {
    await tx.timeEntry.update({
      where: { id: entry.id },
      data: {
        clockInAt: nextIn,
        clockOutAt: nextOut,
        workDate: nextWorkDate,
        durationSeconds: nextDuration,
        projectId: nextProjectId,
        projectName: nextProjectName,
        // Still a correct timecard — but one a person changed, and a reviewer
        // is entitled to see that at a glance without opening the history.
        status: nextOut ? "EDITED" : "OPEN",
      },
    });

    await tx.timeEntryAudit.createMany({
      data: changes.map((c) => ({
        timeEntryId: entry.id,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        reason,
        actorUserId: user.id,
        actorEmail: user.email ?? "",
      })),
    });
  });

  revalidatePath("/workforce");
  revalidatePath(`/workforce/timesheets/${entry.id}`);
  return { ok: true as const, changed: changes.length };
}
