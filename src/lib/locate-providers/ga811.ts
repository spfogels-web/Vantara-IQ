/**
 * Georgia 811.
 *
 * The only file in the codebase that knows anything about Georgia
 * specifically. Everything above it asks for a ticket and gets one back, so
 * the question of HOW we retrieve is settled here and nowhere else.
 *
 * ── What we established, and when ─────────────────────────────────────────
 *
 * Researched 7 September 2026. Recorded here rather than in a chat log
 * because the next person to pick this up will be reading this file.
 *
 * 1. There is no public developer API. Georgia 811's own "Locate Request
 *    Management Options" page is a directory of third-party vendors —
 *    BOSS811, KorTerra, DigTrack — who hold licensed feeds.
 *
 * 2. The ticket portal at geocall.ga811.com is PelicanCorp GeoCall. The page
 *    shell loads for anyone, which is why pasting a ticket URL appears to
 *    work. The data behind it does not:
 *
 *        GET /geocall/api/core/status  →  403  "NoAuthHeader : No auth"
 *
 *    Probed /geocall/pris, /geocall/portal/pris, /geocall/api/ticket,
 *    /geocall/api/positiveresponse and /geocall/api/ui/ticketsearch: all 404.
 *    No unauthenticated positive-response endpoint is discoverable from the
 *    portal.
 *
 * 3. Georgia 811 does advertise a no-login positive-response lookup — but in
 *    their MOBILE APP, not on the web. Whatever that app calls is
 *    undocumented and presumably carries an app credential. It may well be a
 *    clean endpoint. It is not a published contract, and this module decides
 *    whether a crew puts a plow in the ground, so it is not something to
 *    build on until Georgia 811 says in writing that we may.
 *
 * 4. The "Ticket Automation (BOT) Policy" is NOT about retrieval. Read in
 *    full: its stated purpose is "ticket automation system" for "locate
 *    tickets submission"; its scope requires Online Ticket CREATION training
 *    and 20–30 test tickets a day for three days; its rate limit is "one
 *    ticket every ten seconds"; its quality criteria are entirely creation
 *    fields. It governs automated ticket ENTRY through an authenticated web
 *    account and says nothing about reading responses.
 *
 *    That is worth being careful about in both directions. It does not
 *    prohibit automated positive-response reads. It does not permit them
 *    either — the policy simply does not reach them, and a gap in a policy is
 *    not consent. Ask webhelpdesk@Georgia811.com before switching retrieval
 *    on, and keep their answer.
 *
 * ── The four routes, all of which land here ───────────────────────────────
 *
 * The point of an adapter rather than an API client is that the rest of
 * Vantara never learns which of these we ended up using:
 *
 *   FEED      A direct feed from Georgia 811 for our own excavator account,
 *             or a licensed vendor's API. Set GA811_API_URL and
 *             GA811_API_KEY and `lookupTicket` below already does the rest.
 *   STRUCTURED  A public PRIS request, if one is found and permitted. Same
 *             function, different URL and no key.
 *   BROWSER   Driving the portal on a schedule. Only with written permission,
 *             and only ever for our own tickets.
 *   PASTE     What runs today. A person pastes the ticket or the response
 *             screen and the same parser reads it.
 *
 * Paste is a supported way to run this module, not a degraded one. The
 * readiness engine cannot tell where a response came from, and that is
 * deliberate.
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
      "Georgia 811 publishes no developer API, and no unauthenticated " +
      "positive-response endpoint is reachable from their web portal — the " +
      "no-login lookup they advertise is in their mobile app. Tickets are " +
      "entered by pasting the ticket or the response screen, which is a " +
      "supported way to run this rather than a degraded one. To switch " +
      "automatic retrieval on, get written permission from " +
      "webhelpdesk@Georgia811.com — their BOT policy covers ticket creation, " +
      "not retrieval, so it neither allows nor forbids this — then set " +
      "GA811_API_URL and GA811_API_KEY."
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
