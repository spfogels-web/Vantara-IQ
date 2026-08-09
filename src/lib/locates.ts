/**
 * The clock on a locate ticket.
 *
 * A ticket is only good for a window. Inside it, the marks on the ground are
 * the utilities' answer; outside it, they are paint somebody left behind. The
 * whole point of tracking this is that the difference is invisible on site —
 * faded paint and fresh paint look the same to a crew at 7am, and the only
 * thing that says which is which is a date.
 *
 * Two rules run through everything here:
 *
 *   1. The date on the ticket wins. Georgia 811 states the update-by and
 *      expiry dates when it issues, so a stored date is used as given. A
 *      computed one is a fallback for a ticket typed in by hand, and is
 *      marked as computed so nobody mistakes an assumption for the ticket.
 *
 *   2. Nothing is ever inferred as safe. An unknown is reported as unknown.
 *      Silence from a utility is not a clearance, and an expired ticket is
 *      not "probably still fine".
 */

/** How long a ticket runs, and how much warning to give. Configurable because
 *  the rule belongs to the state and the operator, not to this file. */
export interface LocateTerms {
  /** Calendar days a ticket stays valid from the day it was called in. */
  validDays: number;
  /** Days before expiry that it has to be updated to stay valid. */
  updateLeadDays: number;
  /** How many days ahead "expiring soon" starts warning. */
  warnDays: number;
}

export const DEFAULT_TERMS: LocateTerms = {
  validDays: 30,
  updateLeadDays: 3,
  warnDays: 5,
};

export type LocateStanding =
  /** Called in, but the wait before work may begin has not elapsed. */
  | "waiting"
  /** Good to work, comfortably inside the window. */
  | "active"
  /** Still valid, but close enough to expiry to need updating now. */
  | "due"
  /** Past its expiry. The marks cannot be relied on. */
  | "expired"
  /** No date on file, so the clock is unknown — which is not the same as fine. */
  | "unknown";

const DAY = 24 * 60 * 60 * 1000;

/** Parse a `YYYY-MM-DD` into a UTC date, or null. Dates here are calendar days,
 *  not moments — a ticket does not expire at a time of day. */
export function parseDay(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const toDay = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const d = parseDay(day);
  if (!d) return "";
  return toDay(new Date(d.getTime() + days * DAY));
}

/** Whole calendar days from `from` to `to`. Negative when `to` is past. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

export interface TicketDates {
  /** As given by 811 where known, else computed from the terms. */
  expiresOn: string;
  updateBy: string;
  /** True when these came off the ticket rather than out of this file. */
  stated: { expiry: boolean; update: boolean };
}

/**
 * The dates that govern a ticket.
 *
 * A stated date is never overwritten by a computed one. Where 811 has said
 * when a ticket expires, that is the answer even if it disagrees with the
 * standard window — tickets get extended, shortened and re-issued, and the
 * issuing authority is right by definition.
 */
export function ticketDates(
  ticket: { calledInOn: string; expiresOn?: string | null; updateBy?: string | null },
  terms: LocateTerms = DEFAULT_TERMS,
): TicketDates {
  const statedExpiry = (ticket.expiresOn ?? "").trim();
  const statedUpdate = (ticket.updateBy ?? "").trim();

  const expiresOn = statedExpiry || addDays(ticket.calledInOn, terms.validDays);
  const updateBy = statedUpdate || (expiresOn ? addDays(expiresOn, -terms.updateLeadDays) : "");

  return {
    expiresOn,
    updateBy,
    stated: { expiry: Boolean(statedExpiry), update: Boolean(statedUpdate) },
  };
}

export interface TicketStanding {
  standing: LocateStanding;
  /** Days until expiry. Negative once past. Null when there is no date. */
  daysToExpiry: number | null;
  daysToUpdate: number | null;
  expiresOn: string;
  updateBy: string;
  stated: { expiry: boolean; update: boolean };
}

/**
 * Where a ticket stands today.
 *
 * `today` is passed in rather than read from the clock so this is testable and
 * so a report can be run for any date without lying about the present.
 */
export function ticketStanding(
  ticket: {
    calledInOn: string;
    workToBeginOn?: string | null;
    expiresOn?: string | null;
    updateBy?: string | null;
  },
  today: string,
  terms: LocateTerms = DEFAULT_TERMS,
): TicketStanding {
  const dates = ticketDates(ticket, terms);
  const daysToExpiry = dates.expiresOn ? daysBetween(today, dates.expiresOn) : null;
  const daysToUpdate = dates.updateBy ? daysBetween(today, dates.updateBy) : null;

  const base = {
    daysToExpiry,
    daysToUpdate,
    expiresOn: dates.expiresOn,
    updateBy: dates.updateBy,
    stated: dates.stated,
  };

  // No date at all. Reported as unknown rather than assumed good — a ticket
  // nobody can date is exactly the one worth stopping for.
  if (daysToExpiry === null) return { ...base, standing: "unknown" };
  if (daysToExpiry < 0) return { ...base, standing: "expired" };

  const begin = (ticket.workToBeginOn ?? "").trim();
  if (begin) {
    const untilStart = daysBetween(today, begin);
    if (untilStart !== null && untilStart > 0) return { ...base, standing: "waiting" };
  }

  if (daysToExpiry <= terms.warnDays) return { ...base, standing: "due" };
  if (daysToUpdate !== null && daysToUpdate <= 0) return { ...base, standing: "due" };

  return { ...base, standing: "active" };
}

/** Plain words for a standing, for a chat answer or a chip. */
export const STANDING_LABEL: Record<LocateStanding, string> = {
  waiting: "Not yet in force",
  active: "In force",
  due: "Needs updating",
  expired: "Expired",
  unknown: "No date on file",
};

/**
 * Whether a crew may dig on this ticket today.
 *
 * Deliberately conservative and deliberately not a boolean on its own: the
 * reason travels with the answer, because "no" without a reason gets argued
 * with on site and "yes" without a reason gets trusted too far.
 */
export function canDig(standing: TicketStanding): { ok: boolean; because: string } {
  switch (standing.standing) {
    case "active":
      return { ok: true, because: `In force until ${standing.expiresOn}.` };
    case "due":
      return {
        ok: true,
        because: `In force until ${standing.expiresOn}, but it needs updating${
          standing.daysToExpiry !== null ? ` — ${standing.daysToExpiry} day(s) left` : ""
        }.`,
      };
    case "waiting":
      return { ok: false, because: "The wait before work may begin has not elapsed." };
    case "expired":
      return {
        ok: false,
        because: `Expired ${standing.expiresOn}. The marks on the ground are out of date.`,
      };
    case "unknown":
      return { ok: false, because: "No expiry on file, so the ticket cannot be shown to be in force." };
  }
}
