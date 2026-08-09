"use client";

import * as React from "react";
import { Check, Download, FileSignature, ScrollText, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Download both agreements, sign them, send them back.
 *
 * Wet signature rather than click-to-accept. A scanned signature on a document
 * the signer demonstrably downloaded is a stronger position than a checkbox,
 * which is the whole reason Fortitude wants it this way.
 *
 * The terms are not restated on this page. They used to be — a summary written
 * to fill the panel, sitting above a download button, which meant a crew could
 * read one set of words and sign another. The PDF is the agreement, so the PDF
 * is what gets read, and nothing here paraphrases it.
 */

const PAPERS = [
  {
    key: "agreement" as const,
    href: "/api/agreement",
    file: "fortitude-subcontractor-agreement.pdf",
    title: "Subcontractor Agreement",
    note: "The terms you work under — scope, payment, insurance, indemnity.",
    icon: ScrollText,
  },
  {
    key: "nda" as const,
    href: "/api/nda",
    file: "fortitude-mutual-nda.pdf",
    title: "Mutual Non-Disclosure Agreement",
    note: "Covers both sides before drawings, prints or customer detail change hands.",
    icon: ShieldCheck,
  },
];

export type PaperKey = (typeof PAPERS)[number]["key"];

export function AgreementStep({
  companyName,
  onDownloaded,
  downloaded,
}: {
  companyName: string;
  /** Fired once anything has been downloaded, so the step can be completed. */
  onDownloaded: () => void;
  downloaded: boolean;
}) {
  // Tracked per document so "downloaded" cannot be satisfied by taking one of
  // the two — both have to be signed, so both have to be fetched.
  const [got, setGot] = React.useState<Record<PaperKey, boolean>>({
    agreement: false,
    nda: false,
  });

  function take(key: PaperKey) {
    setGot((prev) => {
      const next = { ...prev, [key]: true };
      if (next.agreement && next.nda) onDownloaded();
      return next;
    });
  }

  const all = got.agreement && got.nda;

  return (
    <div className="surface flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 border-b border-border/70 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-bright ring-1 ring-inset ring-brand/20">
          <FileSignature className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">Agreements to sign</h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Between Fortitude Infrastructure LLC and {companyName || "your company"}. Download both,
            fill them in, sign them, then upload the signed copies on the next step.
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
            all || downloaded
              ? "border-success/30 bg-success/10 text-success"
              : "border-border/70 text-muted-foreground",
          )}
        >
          {all || downloaded ? "Both downloaded" : `${Object.values(got).filter(Boolean).length} of 2`}
        </span>
      </div>

      <ul className="divide-y divide-border/50">
        {PAPERS.map((p) => {
          const Icon = p.icon;
          const taken = got[p.key];
          return (
            <li key={p.key} className="flex flex-wrap items-center gap-3 p-4">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl",
                  taken ? "bg-success/12 text-success" : "bg-foreground/[0.05] text-muted-foreground",
                )}
              >
                {taken ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">{p.title}</p>
                <p className="text-[11.5px] text-muted-foreground">{p.note}</p>
              </div>

              <a
                href={p.href}
                download={p.file}
                onClick={() => take(p.key)}
                className={cn(
                  "focus-ring inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[12.5px] font-semibold transition",
                  taken
                    ? "border border-border text-muted-foreground hover:text-foreground"
                    : "brand-gradient text-white",
                )}
              >
                <Download className="size-3.5" />
                {taken ? "Download again" : "Download"}
              </a>
            </li>
          );
        })}
      </ul>

      {/* Spelled out as steps rather than a paragraph. A crew doing this once,
          on a phone, in a truck, should not have to infer the process from
          prose — and "I didn't know it had to be signed by hand" is the
          objection this whole step exists to prevent. */}
      <div className="border-t border-border/70 p-4">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-brand-bright">
          What to do
        </p>
        <ol className="mt-2 flex flex-col gap-2">
          {[
            "Download both documents using the buttons above.",
            "Fill in your company details — company name, address, EIN, and the name and title of the person authorised to sign.",
            "Sign both by hand. A typed name is not accepted; Fortitude requires a wet signature on the subcontractor agreement.",
            "Date them.",
            "Scan them, or photograph every page so the whole page is readable.",
            "Upload the signed copies on the next step.",
          ].map((line, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[10.5px] font-semibold text-brand-bright">
                {i + 1}
              </span>
              <span className="text-[12px] leading-relaxed text-muted-foreground">{line}</span>
            </li>
          ))}
        </ol>

        <p className="mt-3 rounded-lg border border-border/60 bg-foreground/[0.03] p-3 text-[11.5px] leading-relaxed text-muted-foreground">
          These PDFs are the operative documents — what you sign is what governs the work. Fortitude
          countersigns and returns the executed agreements to your portal. You cannot be assigned a
          job until the signed subcontractor agreement is back.
        </p>

        {all ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
            <Check className="size-3.5" /> Both downloaded — sign them and upload on the next step
          </p>
        ) : null}
      </div>
    </div>
  );
}
