import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/prisma";
import { billingWeekFor, weekOf, addDays } from "@/lib/billing";
import { MAIN_BILLABLE_CODES } from "@/lib/unit-codes";

/**
 * The operations assistant — ask the business a question in English.
 *
 * It reads. That is not a rule it has been asked to follow, it is the shape of
 * what it can do: every tool below runs a query and returns rows, and there is
 * no tool that writes. A model cannot change a rate here for the same reason a
 * calculator cannot send an email — the capability does not exist. Rate cards,
 * dailies, invoices and crews are reachable to look at and unreachable to
 * touch, whatever anybody types into the box.
 *
 * The other rule is that it does not do arithmetic it was not given. Margins,
 * totals and week boundaries are computed here in code and handed over as
 * numbers, so an answer about money is the database's answer rather than the
 * model's recollection of one.
 */

export type OpsMessage = { role: "user" | "assistant"; content: string };

export function opsChatReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const key = (c: string) => String(c).toUpperCase().replace(/\s+/g, "");

/* ------------------------------------------------------------------ *
 * The tools. Read-only by construction — findMany, count, aggregate.
 * ------------------------------------------------------------------ */

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_projects",
    description:
      "Every project with its status, health, pace, remaining footage, deadline and assigned crew.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_crews",
    description:
      "Every subcontractor: their state (active, pending review), what documents they have on file, what compliance is outstanding, and which projects they are assigned to.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_dailies",
    description:
      "Filed dailies with work date, crew, project, status, footage, what each bills the customer, what it costs us in crew pay, and the gross margin. Use this for production and profitability questions.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Optional filter: Submitted, In review, Approved or Denied. Omit for all.",
        },
      },
    },
  },
  {
    name: "code_economics",
    description:
      "For a unit code: what the customer pays us, what each crew is paid, and the margin per crew. The tool for 'are we making money on X' and 'who is cheapest to send'. Accepts a partial code — 'BHF' returns every handhole.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "A unit code or the start of one, e.g. BHF or BFO48I." },
      },
      required: ["code"],
    },
  },
  {
    name: "production_by_week",
    description:
      "Footage by billing week (Saturday to Friday) and by crew, for the last several weeks. Use for trend and pace questions.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "money_position",
    description:
      "Where the money is: approved work not yet invoiced, invoices issued and unpaid, anything past due, and what crews are owed on draft pay statements.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "billable_codes",
    description:
      "The unit codes the system offers on a daily sheet, with the customer rate for each. Use to check whether a code exists before reasoning about it.",
    input_schema: { type: "object", properties: {} },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "list_projects": {
      const rows = await prisma.project.findMany({
        select: {
          name: true, number: true, client: true, location: true, status: true,
          health: true, pctComplete: true, remainingFt: true, deadline: true,
          crew: true, requiredFtPerDay: true, actualFtPerDay: true, tone: true,
        },
      });
      return JSON.stringify(rows);
    }

    case "list_crews": {
      const rows = await prisma.subcontractor.findMany({
        select: {
          company: true, lead: true, state: true, location: true, trades: true,
          compliance: true, crewSize: true,
          documents: { select: { section: true } },
          projects: { select: { name: true } },
        },
      });
      return JSON.stringify(
        rows.map((r) => ({
          company: r.company.trim(),
          lead: r.lead,
          state: r.state,
          location: r.location,
          trades: r.trades,
          crewSize: r.crewSize,
          documentsOnFile: [...new Set(r.documents.map((d) => d.section))],
          compliance: r.compliance,
          projects: r.projects.map((p) => p.name),
        })),
      );
    }

    case "list_dailies": {
      const rows = await prisma.daily.findMany({
        select: {
          workDate: true, crew: true, subcontractor: true, projectName: true,
          status: true, totalFt: true, billingWeekEnd: true, customer: true,
          projectId: true, lineItems: true,
        },
        orderBy: { workDate: "desc" },
      });
      const { priceDailies } = await import("@/data/queries");
      const priced = await priceDailies(rows);
      const status = typeof input.status === "string" ? input.status : null;
      const out = rows
        .map((r, i) => ({
          workDate: r.workDate,
          crew: r.subcontractor || r.crew,
          project: r.projectName,
          status: r.status,
          totalFt: r.totalFt,
          billingWeek: billingWeekFor({ workDate: r.workDate, billingWeekEnd: r.billingWeekEnd })?.end ?? null,
          billsCustomer: priced[i].billableAmount,
          crewPay: priced[i].subCost,
          grossMargin: priced[i].grossMargin,
          linesThatPriceAtZero: priced[i].unpricedCodes,
        }))
        .filter((d) => !status || d.status.toLowerCase() === status.toLowerCase());
      return JSON.stringify(out);
    }

    case "code_economics": {
      const q = key(String(input.code ?? ""));
      if (!q) return JSON.stringify({ error: "No code given." });

      const customers = await prisma.customer.findMany({
        select: { name: true, rates: { select: { code: true, rate: true, unit: true } } },
      });
      const subs = await prisma.subcontractor.findMany({
        select: { company: true, rates: { select: { code: true, rate: true } } },
      });

      const codes = new Set<string>();
      for (const c of customers)
        for (const r of c.rates) if (key(r.code).includes(q)) codes.add(r.code);

      const out = [...codes]
        .sort()
        .slice(0, 40)
        .map((code) => {
          const sell = customers
            .map((c) => {
              const hit = c.rates.find((r) => key(r.code) === key(code));
              return hit ? { customer: c.name, rate: hit.rate, unit: hit.unit } : null;
            })
            .filter(Boolean);
          const pay = subs
            .map((s) => {
              const hit = s.rates.find((r) => key(r.code) === key(code));
              return hit
                ? {
                    crew: s.company.trim(),
                    rate: hit.rate,
                    // Margin against the first customer that prices it.
                    margin: sell[0] ? Number((sell[0]!.rate - hit.rate).toFixed(2)) : null,
                  }
                : { crew: s.company.trim(), rate: null, margin: null };
            })
            .filter((p) => p.rate !== null || true);
          return { code, weBill: sell, wePay: pay };
        });

      return JSON.stringify(
        out.length ? out : { note: `No code on any rate card matches "${input.code}".` },
      );
    }

    case "production_by_week": {
      const rows = await prisma.daily.findMany({
        select: { workDate: true, billingWeekEnd: true, totalFt: true, subcontractor: true, crew: true, projectName: true },
      });
      const byWeek = new Map<string, { ft: number; crews: Record<string, number> }>();
      for (const r of rows) {
        const wk = billingWeekFor({ workDate: r.workDate, billingWeekEnd: r.billingWeekEnd })?.end;
        if (!wk) continue;
        if (!byWeek.has(wk)) byWeek.set(wk, { ft: 0, crews: {} });
        const b = byWeek.get(wk)!;
        b.ft += r.totalFt;
        const who = (r.subcontractor || r.crew || "Unassigned").trim();
        b.crews[who] = (b.crews[who] ?? 0) + r.totalFt;
      }
      const thisWeek = weekOf(new Date().toISOString().slice(0, 10));
      return JSON.stringify({
        note: "Billing weeks run Saturday to Friday. weekEnding is the Friday.",
        currentWeekEnding: thisWeek?.end ?? null,
        previousWeekEnding: thisWeek ? addDays(thisWeek.end, -7) : null,
        weeks: [...byWeek.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([weekEnding, v]) => ({ weekEnding, totalFt: v.ft, byCrew: v.crews })),
      });
    }

    case "money_position": {
      const [dailies, invoices, subInvoices] = await Promise.all([
        prisma.daily.findMany({
          select: { status: true, workDate: true, customer: true, subcontractor: true, projectId: true, lineItems: true },
        }),
        prisma.invoice.findMany({
          select: { number: true, status: true, amountDue: true, dueAt: true, payments: { select: { amount: true } } },
        }),
        prisma.subInvoice.findMany({
          select: { number: true, status: true, subcontractor: { select: { company: true } }, lines: { select: { amount: true } } },
        }),
      ]);
      const { priceDailies } = await import("@/data/queries");
      const priced = await priceDailies(dailies);
      const approved = dailies
        .map((d, i) => ({ ...d, ...priced[i] }))
        .filter((d) => d.status === "Approved");

      return JSON.stringify({
        approvedNotYetInvoiced: {
          count: approved.length,
          amount: Number(approved.reduce((s, d) => s + d.billableAmount, 0).toFixed(2)),
        },
        customerInvoices: invoices.map((i) => {
          const paid = i.payments.reduce((s, p) => s + p.amount, 0);
          return {
            number: i.number, status: i.status,
            amountDue: i.amountDue, paid: Number(paid.toFixed(2)),
            balance: Number((i.amountDue - paid).toFixed(2)),
            dueAt: i.dueAt?.toISOString().slice(0, 10) ?? null,
          };
        }),
        crewPayStatements: subInvoices.map((s) => ({
          number: s.number, status: s.status, crew: s.subcontractor.company.trim(),
          total: Number(s.lines.reduce((a, b) => a + b.amount, 0).toFixed(2)),
        })),
      });
    }

    case "billable_codes": {
      const cust = await prisma.customer.findMany({
        select: { name: true, rates: { select: { code: true, rate: true, unit: true } } },
      });
      const main = new Set(MAIN_BILLABLE_CODES.map(key));
      return JSON.stringify(
        cust.map((c) => ({
          customer: c.name,
          codes: c.rates
            .filter((r) => main.has(key(r.code)))
            .map((r) => ({ code: r.code, rate: r.rate, unit: r.unit })),
        })),
      );
    }

    default:
      return JSON.stringify({ error: `No tool named ${name}.` });
  }
}

