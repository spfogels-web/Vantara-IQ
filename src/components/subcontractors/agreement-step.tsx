"use client";

import * as React from "react";
import { Check, Download, FileSignature, ScrollText } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  AGREEMENT_INTRO,
  AGREEMENT_SECTIONS,
  AGREEMENT_TITLE,
} from "@/lib/subcontractor-agreement";

/**
 * Read the agreement, download it, sign it, send it back.
 *
 * Wet signature rather than a click-to-accept. A scanned signature on a
 * document the signer demonstrably read and downloaded is a stronger position
 * than a checkbox, which is the whole reason Fortitude wants it this way.
 *
 * The terms are rendered in full rather than linked, because "I never saw it"
 * is the first thing said in a dispute. Scrolling to the end is tracked and the
 * download is what unlocks the next step — not to be clever, but so the record
 * shows the document was opened before it was signed.
 */
export function AgreementStep({
  companyName,
  onDownloaded,
  downloaded,
}: {
  companyName: string;
  onDownloaded: () => void;
  downloaded: boolean;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [readToEnd, setReadToEnd] = React.useState(false);

  function onScroll() {
    const el = scrollRef.current;
    if (!el || readToEnd) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
  }

  return (
    <div className="surface flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 border-b border-border/70 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-bright ring-1 ring-inset ring-brand/20">
          <ScrollText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">{AGREEMENT_TITLE}</h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Read it here, download it, sign it, then upload the signed copy on the next step.
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
            readToEnd
              ? "border-success/30 bg-success/10 text-success"
              : "border-border/70 text-muted-foreground",
          )}
        >
          {readToEnd ? "Read" : "Scroll to read"}
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[46vh] overflow-y-auto bg-foreground/[0.02] px-5 py-4"
      >
        <p className="text-[12px] leading-relaxed text-muted-foreground">{AGREEMENT_INTRO}</p>
        <p className="mt-3 text-[12.5px] font-medium text-foreground">
          Between Fortitude Infrastructure LLC and {companyName || "your company"}.
        </p>

        {AGREEMENT_SECTIONS.map((section) => (
          <section key={section.heading} className="mt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-bright">
              {section.heading}
            </h3>
            {section.body.map((p, i) => (
              <p key={i} className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
          </section>
        ))}

        <p className="mt-6 rounded-lg border border-border/60 bg-foreground/[0.03] p-3 text-[11.5px] leading-relaxed text-muted-foreground">
          The downloaded PDF is the operative document. Sign the signature block on the last page
          and upload the signed copy — Fortitude countersigns and returns the executed agreement to
          your portal.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border/70 p-4">
        <a
          href="/api/agreement"
          download="subcontractor-agreement.pdf"
          onClick={onDownloaded}
          className="brand-gradient focus-ring inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white"
        >
          <Download className="size-4" /> Download the agreement
        </a>

        {downloaded ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
            <Check className="size-3.5" /> Downloaded — sign it and upload on the next step
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <FileSignature className="size-3.5" /> Print, sign, and scan or photograph it
          </span>
        )}
      </div>
    </div>
  );
}
