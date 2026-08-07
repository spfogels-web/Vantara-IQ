"use client";

import * as React from "react";
import { FileUp, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { uploadRateSheet } from "@/app/actions";

/**
 * Drop a signed rate sheet onto a card.
 *
 * Reads the file directly — the PDF's own text layer or the spreadsheet's own
 * cells — so there is no review queue between choosing the file and having the
 * rates. That is only safe because nothing here is inferred: a rate sheet is a
 * price table, and the parser either finds a code beside a price or reports
 * that it found nothing.
 *
 * The result says what changed, not just that it worked. A revised sheet that
 * moves eleven rates and leaves four hundred alone is a very different event
 * from one that moves nothing, and "uploaded" tells you neither.
 */
export function RateSheetUpload({
  subcontractorId,
  customerId,
  onLoaded,
}: {
  subcontractorId?: string;
  customerId?: string;
  onLoaded?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<
    | {
        fileName: string;
        parsed: number;
        added: number;
        changed: number;
        same: number;
        moved: string[];
        moreMoved: number;
      }
    | null
  >(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.set("file", file);
    if (subcontractorId) fd.set("subcontractorId", subcontractorId);
    if (customerId) fd.set("customerId", customerId);

    const res = await uploadRateSheet(fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res);
    onLoaded?.();
  }

  return (
    <div className="border-b border-border/70 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Clear the input so choosing the same file twice still fires.
            e.target.value = "";
            if (f) void send(f);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05]",
            busy && "opacity-60",
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />}
          {busy ? "Reading…" : "Upload rate sheet"}
        </button>
        <span className="text-[11.5px] text-muted-foreground">
          PDF, XLSX or CSV. Codes replace by code — the card ends up matching the sheet.
        </span>
      </div>

      {error ? <p className="mt-1.5 text-[11.5px] text-critical">{error}</p> : null}

      {result ? (
        <div className="mt-1.5 text-[11.5px]">
          <p className="text-success">
            {result.fileName}: {result.parsed} priced rows — {result.added} added,{" "}
            {result.changed} changed, {result.same} already matching.
          </p>
          {result.moved.length > 0 ? (
            <ul className="mt-0.5 flex flex-wrap gap-x-4 text-muted-foreground">
              {result.moved.map((m) => (
                <li key={m} className="num">
                  {m}
                </li>
              ))}
              {result.moreMoved > 0 ? <li>…and {result.moreMoved} more</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
