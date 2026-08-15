import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { MAIN_BILLABLE_CODES } from "@/lib/unit-codes";

/**
 * Read a filled-in daily billing sheet — a photo, a scan, or the PDF a crew
 * emailed in — and turn it into the grid the system already understands.
 *
 * Two rules shape everything here, and both come from the same $395 daily:
 *
 * 1. **The model never invents a code.** It picks from the codes on the
 *    customer's rate card or it says it could not tell. A code that is nearly
 *    right prices at nothing and bills nothing, and the sheet still looks
 *    filed — so a guess is worse than a blank. Whatever it returns is checked
 *    against the card again on this side; anything not on the card is reported
 *    as unresolved rather than written into the sheet.
 *
 * 2. **Nothing it reads is submitted.** An imported sheet lands as a draft for
 *    someone to look at against the paper. The model is reading handwriting off
 *    a photo taken in a truck; it is a first pass, not an authority.
 *
 * The printed TOTALS row is the thing that makes this trustworthy. It is an
 * independent statement of each column's sum, written by the crew, so the rows
 * can be checked against it arithmetically rather than by trusting the read.
 * A column that does not foot is flagged with both numbers.
 */

export type ImportedRow = {
  print: string;
  location: string;
  /** One entry per extracted code column, same order as `codes`. */
  cells: string[];
  remarks: string;
};

export type ImportedColumn = {
  /** The code exactly as written on the paper — "BFOV12.7", "BFOV ADDER DUAL". */
  asWritten: string;
  /** The card code it maps to, or null when nothing on the card clearly matches. */
  resolved: string | null;
  /** The column total printed on the sheet, when the crew footed it. */
  printedTotal: number | null;
};

export type ImportedSheet = {
  header: {
    exchange: string;
    crewNumber: string;
    customer: string;
    jobName: string;
    dateWorked: string;
    projectNumber: string;
    complete: "" | "yes" | "no";
    employees: string[];
  };
  columns: ImportedColumn[];
  rows: ImportedRow[];
  notes: string;
  /** What the model could not read or could not match, in plain words. */
  problems: string[];
};

