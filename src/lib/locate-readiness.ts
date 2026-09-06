/**
 * Whether a crew may dig, and what is stopping them.
 *
 * Two questions, deliberately kept apart:
 *
 *   1. Has 811 finished?      — every utility we are waiting on has answered.
 *   2. Is the ground safe?    — plus every locate we perform ourselves is walked.
 *
 * Collapsing those into one flag is the bug this module exists to prevent. On
 * the Windstream builds Fortitude locates Windstream's own plant, so 811 can be
 * completely finished while the one locate that actually matters has not been
 * walked by anybody. A single "ready" would say yes to that, and a crew would
 * put a plow through live fibre.
 *
 * Everything here is a pure function over data the caller already fetched. No
 * database, no clock, no network: `today` is passed in so a morning briefing
 * can be run for any date without lying about the present, and so the seven
 * scenarios in the spec can be asserted directly.
 */

import { ticketStanding, type TicketStanding } from "@/lib/locates";

export type PerformedBy = "MEMBER" | "CONTRACTOR" | "THIRD_PARTY";

export type ExternalReadiness =
  | "WAITING_ON_811"
  | "READY"
  | "NOT_EFFECTIVE_YET"
  | "NEEDS_REVIEW"
  | "LOOKUP_ERROR"
  | "EXPIRED"
  | "UNKNOWN";

export type FieldReadiness =
  | "NOT_READY"
  | "CONTRACTOR_LOCATE_REQUIRED"
  | "CONTRACTOR_LOCATE_IN_PROGRESS"
  | "CONTRACTOR_LOCATE_ISSUE"
  | "FIELD_READY"
  | "EXPIRED"
  | "UNKNOWN";

export type Lifecycle =
  | "NEW"
  | "ACTIVE"
  | "UPDATED"
  | "EXPIRING"
  | "EXPIRED"
  | "CANCELLED"
  | "COMPLETED";

export type ContractorLocateStatus =
  | "NOT_REQUIRED"
  | "REQUIRED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "VERIFIED"
  | "ISSUE_FOUND"
  | "UNABLE_TO_LOCATE"
  | "REQUIRES_ESCALATION";

/**
 * Responses that mean a member is finished with this ticket.
 *
 * "Marked" and "clear" are the two the centres actually send. Anything else —
 * including anything we failed to recognise — is treated as outstanding. An
 * unknown code must never read as safe: the cost of waiting a morning is a
 * morning, and the cost of the other mistake is a cut line.
 */
const SETTLED: readonly string[] = ["MARKED", "CLEAR", "NO_CONFLICT", "NO_FACILITIES", "COMPLETE"];

export function isSettledResponse(status: string): boolean {
  return SETTLED.includes(String(status ?? "").toUpperCase().trim());
}

export interface LocateRule {
  utilityName: string;
  utilityCode?: string | null;
  performedBy: PerformedBy;
  blocks811Readiness: boolean;
  blocksFieldReadiness: boolean;
}

export interface ResponseInput {
  member: string;
  code?: string | null;
  status: string;
}

export interface ContractorLocateInput {
  utilityName: string;
  status: ContractorLocateStatus;
}

/**
 * Which rule governs a member, if any.
 *
 * 811 names members the long way — "WINDSTREAM COMMUNICATIONS - WIN01" — and a
 * rule is written the short way, because that is what a person types. Matching
 * is therefore containment in either direction on a squashed comparison, plus
 * an exact match on the member code when both carry one.
 *
 * Deliberately not a regex over user input: a rule reading "AT&T" must not
 * become a pattern.
 */
export function ruleFor(member: string, code: string | null | undefined, rules: LocateRule[]) {
  const squash = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = squash(member);
  const c = squash(code ?? "");

  return (
    rules.find((r) => {
      const rn = squash(r.utilityName);
      const rc = squash(r.utilityCode ?? "");
      if (rc && c && rc === c) return true;
      if (!rn) return false;
      return m.includes(rn) || rn.includes(m);
    }) ?? null
  );
}

export interface ReadinessInput {
  ticket: {
    calledInOn: string;
    workToBeginOn?: string | null;
    expiresOn?: string | null;
    updateBy?: string | null;
    ticketType?: string | null;
    closedOn?: string | null;
  };
  responses: ResponseInput[];
  rules: LocateRule[];
  contractorLocates: ContractorLocateInput[];
  /** Set when the most recent lookup failed. A stale answer must not read as fresh. */
  lookupFailed?: boolean;
  /** YYYY-MM-DD in the project's own timezone. */
  today: string;
}

