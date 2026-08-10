import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { LocateTicketRow } from "@/data/queries";

/**
 * Answering questions about locates.
 *
 * The model is given the ticket board as data and asked to read it. It is not
 * given the internet, and it is not asked to work out whether digging is safe —
 * that judgement is already made in src/lib/locates.ts, against dates, and
 * arrives here as a decided answer per ticket. The model's job is to find the
 * relevant tickets and say what the record says about them.
 *
 * That split matters. A language model asked "is Thompson Rd clear" will
 * produce a confident sentence either way; what makes the sentence safe is that
 * the word "clear" can only come from a response somebody recorded, and the
 * word "expired" can only come from arithmetic on a date. The model chooses
 * which rows to talk about. It does not decide what is true about them.
 */

const SYSTEM = `You answer questions about underground utility locate tickets for
Fortitude Infrastructure, a contractor in Georgia.

You are given the current ticket board as JSON. Answer only from it.

Rules you must not break:

1. Never say a street, ticket or area is clear unless the record says so. A
   utility that has not responded is NOT a clearance. If members are still
   awaiting response, say which ones.
2. Never say work can proceed unless the ticket's "dig" field says ok. If it
   says ok is false, say so and give the reason from that field.
3. Every claim about status carries its date: when it expires, when it was
   responded to, when it was called in. A locate answer without a date is
   useless.
4. If a ticket has no expiry on file, say that plainly. Do not assume a
   standard window and do not treat it as valid.
5. If the board does not contain what was asked about, say you have no ticket
   for it. Do not guess, and do not reason about what is probably true.
6. Be brief and concrete. Lead with the answer, then the tickets it rests on,
   with numbers and streets.

You may summarise, count, group by street, sort by expiry, and point out what
needs updating soonest. You may not infer safety.`;

export function locateChatReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Trimmed to what a question could need — the board, not the database. */
function forModel(tickets: LocateTicketRow[]) {
  return tickets.map((t) => ({
    number: t.number + (t.revision ? `-${t.revision}` : ""),
    project: t.projectName || null,
    street: t.street || null,
    crossStreet: t.crossStreet || null,
    city: t.city || null,
    county: t.county || null,
    workType: t.workType || null,
    calledInOn: t.calledInOn || null,
    workToBeginOn: t.workToBeginOn || null,
    updateBy: t.updateBy || null,
    expiresOn: t.expiresOn || null,
    expiryIsStated: t.datesStated,
    daysToExpiry: t.daysToExpiry,
    standing: t.standingLabel,
    dig: t.dig,
    closed: t.closedOn || null,
    responses: t.responses.map((r) => ({
      member: r.member,
      status: r.status,
      respondedOn: r.respondedOn || null,
      note: r.note || null,
    })),
    awaitingResponseFrom: t.awaiting,
  }));
}

export async function askAboutLocates(
  question: string,
  tickets: LocateTicketRow[],
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<string> {
  if (!locateChatReady()) {
    throw new Error("ANTHROPIC_API_KEY is not set, so the assistant cannot answer.");
  }

  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);

  const message = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    messages: [
      ...history.slice(-8),
      {
        role: "user",
        content:
          `Today is ${today}.\n\n` +
          `Ticket board (${tickets.length} tickets):\n` +
          `${JSON.stringify(forModel(tickets), null, 1)}\n\n` +
          `Question: ${question}`,
      },
    ],
  });

  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/* ---- Reading a ticket ----------------------------------------------------- */

export interface ParsedTicket {
  number: string;
  revision: string;
  ticketType: string;
  lat: number | null;
  lng: number | null;
  responseBy: string;
  updateableOn: string;
  locateInstructions: string;
  street: string;
  crossStreet: string;
  city: string;
  county: string;
  workType: string;
  calledInOn: string;
  workToBeginOn: string;
  updateBy: string;
  expiresOn: string;
  notes: string;
  members: {
    member: string;
    code: string;
    facilityType: string;
    status: string;
    respondedOn: string;
    note: string;
  }[];
}

const PARSE_SYSTEM = `You read Georgia 811 locate tickets and turn them into structured
data. The text you are given is pasted from an email or the 811 portal, and may
contain several tickets at once.

Rules:

1. Copy values. Do not calculate, infer or tidy. If the ticket does not state a
   field, return an empty string for it. An empty field is correct and useful;
   a guessed one is dangerous, because these dates decide whether a crew is
   allowed to break ground.
2. Never compute an expiry from a start date. Only return an expiry the text
   actually states.
3. Dates as YYYY-MM-DD. If a date is ambiguous, return an empty string rather
   than choosing an interpretation.
4. Utility responses: return one entry per member the ticket lists, with the
   status it states. Map to MARKED, CLEAR, NOT_COMPLETE, DELAYED, or UNKNOWN.
   A member listed with no response yet is UNKNOWN.
5. Put anything that matters but does not fit a field — dig site remarks,
   instructions, restrictions — into notes, verbatim.
6. Return the ticket type exactly as stated: NORMAL, CANCEL, UPDATE, EMERGENCY,
   RETRANSMIT, or whatever word the ticket uses. A cancel ticket withdraws a
   previous locate and must be reported as such.

Georgia 811 tickets carry a Dates block. Map it exactly:

   Date/Time      -> calledInOn      (the header date the ticket was raised)
   Effective On   -> workToBeginOn
   Response By    -> responseBy
   Updateable On  -> updateableOn
   Update By      -> updateBy
   Expires On     -> expiresOn

Other wordings mean the same things: Call Date, Transmit Date, Legal Start,
Work to Begin, Restake By, Good Thru, Expiration Date. Dates arrive as
MM/DD/YYYY and often carry a time — convert to YYYY-MM-DD and drop the time.

Also read, when present:

   Sequence Number -> revision
   Latitude, Longitude -> lat, lng as decimal numbers
   Locate Instructions -> locateInstructions, verbatim
   Remarks, Comments -> notes, verbatim

The Members block lists who was notified, with a code, a name and a facility
type. Return every one of them. On a freshly issued ticket none of them have
answered yet, so their status is UNKNOWN — that is correct and important, not
a gap to fill. Only report MARKED or CLEAR where a response is actually
stated.`;