export function dailyImportReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const asText = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number.parseFloat(asText(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const norm = (c: string) => c.toUpperCase().replace(/\s+/g, "");

const SHEET_TOOL: Anthropic.Tool = {
  name: "record_daily_sheet",
  description: "Record everything readable on this subcontractor daily billing sheet.",
  input_schema: {
    type: "object",
    properties: {
      exchange: { type: "string", description: "Exchange / work order number." },
      crewNumber: { type: "string" },
      customer: { type: "string" },
      jobName: { type: "string", description: "Work order title / job name." },
      dateWorked: { type: "string", description: "Date work performed, as written." },
      projectNumber: { type: "string" },
      complete: { type: "string", enum: ["yes", "no", ""], description: "Work order complete." },
      employees: { type: "array", items: { type: "string" } },
      columns: {
        type: "array",
        description:
          "One entry per HOURLY / UNIT CODE column that has a code written above it, left to right.",
        items: {
          type: "object",
          properties: {
            asWritten: {
              type: "string",
              description: "The code exactly as it appears on the paper, including spacing.",
            },
            resolved: {
              type: "string",
              description:
                "The matching code from the allowed list, copied character for character. Empty string if no code in the list clearly matches - never guess.",
            },
            printedTotal: {
              type: "number",
              description: "This column's figure on the printed TOTALS row. Omit if blank.",
            },
          },
          required: ["asWritten", "resolved"],
        },
      },
      rows: {
        type: "array",
        description:
          "One entry per production row that has anything written on it. Skip entirely blank rows.",
        items: {
          type: "object",
          properties: {
            print: { type: "string", description: "Print number." },
            location: { type: "string", description: "Ped / pole location number." },
            cells: {
              type: "array",
              items: { type: "string" },
              description:
                "Quantity in each code column, same order and length as `columns`. Empty string where the cell is blank.",
            },
            remarks: { type: "string" },
          },
          required: ["cells"],
        },
      },
      notes: { type: "string", description: "The NOTES block at the foot of the sheet." },
      problems: {
        type: "array",
        items: { type: "string" },
        description:
          "Anything illegible, ambiguous, or not matched to the allowed code list. Be specific.",
      },
    },
    required: ["columns", "rows"],
  },
};

function systemPrompt(allowed: string[]): string {
  return `You are reading a filled-in Globe Communications "Subcontractor Daily Billing Sheet" (form GLS-203155) for an underground fibre contractor. It may be a scan, a phone photo, or a PDF. Transcribe it.

THE CODE COLUMNS ARE THE POINT. Crews write codes in shorthand. The billing system only pays a code spelled exactly as the rate card spells it, so each column has to be matched to the card.

These are the only codes on this customer's card. Copy one of these strings character for character into "resolved", or leave "resolved" as an empty string:

${allowed.map((c) => `  ${c}`).join("\n")}

Matching guidance, in order:
- "BFOV12.7", "BFOV 12.7", "BFOV(12.7)" all mean BFOV(12.7)(2W)12"DEPTH.
- A column whose header says ADDER, DUAL, (D), or DEPTH(D) and whose quantities equal the BFOV column beside it is the depth adder, BFOV(12.7)(2W)12"DEPTH(D). The adder is billed on every foot, so equal quantities are expected, not a mistake.
- "BM61" means BM61(2)F12IN DEPTH. "BM60" means one of the BM60 codes - if you cannot tell which, leave it empty and say so in problems.
- "BD4" means BD4MPF. "BM2F" means BM2F. "BMFAF" means BMFAF.
- Handholes: "BHF 17X30" and similar sizes are NOT on the list above. Leave those unresolved and say so.

NEVER put a code in "resolved" that is not in the list, and never pick between two plausible codes on a coin flip. An unresolved column is fixed by a person in thirty seconds. A wrongly resolved column bills the wrong number and nobody notices.

QUANTITIES: transcribe digits exactly as written. Do not compute, correct, or fill in a cell that is blank. If a digit is unclear, put your best read in the cell and say which cell in problems.

TOTALS: the printed TOTALS row is what the crew wrote. Record it as printedTotal. Do NOT recompute it or make it agree with the rows - a disagreement is information we want.`;
}

/** Anthropic accepts PDFs as documents and photos as images; pick by type. */
function fileBlock(base64: string, mediaType: string): Anthropic.ContentBlockParam {
  if (mediaType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: base64,
    },
  };
}

/**
 * Read one daily sheet file.
 *
 * `allowedCodes` is the customer's card. Passing it in rather than reading it
 * here keeps the caller in charge of which customer's codes apply — the same
 * paper sheet means different codes on a different job.
 */
export async function extractDailySheet(
  base64: string,
  mediaType: string,
  allowedCodes: string[] = [...MAIN_BILLABLE_CODES],
): Promise<ImportedSheet> {
  if (!dailyImportReady()) {
    throw new Error("ANTHROPIC_API_KEY is not set, so daily sheets cannot be read.");
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: systemPrompt(allowedCodes),
    tools: [SHEET_TOOL],
    tool_choice: { type: "tool", name: "record_daily_sheet" },
    messages: [
      {
        role: "user",
        content: [
          fileBlock(base64, mediaType),
          {
            type: "text",
            text: "Transcribe this daily billing sheet. Match every unit code column to the allowed list, or leave it unresolved and say why.",
          },
        ],
      },
    ],
  });

  const call = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "record_daily_sheet",
  );
  if (!call) throw new Error("Nothing readable came back from that file.");

  const raw = call.input as Record<string, unknown>;
  const problems: string[] = Array.isArray(raw.problems)
    ? (raw.problems as unknown[]).map(asText).filter(Boolean)
    : [];

  // Re-check every resolved code against the card. The prompt says to pick from
  // the list; this is what makes that true rather than hoped for.
  const allowedSet = new Set(allowedCodes.map(norm));
  const columns: ImportedColumn[] = (Array.isArray(raw.columns) ? raw.columns : [])
    .map((c) => {
      const r = c as Record<string, unknown>;
      const asWritten = asText(r.asWritten);
      const claimed = asText(r.resolved);
      const onCard = claimed && allowedSet.has(norm(claimed));
      if (claimed && !onCard) {
        problems.push(
          `"${asWritten}" was matched to "${claimed}", which is not on this customer's card. Left unresolved.`,
        );
      }
      return {
        asWritten,
        // Return the card's own spelling, not the model's echo of it.
        resolved: onCard
          ? (allowedCodes.find((a) => norm(a) === norm(claimed)) ?? null)
          : null,
        printedTotal: asNum(r.printedTotal),
      };
    })
    .filter((c) => c.asWritten);

  const rows: ImportedRow[] = (Array.isArray(raw.rows) ? raw.rows : [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const cells = Array.isArray(r.cells) ? r.cells.map(asText) : [];
      return {
        print: asText(r.print),
        location: asText(r.location),
        // Pad or trim so a row always lines up with the columns it belongs to.
        cells: Array.from({ length: columns.length }, (_, i) => cells[i] ?? ""),
        remarks: asText(r.remarks),
      };
    })
    .filter((r) => r.print || r.location || r.remarks || r.cells.some(Boolean));

  const employees = Array.isArray(raw.employees)
    ? (raw.employees as unknown[]).map(asText).filter(Boolean)
    : [];

  const completeRaw = asText(raw.complete).toLowerCase();

  return {
    header: {
      exchange: asText(raw.exchange),
      crewNumber: asText(raw.crewNumber),
      customer: asText(raw.customer),
      jobName: asText(raw.jobName),
      dateWorked: asText(raw.dateWorked),
      projectNumber: asText(raw.projectNumber),
      complete: completeRaw === "yes" ? "yes" : completeRaw === "no" ? "no" : "",
      employees,
    },
    columns,
    rows,
    notes: asText(raw.notes),
    problems,
  };
}

/** A column whose rows do not add up to the total the crew printed. */
export type FootingCheck = {
  code: string;
  asWritten: string;
  rowSum: number;
  printedTotal: number;
  difference: number;
};

/**
 * Foot every column against the TOTALS row the crew wrote.
 *
 * This is the check that makes an imported sheet safe to act on. The totals are
 * an independent statement of the same numbers, so if the transcribed rows add
 * up to them, the read is almost certainly right — and if they do not, the
 * discrepancy is shown with both figures rather than quietly resolved. Columns
 * the crew left unfooted are skipped; a missing total is not a mismatch.
 */
export function checkFooting(sheet: ImportedSheet): FootingCheck[] {
  const out: FootingCheck[] = [];
  sheet.columns.forEach((col, i) => {
    if (col.printedTotal == null) return;
    const rowSum = sheet.rows.reduce((sum, r) => {
      const n = Number.parseFloat((r.cells[i] ?? "").replace(/,/g, ""));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    const difference = Number((rowSum - col.printedTotal).toFixed(2));
    if (difference !== 0) {
      out.push({
        code: col.resolved ?? col.asWritten,
        asWritten: col.asWritten,
        rowSum,
        printedTotal: col.printedTotal,
        difference,
      });
    }
  });
  return out;
}
