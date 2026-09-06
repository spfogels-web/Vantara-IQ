/**
 * Georgia 811.
 *
 * The only file in the codebase that knows anything about Georgia specifically.
 *
 * ── On automated retrieval ────────────────────────────────────────────────
 *
 * Georgia 811 publishes no developer API. Their own "Locate Request Management
 * Options" page is a directory of third-party vendors — BOSS811, KorTerra,
 * DigTrack — who hold licensed ticket feeds. There is no documented endpoint
 * for an excavator to query their own tickets.
 *
 * The ticket portal at geocall.ga811.com is PelicanCorp GeoCall. The page shell
 * loads for anyone, which is why the URL appears to work when you paste it. The
 * data behind it does not:
 *
 *     GET /geocall/api/core/status
 *     → 403 Forbidden   {"message": "NoAuthHeader : No auth"}
 *
 * The shell is a container; the ticket is fetched into it by authenticated
 * calls the browser makes with a session it obtained at login. Retrieving that
 * from a server means holding a user's credentials and impersonating them,
 * which is circumventing an access control, so this adapter does not do it and
 * `ready()` returns false until a sanctioned route is configured.
 *
 * Two sanctioned routes exist and both are drop-ins here:
 *
 *   1. A direct feed from Georgia 811 for Fortitude's own excavator account.
 *      Set GA811_API_URL and GA811_API_KEY and fill in `lookupTicket`.
 *   2. A vendor with a licensed feed and an API. Same two variables, different
 *      host, same parsing contract.
 *
 * Until one of those exists, tickets arrive by paste and by email, which is a
 * supported way to run this module rather than a degraded one. Nothing else in
 * the codebase changes when that day comes.
 */

import { parseLocateText } from "@/lib/locate-chat";
import type { LocateProvider, LookupResult, ProviderResponse, ProviderTicket } from "./types";

const PORTAL = "https://geocall.ga811.com/geocall/portal";

/**
 * Georgia numbers are yymmdd-nnnnnn, sometimes with a revision suffix.
 *
 * Validated rather than trusted: matching bare digits once split 260809-001634
 * at the hyphen and filed a ticket that does not exist.
 */
const NUMBER = /^(\d{6}-\d{4,6})(?:-(\d{1,3}))?$/;

function apiConfigured(): boolean {
  return Boolean(process.env.GA811_API_URL && process.env.GA811_API_KEY);
}

