import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * AI extraction of rate/unit/material/rate-card documents into structured rows.
 *
 * The model only ever *extracts and classifies* — it assigns a confidence score
 * to each row and never activates a rate. A human reviews and approves every row
 * on the rate-import screen before anything becomes usable. (Per docs/product-flow.md.)
 */

export type RateDocType =
  | "GC_RATE_SHEET"
  | "UNIT_DESCRIPTION"
  | "MATERIAL_LIST"
  | "SUB_RATE_CARD";

export interface ExtractedRowData {
  code?: string;
  description?: string;
  unit?: string;
  rate?: number | null;
  minimum?: number | null;
  rules?: string;
  effectiveDate?: string;
  expirationDate?: string;
  market?: string;
  state?: string;
  county?: string;
  includedLabor?: string;
  includedMaterial?: string;
  measurementMethod?: string;
  manufacturer?: string;
  size?: string;
  plannedQty?: number | null;
  reelNumber?: string;
  furnished?: string;
  sourcePage?: string;
  confidence?: number;
  warning?: string;
}

export interface ExtractionResult {
  summary: string;
  rows: ExtractedRowData[];
}

const DOC_GUIDANCE: Record<RateDocType, string> = {
  GC_RATE_SHEET:
    "A general-contractor / customer rate sheet. Extract one row per unit code: code, description, unit of measure, billing rate, minimum billable quantity/charge, billing rules, effective/expiration dates, market, state, county, and any adders/exclusions (put those in rules).",
  UNIT_DESCRIPTION:
    "A unit-description sheet. Extract one row per unit code: code, formal description, included labor, included material, measurement method, and documentation requirements (photo/as-built/bore-log/reel — put these in rules).",
  MATERIAL_LIST:
    "A project material list. Extract one row per material: code, description, manufacturer, size, unit of measure, planned quantity, reel number, and customer- vs contractor-furnished classification (put that in `furnished`).",
  SUB_RATE_CARD:
    "A subcontractor rate card. Extract one row per unit code: code, description, unit of measure, subcontractor rate, minimums, retainage/payment/Fast Pay terms and special conditions (put terms in rules).",
};

const ROW_PROPERTIES = {
  code: { type: "string", description: "Unit or material code exactly as printed" },
  description: { type: "string" },
  unit: { type: "string", description: "Unit of measure, e.g. ft, ea, hr, ls" },
  rate: { type: ["number", "null"], description: "Billing/pay rate, numeric only" },
  minimum: { type: ["number", "null"], description: "Minimum billable qty or charge" },
  rules: { type: "string", description: "Billing rules, adders, exclusions, doc requirements, terms" },
  effectiveDate: { type: "string" },
  expirationDate: { type: "string" },
  market: { type: "string" },
  state: { type: "string" },
  county: { type: "string" },
  includedLabor: { type: "string" },
  includedMaterial: { type: "string" },
  measurementMethod: { type: "string" },
  manufacturer: { type: "string" },
  size: { type: "string" },
  plannedQty: { type: ["number", "null"] },
  reelNumber: { type: "string" },
  furnished: { type: "string", description: "'customer' or 'contractor' furnished" },
  sourcePage: { type: "string", description: "Page or section reference in the source doc" },
  confidence: { type: "number", description: "0-1 confidence for this row's extraction" },
  warning: { type: "string", description: "Any validation concern, ambiguity, or missing field" },
} as const;

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * One pass over one document or one slice of one.
 *
 * Kept separate from extractDocument because a long rate sheet is read a few
 * pages at a time — see below for why.
 */
async function extractOnce(input: {
  docType: RateDocType;
  base64?: string;
  mediaType?: string;
  text?: string;
}): Promise<ExtractionResult> {
  if (!isConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic();

  const instruction =
    `You are extracting data from ${DOC_GUIDANCE[input.docType]}\n\n` +
    "Extract every line item you can find. For each, set a confidence score (0-1) and note any ambiguity in `warning`. " +
    "Never invent values — leave a field empty/null if it isn't present. Return only via the record_extraction tool.";

  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: instruction }];

  if (input.base64 && input.mediaType) {
    if (input.mediaType === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: input.base64 },
      });
    } else {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: input.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
          data: input.base64,
        },
      });
    }
  } else if (input.text) {
    content.push({ type: "text", text: "Document contents:\n\n```\n" + input.text + "\n```" });
  }

  // Streamed, with a large output budget. A rate sheet is hundreds of rows of
  // JSON; at 16k tokens the reply was running past the limit mid-tool-call and
  // the truncated result silently became "0 rows extracted" on a document the
  // model had read perfectly well.
  const message = await client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 32000,
    tools: [
      {
        name: "record_extraction",
        description: "Record the structured rows extracted from the document.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string", description: "One-line summary of what the document is" },
            rows: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: ROW_PROPERTIES,
                required: ["code", "description", "confidence"],
              },
            },
          },
          required: ["summary", "rows"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_extraction" },
    messages: [{ role: "user", content }],
  }).finalMessage();

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) throw new Error("Model returned no extraction");

  const result = toolUse.input as ExtractionResult;
  const rows = Array.isArray(result.rows) ? result.rows : [];

  // Refuse to report a truncated read as a successful one. Returning the rows
  // that happened to fit would quietly drop the rest of a rate card, and every
  // number downstream — invoices, pay applications, margin — would be wrong in
  // a way nothing else would catch.
  if (message.stop_reason === "max_tokens") {
    throw new TruncatedExtractionError(
      `The document is too long to read in one pass — it was cut off after ${rows.length} rows.`,
      rows.length,
    );
  }

  return { summary: result.summary ?? "", rows };
}