const SYSTEM = `You are the operations assistant for Fortitude Infrastructure, a veteran-owned underground utility and fibre contractor working Windstream jobs in Georgia through Globe Communications. You are talking to Sean Fogelson, who owns the company.

WHAT YOU ARE
You read the business and answer questions about it. You are here to help him run and improve the company: spot where money is leaking, where a crew is unprofitable, what is holding up billing, what needs chasing.

YOU CANNOT CHANGE ANYTHING
Every tool you have is a read. There is no tool that writes, so you cannot alter a rate, a daily, an invoice or a crew record — and you should say so plainly if asked. If he wants something changed, tell him exactly what to change and where, and let him or the system do it.

HOW TO ANSWER
- Numbers come from tools, never from memory. If you have not looked it up in this conversation, look it up.
- Do the arithmetic on figures the tools gave you, and show the figures you used. "J&P earn $80 on a unit that bills $264.48, so $184.48 a unit" — not "roughly 70% margin".
- Say when the data does not support an answer. "No daily has been approved yet, so there is nothing ready to bill" beats inventing a number. Zero is a real answer.
- Be direct and brief. This is spoken aloud as often as read, so lead with the answer, then the reasoning. No preamble, no restating the question.
- Flag what you notice even if he did not ask, when it costs money: a code that prices at zero, a crew paid more than the job bills, a document that lapsed.

WHAT YOU KNOW ABOUT THE BUSINESS
- Billing weeks run Saturday to Friday. Work after Friday 11:59pm falls into the following week unless the office overrides it.
- A unit code must match the customer's rate card exactly or it prices at zero and bills nothing while still looking filed. This has happened and cost real money.
- Fortitude bills Globe; Globe's rate is what Fortitude earns. Subcontractor rates are what Fortitude pays crews. The difference is the margin, and it varies by crew for the same work.
- The "I" suffix on a fibre code means pulled through existing pipe, priced far lower than placing new cable.

SPEAKING
Your answer is read aloud as well as shown, and the two need different writing. Finish every reply with a final line in exactly this form:

SPOKEN: <one or two sentences>

That line is what gets said out loud, so write it to be heard, not read. Lead with the answer. No markdown, no tables, no bullet characters, no code strings. Say "the seventeen by thirty handhole" rather than "BHF(17X30X24)T". Round for the ear - "about twenty three thousand dollars" rather than "2,920.76" - and keep the exact figures in the written answer above it. If the honest answer is that there is nothing to report, say that in one short sentence.`;

