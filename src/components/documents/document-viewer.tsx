"use client";

import * as React from "react";
import { Download, ExternalLink, FileText, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/format";
import type { DocumentDetail, DocumentFileRef } from "@/data/queries";
import { StatusPill } from "@/components/common/status-pill";
import { STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from "@/components/documents/document-labels";

/**
 * A document, opened in place.
 *
 * PDFs and images render inline through the authorised download route, so the
 * preview obeys the same access check as the file itself — there is no second
 * path to the bytes that could disagree with the first.
 *
 * Anything the browser cannot display (Word, Excel) gets an honest panel and a
 * download rather than an embed that would show a blank box. Every file on the
 * document is listed, not just the newest, because a document accumulates
 * originals, renders and executed copies and any of them may be the one you
 * came for.
 */
export function DocumentViewer({
  doc,
  onClose,
}: {
  doc: DocumentDetail;
  onClose: () => void;
}) {
  const [active, setActive] = React.useState<DocumentFileRef | null>(doc.files[0] ?? null);

  // Escape closes, and the body must not scroll behind the overlay.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const href = active ? `/api/documents/file/${active.id}` : null;
  const isPdf = active?.mime === "application/pdf";
  const isImage = !!active?.mime?.startsWith("image/");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-elev-3"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[14px] font-semibold text-foreground">{doc.title}</h2>
              <StatusPill
                label={STATUS_LABEL[doc.status] ?? doc.status}
                tone={STATUS_TONE[doc.status] ?? "neutral"}
                className="text-[10px]"
                dot={false}
              />
              <span className="num text-[11px] text-muted-foreground">v{doc.versionNo}</span>
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              {[
                TYPE_LABEL[doc.type] ?? doc.type,
                doc.subcontractor,
                doc.customer,
                doc.project,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {href ? (
              <>
                <a
                  href={href}
                  download={active?.fileName}
                  className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
                >
                  <Download className="size-3.5" /> Download
                </a>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in a new tab"
                  className="focus-ring grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="focus-ring grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 flex-1 bg-foreground/[0.02]">
            {!active ? (
              <Centered>No file attached to this document yet.</Centered>
            ) : isPdf ? (
              <iframe
                key={active.id}
                src={href!}
                title={active.fileName}
                className="size-full min-h-[50vh] border-0"
              />
            ) : isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={active.id}
                src={href!}
                alt={active.fileName}
                className="mx-auto max-h-full w-auto object-contain p-3"
              />
            ) : (
              <Centered>
                <span className="block text-[13px] font-medium text-foreground">
                  {active.fileName}
                </span>
                <span className="mt-1 block text-[12px]">
                  A browser can&apos;t display this type. Download it to open.
                </span>
              </Centered>
            )}
          </div>

          {doc.files.length > 0 ? (
            <aside className="shrink-0 border-t border-border p-3 lg:w-64 lg:border-l lg:border-t-0">
              <p className="eyebrow mb-2">Files ({doc.files.length})</p>
              <ul className="flex flex-col gap-1">
                {doc.files.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setActive(f)}
                      className={cn(
                        "focus-ring w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                        active?.id === f.id
                          ? "bg-brand/10 ring-1 ring-inset ring-brand/25"
                          : "hover:bg-foreground/[0.04]",
                      )}
                    >
                      <span className="block truncate text-[12px] text-foreground">
                        {f.fileName || "Untitled file"}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                        {KIND_LABEL[f.kind] ?? f.kind} ·{" "}
                        {f.sizeBytes ? `${(f.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-border/60 pt-2 text-[10.5px] text-muted-foreground">
                Added {formatWhen(doc.createdAt)}
              </p>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  original_upload: "Original",
  generated_pdf: "Generated",
  executed_pdf: "Executed",
  audit_certificate: "Audit certificate",
  signature_image: "Signature",
  attachment: "Attachment",
};

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full min-h-[40vh] place-items-center p-6 text-center text-[12.5px] text-muted-foreground">
      <div>{children}</div>
    </div>
  );
}
