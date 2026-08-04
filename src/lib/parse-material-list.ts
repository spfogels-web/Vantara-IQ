import "server-only";

import type { ExtractedRowData } from "@/lib/extract";

/**
 * Deterministic material-list parsing — no AI, no API call, no cost.
 *
 * Most material lists arrive as a spreadsheet or a CSV export, and a
 * spreadsheet already *is* structured data. Sending it to a model to be read
 * back out is slower, costs money, and can hallucinate; a column mapper cannot.
 * So we try this first and only fall back to Claude when the document is a
 * scan, a photo, or a layout this can't make sense of.
 *
 * Rows that come out of here carry confidence 1 — they weren't interpreted,
 * they were read.
 */

/** Header labels we recognise, loosest-to-tightest within each field. */
const COLUMN_ALIASES: Record<string, string[]> = {
  code: [
    "unit code",
    "material code",
    "item code",
    "product code",
    "catalog number",
    "catalog #",
    "cat #",
    "part number",
    "part #",
    "item #",
    "item no",
    "sku",
    "code",
    "part",
  ],
  description: ["description", "desc", "material description", "item description", "material", "item", "name"],
  plannedQty: [
    "planned qty",
    "plan qty",
    "quantity",
    "qty",
    "qnty",
    "count",
    "amount",
    "total qty",
    "total",
    "est qty",
    "estimated qty",
  ],
  unit: ["unit of measure", "unit", "uom", "u/m", "u of m", "measure", "each"],
  manufacturer: ["manufacturer", "mfg", "mfr", "make", "brand", "vendor", "supplier"],
  size: ["size", "dimension", "dimensions", "gauge", "ga", "diameter", "dia", "length"],
  reelNumber: ["reel number", "reel #", "reel no", "reel", "spool number", "spool #", "spool"],
  furnished: ["furnished by", "furnished", "supplied by", "provided by", "source"],
};

/** A header row has to hit at least this many known columns to be believed. */
const MIN_HEADER_HITS = 2;
/** How far into the file we'll hunt for the header before giving up. */
const HEADER_SEARCH_ROWS = 25;

export type ParseMethod = "spreadsheet" | "pdf-text";

export interface DeterministicParse {
  rows: ExtractedRowData[];
  method: ParseMethod;
  /** Header labels we matched, for the import summary. */
  matched: string[];
  /** Rows we saw but skipped (blank, subtotal, section heading). */
  skipped: number;
}

/** Splits one CSV line, honouring quoted fields and doubled quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const normalise = (s: string) =>
  s.toLowerCase().replace(/[_*]/g, " ").replace(/[^a-z0-9#/ ]/g, "").replace(/\s+/g, " ").trim();

/** Maps a header row onto our field names. Exact match wins over prefix match. */
function mapHeader(cells: string[]): { map: Record<string, number>; hits: string[] } {
  const map: Record<string, number> = {};
  const hits: string[] = [];
  const norm = cells.map(normalise);

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      let idx = norm.findIndex((c) => c === alias);
      if (idx === -1) idx = norm.findIndex((c) => c.startsWith(alias) || c.endsWith(alias));
      if (idx !== -1 && !Object.values(map).includes(idx)) {
        map[field] = idx;
        hits.push(cells[idx].trim());
        break;
      }
    }
  }
  return { map, hits };
}

