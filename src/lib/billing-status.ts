/**
 * The vocabulary of billing readiness, and the documentation rules behind it.
 *
 * Deliberately free of any database access, and deliberately not `server-only`.
 * The office screen and the crew screen both render these statuses, and a crew
 * on a phone should be told what a hold needs without a round trip to find out.
 *
 * Nothing here knows an amount, a rate or a customer's total. The money lives
 * behind the staff-gated accessor in data/queries.ts; what is in this file is
 * safe to ship to any signed-in browser.
 */

/**
 * Codes Fortitude will not invoice without tick-mark documentation.
 *
 * This is a FORTITUDE billing control, not a Kinetic construction requirement.
 * The QCC manual asks for plenty and does not ask for this; the rule exists
 * because a footage figure on a main line pull is measured off the cable, and
 * once the ground is closed the tick marks are the only way to check it.
 */
const FORTITUDE_TICK_MARK_CODES = new Set([
  "BF048I",
  "BF024I",
  "BFO72I",
  "BFO144I",
  "BFO12RI",
  "BFO24RI",
]);

export type BillingRequirement = {
  /** Stable key, so a hold can name the rule that raised it. */
  id: string;
  /** What the office and the crew both read. */
  label: string;
  /** Where the rule comes from. Never attributed to a customer that did not set it. */
  source: "FORTITUDE" | "CUSTOMER";
  /** The individual items a crew has to supply. */
  missing: string[];
};

/**
 * Which documentation rules apply to a code on a job.
 *
 * Takes the project so this can vary by customer later. It currently returns
 * Fortitude's own rules for every job, which is honest: they are ours, and we
 * apply them to our own work whoever the customer is. A customer-specific rule
 * would be added here keyed on the customer, and would never be inferred from
 * the market — two of these markets share a prime and bill differently, so a
 * rule guessed from a town is a rule applied to the wrong contract.
 */
export function requirementsFor(
  code: string,
  _project: { customerShortCode?: string | null } = {},
): BillingRequirement[] {
  const out: BillingRequirement[] = [];
  const normalised = code.trim().toUpperCase();

  if (FORTITUDE_TICK_MARK_CODES.has(normalised)) {
    out.push({
      id: "fortitude.tickmarks",
      label: "Tick-mark documentation",
      source: "FORTITUDE",
      missing: [
        "Tick-mark photograph with the count readable",
        "In and Out for the applicable section",
      ],
    });
  }

  return out;
}

/** Whether a code needs tick marks at all, for the interface to ask cheaply. */
export function needsTickMarks(code: string): boolean {
  return FORTITUDE_TICK_MARK_CODES.has(code.trim().toUpperCase());
}

/**
 * Where a quantity stands between being built and being invoiced.
 *
 * Seven states, and the distinctions between them are the point of the whole
 * feature. Work completed is not the same as documented; documented is not the
 * same as ready to bill; ready to bill is not the same as staged; and staged is
 * not the same as billed. Collapsing any pair of those is how production gets
 * invoiced twice or not at all.
 */
export type BillingStatus =
  | "NEEDS_DOCUMENTATION"
  | "CREW_RESPONDED"
  | "READY_TO_BILL"
  | "READY_OVERRIDE"
  | "STAGED"
  | "BILLED"
  | "NOT_BILLABLE";

/** What a status is called on screen. One vocabulary for both audiences. */
export const STATUS_LABEL: Record<BillingStatus, string> = {
  NEEDS_DOCUMENTATION: "Needs documentation",
  CREW_RESPONDED: "Crew responded",
  READY_TO_BILL: "Ready to bill",
  READY_OVERRIDE: "Ready to bill — admin override",
  STAGED: "Staged",
  BILLED: "Billed",
  NOT_BILLABLE: "Not customer billable",
};

/** The short form, for a chip sitting in a table cell. */
export const STATUS_SHORT: Record<BillingStatus, string> = {
  NEEDS_DOCUMENTATION: "Needs docs",
  CREW_RESPONDED: "Responded",
  READY_TO_BILL: "Ready",
  READY_OVERRIDE: "Override",
  STAGED: "Staged",
  BILLED: "Billed",
  NOT_BILLABLE: "Not billable",
};

export const STATUS_TONE: Record<BillingStatus, string> = {
  NEEDS_DOCUMENTATION: "bg-critical/15 text-critical ring-critical/25",
  CREW_RESPONDED: "bg-warning/15 text-warning ring-warning/25",
  READY_TO_BILL: "bg-success/15 text-success ring-success/25",
  READY_OVERRIDE: "bg-gold/15 text-gold ring-gold/25",
  STAGED: "bg-info/15 text-info ring-info/25",
  BILLED: "bg-brand/15 text-brand-bright ring-brand/25",
  NOT_BILLABLE: "bg-foreground/[0.08] text-muted-foreground ring-foreground/10",
};

/**
 * The order the office works in: what is stuck, then what is waiting on them,
 * then what they can send, then what is already gone.
 */
export const STATUS_ORDER: BillingStatus[] = [
  "NEEDS_DOCUMENTATION",
  "CREW_RESPONDED",
  "READY_TO_BILL",
  "READY_OVERRIDE",
  "STAGED",
  "BILLED",
  "NOT_BILLABLE",
];

/** One sentence saying what this status means for the bill. */
export const STATUS_MEANING: Record<BillingStatus, string> = {
  NEEDS_DOCUMENTATION:
    "The work is done and approved. It cannot go on an invoice until the documentation arrives.",
  CREW_RESPONDED: "The crew says they have sent it. Waiting on the office to look.",
  READY_TO_BILL: "Nothing is outstanding. This can go on the customer's next invoice.",
  READY_OVERRIDE:
    "Released for billing by an administrator without the documentation. The requirement is still on the record.",
  STAGED: "On a draft invoice that has not been sent yet.",
  BILLED: "On an invoice the customer has. Changing it needs a credit, not an edit.",
  NOT_BILLABLE: "Recorded as production, and never invoiced to the customer.",
};