const TICKET_TOOL: Anthropic.Tool = {
  name: "record_tickets",
  description: "Record every locate ticket found in the text.",
  input_schema: {
    type: "object",
    properties: {
      tickets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "string", description: "The 811 ticket number" },
            revision: { type: "string", description: "Sequence Number, if stated" },
            lat: { type: "number", description: "Latitude as a decimal, if stated" },
            lng: { type: "number", description: "Longitude as a decimal, if stated" },
            responseBy: { type: "string", description: "YYYY-MM-DD or empty" },
            updateableOn: { type: "string", description: "YYYY-MM-DD or empty" },
            locateInstructions: { type: "string" },
            ticketType: {
              type: "string",
              description: "NORMAL, CANCEL, UPDATE, EMERGENCY, RETRANSMIT — as stated",
            },
            street: { type: "string" },
            crossStreet: { type: "string" },
            city: { type: "string" },
            county: { type: "string" },
            workType: { type: "string" },
            calledInOn: { type: "string", description: "YYYY-MM-DD or empty" },
            workToBeginOn: { type: "string", description: "YYYY-MM-DD or empty" },
            updateBy: { type: "string", description: "YYYY-MM-DD or empty" },
            expiresOn: { type: "string", description: "YYYY-MM-DD or empty" },
            notes: { type: "string" },
            members: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  member: { type: "string", description: "The member name as printed" },
                  code: { type: "string", description: "The 811 member code" },
                  facilityType: { type: "string", description: "Gas, Electric, Water, Telecommunication" },
                  status: {
                    type: "string",
                    enum: ["MARKED", "CLEAR", "NOT_COMPLETE", "DELAYED", "UNKNOWN"],
                  },
                  respondedOn: { type: "string" },
                  note: { type: "string" },
                },
                required: ["member", "status"],
              },
            },
          },
          required: ["number"],
        },
      },
    },
    required: ["tickets"],
  },
};

const asDay = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : "";
const asText = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A coordinate only counts if it is a real number in range. A ticket with a
 *  garbled latitude should hold none rather than a point in the sea. */
const asCoord = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) && Math.abs(n) <= 180 && n !== 0 ? n : null;
};

/**
 * Read one or more tickets out of pasted text.
 *
 * Every value is re-validated here rather than trusted as returned. A date that
 * is not a date becomes empty, which the board renders as "no date on file" and
 * refuses to dig on — the failure mode of this function has to be a ticket that
 * says it knows nothing, never one that quietly states a wrong expiry.
 */
export async function parseLocateText(text: string): Promise<ParsedTicket[]> {
  if (!locateChatReady()) {
    throw new Error("ANTHROPIC_API_KEY is not set, so tickets cannot be read.");
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: PARSE_SYSTEM,
    tools: [TICKET_TOOL],
    tool_choice: { type: "tool", name: "record_tickets" },
    messages: [{ role: "user", content: text.slice(0, 120_000) }],
  });

  const call = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_tickets",
  );
  if (!call) return [];

  const raw = (call.input as { tickets?: unknown[] }).tickets ?? [];
  return raw
    .map((t) => {
      const r = t as Record<string, unknown>;
      const members = Array.isArray(r.members) ? r.members : [];
      return {
        number: asText(r.number).toUpperCase(),
        revision: asText(r.revision),
        ticketType: asText(r.ticketType).toUpperCase(),
        lat: asCoord(r.lat),
        lng: asCoord(r.lng),
        responseBy: asDay(r.responseBy),
        updateableOn: asDay(r.updateableOn),
        locateInstructions: asText(r.locateInstructions),
        street: asText(r.street),
        crossStreet: asText(r.crossStreet),
        city: asText(r.city),
        county: asText(r.county),
        workType: asText(r.workType),
        calledInOn: asDay(r.calledInOn),
        workToBeginOn: asDay(r.workToBeginOn),
        updateBy: asDay(r.updateBy),
        expiresOn: asDay(r.expiresOn),
        notes: asText(r.notes),
        members: members.map((m) => {
          const x = m as Record<string, unknown>;
          const status = asText(x.status).toUpperCase();
          return {
            member: asText(x.member),
            code: asText(x.code),
            facilityType: asText(x.facilityType),
            status: ["MARKED", "CLEAR", "NOT_COMPLETE", "DELAYED", "UNKNOWN"].includes(status)
              ? status
              : "UNKNOWN",
            respondedOn: asDay(x.respondedOn),
            note: asText(x.note),
          };
        }).filter((m) => m.member),
      };
    })
    .filter((t) => t.number);
}
