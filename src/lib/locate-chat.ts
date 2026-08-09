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
