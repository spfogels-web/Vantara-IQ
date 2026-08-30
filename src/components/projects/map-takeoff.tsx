"use client";

import * as React from "react";
import { AlertTriangle, Loader2, ScanSearch } from "lucide-react";

import { cn } from "@/lib/utils";
import { readMapTakeoff } from "@/app/actions";

/**
 * Count what is on the print.
 *
 * A takeoff by eye across twenty sheets is an afternoon, and the number
 * somebody lands on is what the job gets scheduled and priced against. This
 * reads the drawing already on the project.
 *
 * It writes nothing. The material list stays what the job is priced against —
 * this is a second opinion to hold against it, and the two disagreeing is the
 * useful signal rather than a problem.
 */

type Result = Awaited<ReturnType<typeof readMapTakeoff>>;

export function MapTakeoff({ projectId }: { projectId: string }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);

  async function read() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await readMapTakeoff(projectId));
    } catch {
      setResult({ ok: false, error: "That print couldn't be read." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">Read the print</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Counts the new green underground work — pedestals, flower pots, bores and
            plow — page by page. Blue existing plant is not counted. An estimate to
            check against the material list, not a replacement for it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void read()}
          disabled={busy}
          className="focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] font-semibold text-foreground transition hover:border-brand/60 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
          {busy ? "Reading…" : "Read the print"}
        </button>
      </div>

      {busy ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Counting across every sheet — this takes a moment on a big drawing.
        </p>
      ) : null}

      {result && !result.ok ? (
        <p className="mt-3 rounded-xl border border-critical/40 bg-critical/[0.07] px-3 py-2 text-[12px] text-foreground">
          {result.error}
        </p>
      ) : null}

      {result?.ok ? <Reading result={result} /> : null}
    </div>
  );
}

function Reading({ result }: { result: Extract<Result, { ok: true }> }) {
  const { reading, headline } = result;

  // Grouped by sheet, sheets in printed order. Only pages with something on
  // them arrive here — the reader is told not to report empty ones.
  const bySheet = React.useMemo(() => {
    const map = new Map<string, typeof reading.callouts>();
    for (const c of reading.callouts) {
      const key = c.sheet.trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }),
    );
  }, [reading]);

  const tiles: [string, number][] = [
    ["Road bores", headline.roadBores],
    ["Flower pots", headline.flowerPots],
    ["Pedestals", headline.pedestals],
    ["Handholes", headline.handholes],
  ];

  return (
    <div className="mt-3 space-y-3">
      {/* The four somebody opened the print to find. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, n]) => (
          <div
            key={label}
            className={cn(
              "rounded-xl border px-3 py-2.5",
              n > 0 ? "border-brand/40 bg-brand/[0.06]" : "border-border bg-foreground/[0.02]",
            )}
          >
            <p className="num text-[20px] font-semibold leading-none text-foreground">{n}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              {label}
            </p>
          </div>
        ))}
      </div>

      {reading.title || reading.sheetCount ? (
        <p className="text-[11.5px] text-muted-foreground">
          {reading.title ? <span className="text-foreground">{reading.title}</span> : null}
          {reading.title && reading.sheetCount ? " · " : ""}
          {reading.sheetCount ? `${reading.sheetCount} sheets` : ""}
        </p>
      ) : null}

      {/* By sheet, because a foreman builds one page at a time and a total
          across twenty-six of them says nothing about the page in front of
          him. Sheets with no new underground work are not reported at all,
          so this list is the pages that have something to build. */}
      {bySheet.length > 0 ? (
        <div className="space-y-2">
          {bySheet.map(([sheet, items]) => (
            <div key={sheet} className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-baseline gap-2 border-b border-border bg-foreground/[0.03] px-3 py-2">
                <span className="text-[12.5px] font-semibold text-foreground">
                  {sheet || "Sheet not stated"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {items.length} {items.length === 1 ? "item" : "items"} to build
                </span>
              </div>
              <table className="w-full text-left text-[12px]">
                <tbody>
                  {items.map((c) => (
                    <tr key={c.label} className="border-b border-border/50 last:border-b-0">
                      <td className="px-3 py-1.5 font-medium text-foreground">{c.label}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{c.meaning || ""}</td>
                      <td className="num px-3 py-1.5 text-right font-semibold text-foreground">
                        {c.feet ? `${c.feet.toLocaleString()} ft` : `${c.count}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          No new underground work found on this print.
        </p>
      )}
      {/* What it could not read. Named rather than quietly dropped, because a
          gap gets checked and a wrong count gets built against. */}
      {reading.problems.length > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/[0.06] px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
            <AlertTriangle className="size-3.5 text-warning" />
            Couldn&apos;t read {reading.problems.length}{" "}
            {reading.problems.length === 1 ? "thing" : "things"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {reading.problems.map((p, i) => (
              <li key={i} className="text-[11.5px] text-muted-foreground">
                · {p}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Counted from the drawing, not from the material list. Where the two disagree,
        one of them is wrong — and that is worth knowing before the job is priced.
      </p>
    </div>
  );
}
