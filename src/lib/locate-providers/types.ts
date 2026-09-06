/**
 * One shape for every one-call centre.
 *
 * Georgia is the first, not the only. Alabama and South Carolina run the same
 * PelicanCorp software behind different front doors, and the Carolinas run
 * something else again — so the application above this layer is written against
 * this interface and never against Georgia. Adding AL811 should be a new file
 * in this folder and a row in the registry, not a search for "GA811" across the
 * codebase.
 */

/** What a lookup returned, or why it did not. */
export type LookupStatus =
  | "OK"
  /** The centre has no public, permitted machine route to this data. */
  | "LOOKUP_UNAVAILABLE"
  /** Configured, reachable, but this ticket is not there. */
  | "NOT_FOUND"
  /** Reached it and could not read it — the shape changed, most likely. */
  | "PARSE_FAILED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "AUTH_REQUIRED"
  | "ERROR";

/** A member's answer, exactly as stated plus how we read it. */
export interface ProviderResponse {
  member: string;
  code: string;
  facilityType: string;
  /** The centre's own code — "MK", "CLR", "03". */
  responseCode: string;
  /** The centre's own wording. */
  responseDescription: string;
  /** Our reading of it. Never overwrites the two fields above. */
  status: "MARKED" | "CLEAR" | "NOT_COMPLETE" | "DELAYED" | "UNKNOWN";
  respondedOn: string;
  note: string;
  /** Verbatim line, kept so a misreading can be proved against what arrived. */
  raw: string;
}

/** A ticket as the centre states it. Dates are YYYY-MM-DD calendar days. */
export interface ProviderTicket {
  number: string;
  revision: string;
  ticketType: string;
  street: string;
  crossStreet: string;
  city: string;
  county: string;
  state: string;
  lat: number | null;
  lng: number | null;
  workType: string;
  workAreaDescription: string;
  locateInstructions: string;
  excavatorName: string;
  contactName: string;
  contactPhone: string;
  calledInOn: string;
  workToBeginOn: string;
  responseBy: string;
  updateableOn: string;
  updateBy: string;
  expiresOn: string;
  notes: string;
  responses: ProviderResponse[];
}

export interface LookupResult {
  status: LookupStatus;
  ticket: ProviderTicket | null;
  /** Shown to a person when status is not OK. Plain words, no stack traces. */
  message: string;
  /** The page or payload we read, kept for the check history. */
  raw: string;
  httpStatus: number | null;
  sourceUrl: string;
  durationMs: number;
}

export interface LocateProvider {
  /** Stable key stored on the ticket: GA811, AL811, SC811. */
  id: string;
  /** For a person: "Georgia 811". */
  name: string;
  state: string;

  /**
   * Whether automated retrieval is configured and permitted right now.
   *
   * False is a normal, expected state — not an error. It means every ticket
   * arrives by paste or by email, which is a supported way to run this module.
   */
  ready(): boolean;

  /** Why it is not ready, for the admin who has to fix it. */
  readyDetail(): string;

  /** Is this even the right shape for a ticket number at this centre? */
  validateNumber(input: string): { ok: boolean; number: string; revision: string; error?: string };

  /** The page a person can open to see this ticket themselves. */
  ticketUrl(number: string): string;

  /**
   * Fetch one ticket.
   *
   * Must never throw and must never invent. A provider that cannot retrieve
   * returns LOOKUP_UNAVAILABLE with a null ticket, and the caller leaves the
   * stored ticket exactly as it found it.
   */
  lookupTicket(number: string, revision: string): Promise<LookupResult>;

  /** Read a ticket out of text a person pasted. Always available. */
  parseText(text: string): Promise<ProviderTicket[]>;
}