export interface Readiness {
  external: ExternalReadiness;
  field: FieldReadiness;
  lifecycle: Lifecycle;
  standing: TicketStanding;
  /** One sentence naming what is stopping work, in a foreman's words. */
  blockingReason: string;
  /** Members we are still waiting on, by name. */
  waitingOn: string[];
  /** Utilities we locate ourselves that are not verified yet. */
  contractorOutstanding: string[];
  /** Members that answered acceptably, over members we need an answer from. */
  externalCleared: number;
  externalRequired: number;
  /**
   * True when nobody stated an expiry and we worked one out from the call-in
   * date and the state's validity period.
   *
   * Deriving it is right — a Georgia ticket is good for a known number of days
   * and refusing to date it would strand most of the board. But a derived date
   * is our arithmetic, not the centre's word, and a crew standing on the last
   * day of one should be told which it is. The board marks these "est".
   */
  expiryEstimated: boolean;
}

function lifecycleFrom(standing: TicketStanding, closed: boolean): Lifecycle {
  if (closed) return "COMPLETED";
  switch (standing.standing) {
    case "cancelled":
      return "CANCELLED";
    case "expired":
      return "EXPIRED";
    case "due":
      return "EXPIRING";
    case "waiting":
    case "active":
      return "ACTIVE";
    default:
      return "NEW";
  }
}

/**
 * The whole decision, in one pass.
 *
 * Order matters and is not arbitrary. Lookup failure and cancellation come
 * first because they invalidate everything under them; expiry comes before the
 * response tally because a ticket whose marks are three weeks old is not made
 * safe by the fact that everybody once answered.
 */
export function readiness(input: ReadinessInput): Readiness {
  const { ticket, responses, rules, contractorLocates, today } = input;
  const standing = ticketStanding(ticket, today);
  const closed = Boolean((ticket.closedOn ?? "").trim());
  const lifecycle = lifecycleFrom(standing, closed);

  // Which utilities are ours to walk, and which are still outstanding.
  const contractorNames = rules
    .filter((r) => r.performedBy !== "MEMBER")
    .map((r) => r.utilityName);
  const byUtility = new Map(
    contractorLocates.map((c) => [c.utilityName.toUpperCase().trim(), c.status] as const),
  );
  const contractorOutstanding = contractorNames.filter((n) => {
    const st = byUtility.get(n.toUpperCase().trim());
    return st !== "VERIFIED" && st !== "NOT_REQUIRED";
  });
  const contractorIssue = contractorNames.filter((n) => {
    const st = byUtility.get(n.toUpperCase().trim());
    return st === "ISSUE_FOUND" || st === "UNABLE_TO_LOCATE" || st === "REQUIRES_ESCALATION";
  });
  const contractorRunning = contractorNames.filter((n) => {
    const st = byUtility.get(n.toUpperCase().trim());
    return st === "IN_PROGRESS" || st === "ASSIGNED";
  });

  // Members we actually need an answer from. A utility somebody else locates is
  // not a member we are waiting on — no response is ever coming, and counting
  // it as outstanding would leave the ticket permanently amber.
  const external = responses.filter((r) => {
    const rule = ruleFor(r.member, r.code, rules);
    if (!rule) return true;
    if (rule.performedBy !== "MEMBER") return rule.blocks811Readiness;
    return rule.blocks811Readiness || true;
  });
  const settled = external.filter((r) => isSettledResponse(r.status));
  const waitingOn = external.filter((r) => !isSettledResponse(r.status)).map((r) => r.member);

  const base = {
    standing,
    lifecycle,
    expiryEstimated: Boolean(standing.expiresOn) && !standing.stated.expiry,
    waitingOn,
    contractorOutstanding,
    externalCleared: settled.length,
    externalRequired: external.length,
  };

  // A failed lookup leaves us with a stale answer and no way to know whether it
  // still holds. It is never a reason to promote a ticket.
  if (input.lookupFailed) {
    return {
      ...base,
      external: "LOOKUP_ERROR",
      field: "NOT_READY",
      blockingReason:
        "The last check of this ticket failed, so what is on screen may be out of date. Verify before digging.",
    };
  }

  if (standing.standing === "cancelled") {
    return {
      ...base,
      external: "NEEDS_REVIEW",
      field: "NOT_READY",
      blockingReason: "This ticket was cancelled. It withdraws a locate rather than granting one.",
    };
  }

  // Expiry beats everything below it. Marks on the ground go stale whatever the
  // paperwork once said.
  if (standing.standing === "expired") {
    return {
      ...base,
      external: "EXPIRED",
      field: "EXPIRED",
      blockingReason: `Expired ${standing.expiresOn}. The marks on the ground are out of date — file an update before anybody digs.`,
    };
  }

  if (standing.standing === "unknown") {
    return {
      ...base,
      external: "NEEDS_REVIEW",
      field: "NOT_READY",
      blockingReason:
        "No expiry date on file, so there is no way to say whether this ticket is in force. Enter the dates from the ticket.",
    };
  }

  // Nobody has said anything. Not the same as everybody clearing it, and it is
  // the state a freshly entered ticket number sits in.
  if (external.length === 0) {
    return {
      ...base,
      external: "WAITING_ON_811",
      field: "NOT_READY",
      blockingReason:
        "No utility responses recorded, so nothing has cleared this ticket. Nobody may dig on it yet.",
    };
  }

  if (waitingOn.length > 0) {
    const who = waitingOn.join(", ");
    return {
      ...base,
      external: "WAITING_ON_811",
      field: "NOT_READY",
      blockingReason:
        waitingOn.length === 1
          ? `${who} has not given an acceptable response.`
          : `${waitingOn.length} utilities have not responded: ${who}.`,
    };
  }

  // 811 is finished. Everything from here is about our own locates.
  if (standing.standing === "waiting") {
    return {
      ...base,
      external: "NOT_EFFECTIVE_YET",
      field: "NOT_READY",
      blockingReason: "All utilities have responded, but the ticket is not in force yet.",
    };
  }

  const cleared = `All ${external.length} outside ${
    external.length === 1 ? "utility has" : "utilities have"
  } cleared or marked.`;

  if (contractorIssue.length > 0) {
    return {
      ...base,
      external: "READY",
      field: "CONTRACTOR_LOCATE_ISSUE",
      blockingReason: `${cleared} Our own locate of ${contractorIssue.join(
        ", ",
      )} could not be completed — it needs sorting out before anybody digs.`,
    };
  }

  if (contractorRunning.length > 0) {
    return {
      ...base,
      external: "READY",
      field: "CONTRACTOR_LOCATE_IN_PROGRESS",
      blockingReason: `${cleared} Our own locate of ${contractorRunning.join(", ")} is under way.`,
    };
  }

  if (contractorOutstanding.length > 0) {
    return {
      ...base,
      external: "READY",
      field: "CONTRACTOR_LOCATE_REQUIRED",
      blockingReason: `${cleared} ${contractorOutstanding.join(
        ", ",
      )} is ours to locate and has not been walked yet — it must be done and signed off before excavation.`,
    };
  }

  return {
    ...base,
    external: "READY",
    field: "FIELD_READY",
    blockingReason: contractorNames.length
      ? `${cleared} Our own locate of ${contractorNames.join(", ")} is verified.`
      : cleared,
  };
}

