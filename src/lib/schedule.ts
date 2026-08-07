/**
 * Deadline maths for a production job.
 *
 * Everything here counts *working* days, Monday to Friday. A job that needs
 * 20,000 ft in three weeks needs it in fifteen days, not twenty-one, and a
 * required pace computed on calendar days is quietly 30% too low — the crew
 * looks fine right up until the week they can't make up.
 *
 * All dates are YYYY-MM-DD and all arithmetic is in UTC. A local-time Date on a
 * date-only string shifts backwards anywhere west of UTC, which turns Monday
 * into Sunday and drops it from the count.
 */

/** Parse YYYY-MM-DD to a UTC date, or null. */
export function parseDay(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Saturday and Sunday are not production days. */
export function isWorkingDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Working days from `from` to `to`, counting `to` and not `from`.
 *
 * Zero when the deadline is today — there is no day left to work, which is the
 * honest answer rather than one.
 */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let count = 0;
  const cursor = new Date(from.getTime());
  while (cursor.getTime() < to.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDay(cursor)) count++;
  }
  return count;
}

/** Working days from `from` up to and including `to`. */
export function workingDaysInclusive(from: Date, to: Date): number {
  if (to.getTime() < from.getTime()) return 0;
  return workingDaysBetween(from, to) + (isWorkingDay(from) ? 1 : 0);
}

/** Move forward n working days from a date. */
export function addWorkingDays(from: Date, n: number): Date {
  const cursor = new Date(from.getTime());
  let left = n;
  while (left > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDay(cursor)) left--;
  }
  return cursor;
}

export interface SchedulePosition {
  /** Route feet the material list calls for — plow and bore only. */
  plannedFt: number;
  /** Route feet the dailies report against those same codes. */
  completedFt: number;
  remainingFt: number;
  /** completedFt / plannedFt, or null when there is nothing planned. */
  pctComplete: number | null;

  deadline: string | null;
  /** Working days left, deadline excluded of today. Null with no deadline. */
  workingDaysLeft: number | null;
  /** Feet per working day needed from here. Null with no deadline. */
  requiredFtPerDay: number | null;

  /** Working days the crew has actually filed a daily on. */
  daysWorked: number;
  /** completedFt / daysWorked — measured on days worked, not days elapsed. */
  actualFtPerDay: number | null;

  /**
   * Where the finish lands at the pace actually being achieved, or null when
   * there is nothing to project from.
   */
  projectedFinish: string | null;
  /** Working days early (positive) or late (negative) against the deadline. */
  daysAhead: number | null;
  /** actual / required — under 1 is behind. Null when either is unknown. */
  paceRatio: number | null;
  status: "no-deadline" | "not-started" | "on-track" | "behind" | "at-risk" | "overdue" | "done";
}

/**
 * Where a job stands against its deadline.
 *
 * Pace is measured over days the crew actually filed a daily, not days on the
 * calendar. A crew that hasn't been on site all week is not running at zero
 * feet a day — it has not started, and reporting 0 ft/day would tell someone
 * the crew is failing when the truth is the job hasn't been released.
 */
export function schedulePosition(input: {
  plannedFt: number;
  completedFt: number;
  deadline: string | null;
  /** Distinct work dates with production on this job. */
  workDates: string[];
  /** Today, injectable so this is testable. */
  today?: Date;
}): SchedulePosition {
  const today = input.today ?? parseDay(toDay(new Date()))!;
  const plannedFt = Math.max(0, input.plannedFt);
  const completedFt = Math.max(0, input.completedFt);
  const remainingFt = Math.max(0, plannedFt - completedFt);
  const pctComplete = plannedFt > 0 ? Math.min(1, completedFt / plannedFt) : null;

  const daysWorked = new Set(input.workDates.filter((d) => parseDay(d))).size;
  const actualFtPerDay = daysWorked > 0 ? completedFt / daysWorked : null;

  const deadlineDate = parseDay(input.deadline);
  const workingDaysLeft = deadlineDate ? workingDaysBetween(today, deadlineDate) : null;

  // Zero days left with work outstanding is not an infinite pace — it is a
  // job that cannot be finished on time, and the caller is told which.
  const requiredFtPerDay =
    workingDaysLeft === null ? null : workingDaysLeft > 0 ? remainingFt / workingDaysLeft : null;

  const projectedFinish =
    remainingFt > 0 && actualFtPerDay && actualFtPerDay > 0
      ? toDay(addWorkingDays(today, Math.ceil(remainingFt / actualFtPerDay)))
      : remainingFt === 0 && plannedFt > 0
        ? toDay(today)
        : null;

  const projected = parseDay(projectedFinish);
  const daysAhead =
    deadlineDate && projected
      ? projected.getTime() <= deadlineDate.getTime()
        ? workingDaysBetween(projected, deadlineDate)
        : -workingDaysBetween(deadlineDate, projected)
      : null;

  const paceRatio =
    actualFtPerDay !== null && requiredFtPerDay !== null && requiredFtPerDay > 0
      ? actualFtPerDay / requiredFtPerDay
      : null;

  let status: SchedulePosition["status"];
  if (plannedFt > 0 && remainingFt === 0) status = "done";
  else if (!deadlineDate) status = "no-deadline";
  else if (workingDaysLeft === 0 && remainingFt > 0) status = "overdue";
  else if (daysWorked === 0) status = "not-started";
  else if (paceRatio === null) status = "on-track";
  else if (paceRatio >= 1) status = "on-track";
  else if (paceRatio >= 0.85) status = "at-risk";
  else status = "behind";

  return {
    plannedFt,
    completedFt,
    remainingFt,
    pctComplete,
    deadline: deadlineDate ? toDay(deadlineDate) : null,
    workingDaysLeft,
    requiredFtPerDay,
    daysWorked,
    actualFtPerDay,
    projectedFinish,
    daysAhead,
    paceRatio,
    status,
  };
}