/**
 * How many pages go into one read.
 *
 * A rate sheet is dense — a page can carry sixty priced rows, and each row is
 * a fair amount of JSON. Six pages sits well inside the output budget with
 * room for a page that is busier than the rest.
 */
const PAGES_PER_PASS = 6;

/**
 * One document → structured rows.
 *
 * A long PDF is read in slices rather than in one pass. The single-pass version
 * failed on a 60-page Trawick sheet: the model hit its output limit part-way
 * through the tool call, the truncated JSON parsed to nothing, and a document
 * it had read perfectly well came back as "cut off after 0 rows". The row
 * count is what blows the budget, and the row count follows the page count, so
 * bounding pages per call bounds the output.
 *
 * Slices are read one after another rather than at once. These documents are
 * hundreds of rows and the account has other work going through it; a
 * fan-out of ten simultaneous reads is how a rate import starts rate-limiting
 * the daily importer.
 *
 * Rows are merged by code, first read winning. A code printed on two pages is
 * the same rate twice, and letting a later page overwrite an earlier one would
 * silently prefer whichever copy happened to be last.
 */
export async function extractDocument(input: {
  docType: RateDocType;
  base64?: string;
  mediaType?: string;
  text?: string;
}): Promise<ExtractionResult> {
  const slices =
    input.base64 && input.mediaType === "application/pdf"
      ? await splitPdf(input.base64, PAGES_PER_PASS)
      : null;

  // Not a PDF, unreadable as one, or short enough to take in a single pass.
  if (!slices || slices.length <= 1) return extractOnce(input);

  const merged = new Map<string, ExtractedRowData>();
  const summaries: string[] = [];
  let read = 0;

  for (const slice of slices) {
    let result: ExtractionResult;
    try {
      result = await extractOnce({ ...input, base64: slice });
    } catch (err) {
      // A slice that truncates on its own is a genuinely unreadable stretch of
      // document, not a budget problem. Say which pages rather than throwing
      // away everything read so far.
      if (err instanceof TruncatedExtractionError) {
        throw new TruncatedExtractionError(
          `Pages ${read * PAGES_PER_PASS + 1}–${(read + 1) * PAGES_PER_PASS} could not be read in one pass — ` +
            `${merged.size} rows were read before that.`,
          merged.size,
        );
      }
      throw err;
    }

    for (const row of result.rows) {
      const key = (row.code ?? "").trim().toUpperCase();
      // A row with no code cannot be deduplicated, and dropping it would lose
      // a genuine line. Keyed by position so it survives.
      const id = key || `__row_${merged.size}`;
      if (!merged.has(id)) merged.set(id, row);
    }
    if (result.summary) summaries.push(result.summary);
    read++;
  }

  const rows = [...merged.values()];
  return {
    // The first slice carries the title block and the terms; later ones repeat
    // the header, so one summary is what a person wants to read. How it was
    // read is appended, because "93 rows" from one pass and "93 rows" from ten
    // are worth telling apart when a number later looks wrong.
    summary: `${summaries[0] ?? ""} (read in ${slices.length} passes, ${rows.length} rows)`.trim(),
    rows,
  };
}

/**
 * Cut a PDF into groups of pages, each a PDF of its own.
 *
 * Returns null when the file cannot be opened as a PDF — an encrypted or
 * malformed one is still worth handing to the model whole, which is what the
 * caller does with a null.
 */
async function splitPdf(base64: string, perSlice: number): Promise<string[] | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(Buffer.from(base64, "base64"), {
      ignoreEncryption: true,
    });
    const total = src.getPageCount();
    if (total <= perSlice) return null;

    const out: string[] = [];
    for (let start = 0; start < total; start += perSlice) {
      const doc = await PDFDocument.create();
      const idx = Array.from(
        { length: Math.min(perSlice, total - start) },
        (_, k) => start + k,
      );
      const pages = await doc.copyPages(src, idx);
      for (const pg of pages) doc.addPage(pg);
      out.push(Buffer.from(await doc.save()).toString("base64"));
    }
    return out;
  } catch {
    return null;
  }
}

/** Thrown when the model hit its output limit before finishing the document. */
export class TruncatedExtractionError extends Error {
  constructor(
    message: string,
    readonly rowsBeforeCutoff: number,
  ) {
    super(message);
    this.name = "TruncatedExtractionError";
  }
}