/** How close to the edge, for colouring a date. */
export type ExpiryUrgency = "none" | "soon" | "warning" | "critical" | "expired";

export function expiryUrgency(daysToExpiry: number | null): ExpiryUrgency {
  if (daysToExpiry === null) return "none";
  if (daysToExpiry < 0) return "expired";
  if (daysToExpiry < 1) return "critical";
  if (daysToExpiry <= 3) return "warning";
  if (daysToExpiry <= 7) return "soon";
  return "none";
}

export const EXTERNAL_LABEL: Record<ExternalReadiness, string> = {
  WAITING_ON_811: "Waiting on utilities",
  READY: "811 ready",
  NOT_EFFECTIVE_YET: "Not in force yet",
  NEEDS_REVIEW: "Needs review",
  LOOKUP_ERROR: "Needs verification",
  EXPIRED: "Expired",
  UNKNOWN: "Unknown",
};

export const FIELD_LABEL: Record<FieldReadiness, string> = {
  NOT_READY: "Not field ready",
  CONTRACTOR_LOCATE_REQUIRED: "Our locate required",
  CONTRACTOR_LOCATE_IN_PROGRESS: "Our locate under way",
  CONTRACTOR_LOCATE_ISSUE: "Locate issue",
  FIELD_READY: "Field ready",
  EXPIRED: "Expired",
  UNKNOWN: "Unknown",
};

/** Which of the palette's meanings a status carries. */
export function externalTone(s: ExternalReadiness): "success" | "warning" | "critical" | "muted" {
  if (s === "READY") return "success";
  if (s === "EXPIRED" || s === "LOOKUP_ERROR") return "critical";
  if (s === "WAITING_ON_811" || s === "NEEDS_REVIEW" || s === "NOT_EFFECTIVE_YET") return "warning";
  return "muted";
}

export function fieldTone(s: FieldReadiness): "success" | "warning" | "critical" | "muted" {
  if (s === "FIELD_READY") return "success";
  if (s === "EXPIRED" || s === "CONTRACTOR_LOCATE_ISSUE") return "critical";
  if (
    s === "CONTRACTOR_LOCATE_REQUIRED" ||
    s === "CONTRACTOR_LOCATE_IN_PROGRESS" ||
    s === "NOT_READY"
  )
    return "warning";
  return "muted";
}