export const ga811: LocateProvider = {
  id: "GA811",
  name: "Georgia 811",
  state: "GA",

  ready() {
    return apiConfigured();
  },

  readyDetail() {
    if (apiConfigured()) return "A Georgia 811 feed is configured.";
    return (
      "Georgia 811 publishes no public API, and their ticket portal requires a " +
      "login this system deliberately does not hold. Tickets are entered by " +
      "pasting the ticket or the response screen. To switch on automatic " +
      "lookups, obtain a feed from Georgia 811 for your excavator account or " +
      "from a licensed vendor, then set GA811_API_URL and GA811_API_KEY."
    );
  },

  validateNumber(input: string) {
    const raw = String(input ?? "").trim().toUpperCase();
    if (!raw) return { ok: false, number: "", revision: "", error: "Enter a ticket number." };
    const m = NUMBER.exec(raw);
    if (!m) {
      return {
        ok: false,
        number: raw,
        revision: "",
        error: `"${raw}" is not a Georgia 811 ticket number. They read like 260904-001234.`,
      };
    }
    return { ok: true, number: m[1], revision: m[2] ?? "" };
  },

  ticketUrl(number: string) {
    return `${PORTAL}?ticket=${encodeURIComponent(number)}`;
  },

  async lookupTicket(number: string, revision: string): Promise<LookupResult> {
    const started = Date.now();
    const sourceUrl = this.ticketUrl(revision ? `${number}-${revision}` : number);

    if (!apiConfigured()) {
      return {
        status: "LOOKUP_UNAVAILABLE",
        ticket: null,
        message: this.readyDetail(),
        raw: "",
        httpStatus: null,
        sourceUrl,
        durationMs: Date.now() - started,
      };
    }

    // A feed exists. Ask it, and fail loudly rather than quietly: a lookup that
    // half-worked must not be allowed to look like a ticket with no responses,
    // because a ticket with no responses is a ticket nobody may dig on and this
    // one might have been clear all along.
    try {
      const res = await fetch(
        `${process.env.GA811_API_URL}/tickets/${encodeURIComponent(number)}${
          revision ? `?revision=${encodeURIComponent(revision)}` : ""
        }`,
        {
          headers: {
            Authorization: `Bearer ${process.env.GA811_API_KEY}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(20_000),
        },
      );

      const body = await res.text();
      if (res.status === 404) {
        return {
          status: "NOT_FOUND",
          ticket: null,
          message: `Georgia 811 has no ticket ${number}.`,
          raw: body.slice(0, 20_000),
          httpStatus: res.status,
          sourceUrl,
          durationMs: Date.now() - started,
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          status: "AUTH_REQUIRED",
          ticket: null,
          message: "Georgia 811 refused the credentials. Check GA811_API_KEY.",
          raw: body.slice(0, 20_000),
          httpStatus: res.status,
          sourceUrl,
          durationMs: Date.now() - started,
        };
      }
      if (res.status === 429) {
        return {
          status: "RATE_LIMITED",
          ticket: null,
          message: "Georgia 811 is rate limiting us. The next scheduled check will try again.",
          raw: body.slice(0, 20_000),
          httpStatus: res.status,
          sourceUrl,
          durationMs: Date.now() - started,
        };
      }
      if (!res.ok) {
        return {
          status: "ERROR",
          ticket: null,
          message: `Georgia 811 returned ${res.status}.`,
          raw: body.slice(0, 20_000),
          httpStatus: res.status,
          sourceUrl,
          durationMs: Date.now() - started,
        };
      }

      // The feed's own shape is unknown until somebody has one in their hands.
      // Reading it with the same parser used for pasted text is deliberate: it
      // is already conservative about dates and response codes, and it means a
      // feed that arrives as text, XML or JSON all land in the same place.
      const tickets = await parseTickets(body);
      if (tickets.length === 0) {
        return {
          status: "PARSE_FAILED",
          ticket: null,
          message:
            "Georgia 811 answered, but nothing in the reply could be read as a ticket. " +
            "The feed's format has probably changed.",
          raw: body.slice(0, 20_000),
          httpStatus: res.status,
          sourceUrl,
          durationMs: Date.now() - started,
        };
      }

      return {
        status: "OK",
        ticket: tickets[0],
        message: "",
        raw: body.slice(0, 20_000),
        httpStatus: res.status,
        sourceUrl,
        durationMs: Date.now() - started,
      };
    } catch (e) {
      const timedOut = e instanceof Error && /timeout|abort/i.test(e.message);
      return {
        status: timedOut ? "TIMEOUT" : "ERROR",
        ticket: null,
        message: timedOut
          ? "Georgia 811 did not answer in time."
          : e instanceof Error
            ? e.message
            : "The lookup failed.",
        raw: "",
        httpStatus: null,
        sourceUrl,
        durationMs: Date.now() - started,
      };
    }
  },

  async parseText(text: string) {
    return parseTickets(text);
  },
};

/** The shared reader: pasted ticket, pasted response screen, or a feed body. */
async function parseTickets(text: string): Promise<ProviderTicket[]> {
  const parsed = await parseLocateText(text);
  return parsed.map((t) => ({
    number: t.number,
    revision: t.revision,
    ticketType: t.ticketType,
    street: t.street,
    crossStreet: t.crossStreet,
    city: t.city,
    county: t.county,
    state: "GA",
    lat: t.lat,
    lng: t.lng,
    workType: t.workType,
    workAreaDescription: "",
    locateInstructions: t.locateInstructions,
    excavatorName: "",
    contactName: "",
    contactPhone: "",
    calledInOn: t.calledInOn,
    workToBeginOn: t.workToBeginOn,
    responseBy: t.responseBy,
    updateableOn: t.updateableOn,
    updateBy: t.updateBy,
    expiresOn: t.expiresOn,
    notes: t.notes,
    responses: t.members.map((m) => ({
      member: m.member,
      code: m.code,
      facilityType: m.facilityType,
      responseCode: "",
      responseDescription: "",
      status: m.status as ProviderResponse["status"],
      respondedOn: m.respondedOn,
      note: m.note,
      raw: "",
    })),
  }));
}