/** "1,200", "1 200 ft", "(50)" and "" all have to become a number or null. */
function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,$\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Section headings, subtotals and page furniture that aren't material lines. */
function isNoiseRow(cells: string[], joined: string): boolean {
  if (!joined.trim()) return true;
  if (/^#\s*sheet:/i.test(joined)) return true;
  if (/^(sub)?total\b|^grand total\b|^page \d+|^continued\b/i.test(joined.trim())) return true;
  // A row with exactly one non-empty cell is a section heading, not a line item.
  return cells.filter((c) => c.trim()).length < 2;
}

/**
 * Parses delimited text — CSV as uploaded, or the CSV we render each sheet of
 * an .xlsx into. Returns null when there's no header we recognise, which is
 * the signal to fall back to the model.
 */
export function parseDelimitedMaterialList(
  text: string,
  method: ParseMethod = "spreadsheet",
): DeterministicParse | null {
  const lines = text.split(/\r?\n/);

  let headerIdx = -1;
  let header: { map: Record<string, number>; hits: string[] } | null = null;
  let sheet = "";

  for (let i = 0; i < Math.min(lines.length, HEADER_SEARCH_ROWS); i++) {
    const sheetMatch = lines[i].match(/^#\s*sheet:\s*(.+)$/i);
    if (sheetMatch) sheet = sheetMatch[1].trim();

    const candidate = mapHeader(splitCsvLine(lines[i]));
    // A code or description column is mandatory — a row of stray numbers that
    // happens to match "total" and "size" is not a header.
    const usable =
      candidate.hits.length >= MIN_HEADER_HITS &&
      (candidate.map.code !== undefined || candidate.map.description !== undefined);
    if (usable) {
      headerIdx = i;
      header = candidate;
      break;
    }
  }

  if (!header || headerIdx === -1) return null;

  const rows: ExtractedRowData[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const joined = cells.join(" ");

    // A second "# Sheet:" marker means a new sheet with its own header.
    const sheetMatch = lines[i].match(/^#\s*sheet:\s*(.+)$/i);
    if (sheetMatch) {
      sheet = sheetMatch[1].trim();
      continue;
    }
    if (isNoiseRow(cells, joined)) {
      skipped++;
      continue;
    }

    const at = (field: string) => {
      const idx = header.map[field];
      return idx === undefined ? undefined : cells[idx]?.trim();
    };

    const code = at("code") ?? "";
    const description = at("description") ?? "";
    if (!code && !description) {
      skipped++;
      continue;
    }

    rows.push({
      code,
      description,
      unit: at("unit") ?? "",
      plannedQty: toNumber(at("plannedQty")),
      manufacturer: at("manufacturer") ?? "",
      size: at("size") ?? "",
      reelNumber: at("reelNumber") ?? "",
      furnished: at("furnished") ?? "",
      sourcePage: sheet ? `Sheet ${sheet}, row ${i + 1}` : `Row ${i + 1}`,
      // Read, not interpreted — nothing here was inferred.
      confidence: 1,
      warning: "",
    });
  }

  if (rows.length === 0) return null;
  return { rows, method, matched: header.hits, skipped };
}

/**
 * Pulls the text layer out of a PDF. Returns null for scans (no text layer)
 * so they go to the model, which is the right tool for an image.
 */
/**
 * The same text layer, but one entry per page.
 *
 * A 29-page rate sheet cannot be extracted in a single model call — the reply
 * runs past the output limit and the tool call comes back truncated. Splitting
 * on page boundaries lets the caller send it in batches and merge the rows,
 * which is the only way a document that long yields a complete rate card.
 */
export async function pdfTextPages(data: Buffer): Promise<string[] | null> {
  const all = await pdfTextLayer(data);
  if (!all) return null;
  const pages = all
    .split(/\n\n(?=# Sheet: page )/)
    .map((p) => p.trim())
    .filter(Boolean);
  return pages.length > 0 ? pages : null;
}

export async function pdfTextLayer(data: Buffer): Promise<string | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();

      // Rebuild rows from y-position: pdf.js gives positioned runs, not lines.
      const byLine = new Map<number, { x: number; s: string }[]>();
      for (const item of content.items) {
        const it = item as { str?: string; transform?: number[] };
        if (!it.str?.trim() || !it.transform) continue;
        const y = Math.round(it.transform[5]);
        const bucket = byLine.get(y) ?? [];
        bucket.push({ x: it.transform[4], s: it.str });
        byLine.set(y, bucket);
      }

      const lines = [...byLine.entries()]
        .sort((a, b) => b[0] - a[0]) // PDF y grows upward
        .map(([, runs]) =>
          runs
            .sort((a, b) => a.x - b.x)
            .map((r) => r.s.trim())
            .filter(Boolean)
            .join(","),
        );
      pages.push(`# Sheet: page ${i}\n${lines.join("\n")}`);
    }

    const text = pages.join("\n\n");
    // A scan yields a handful of stray characters at most.
    return text.replace(/[\s,]/g, "").length < 40 ? null : text;
  } catch {
    return null; // Malformed or encrypted — let the model try.
  }
}