/**
 * Ask a question. Runs the model's tool calls until it has what it needs.
 *
 * Capped at eight rounds — a question that cannot be answered in eight reads
 * is one the assistant should admit it cannot answer, rather than loop on.
 */
export type OpsAnswer = { text: string; spoken: string };

export async function askOps(history: OpsMessage[]): Promise<OpsAnswer> {
  if (!opsChatReady()) {
    throw new Error("ANTHROPIC_API_KEY is not set, so the assistant is unavailable.");
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < 8; round++) {
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });

    if (res.stop_reason !== "tool_use") {
      const block = res.content.find((b) => b.type === "text");
      const raw = block && block.type === "text" ? block.text.trim() : "";
      return raw ? splitSpoken(raw) : { text: "I could not put an answer together for that.", spoken: "I could not put an answer together for that." };
    }

    messages.push({ role: "assistant", content: res.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      let out: string;
      try {
        out = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>);
      } catch (e) {
        out = JSON.stringify({ error: e instanceof Error ? e.message : "That lookup failed." });
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  const giveUp = "That took more lookups than I can do in one go. Try narrowing the question.";
  return { text: giveUp, spoken: giveUp };
}

/**
 * Peel the spoken line off the end of an answer.
 *
 * If the model forgets it - and it will, occasionally - the written answer is
 * flattened into something sayable rather than read out with its markdown
 * intact. A voice that says "asterisk asterisk" is worse than one that
 * paraphrases.
 */
function splitSpoken(raw: string): OpsAnswer {
  const marker = raw.match(/\n?\s*SPOKEN:\s*([\s\S]+)$/i);
  if (marker) {
    return {
      text: raw.slice(0, marker.index).trim(),
      spoken: marker[1].trim().replace(/\s+/g, " "),
    };
  }

  // No marker — flatten the written answer into something sayable. Table rows
  // and headings go entirely; a read-aloud table is noise.
  const flattened = raw
    .split("\n")
    .filter((l) => !/^\s*\|/.test(l) && !/^\s*#{1,6}\s/.test(l))
    .join(" ")
    .replace(/[*_`#>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { text: raw, spoken: flattened.slice(0, 400) };
}
