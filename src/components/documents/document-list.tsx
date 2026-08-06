"use client";

import * as React from "react";
import { Download, FileText, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/format";
import type { DocumentDetail } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from "@/components/documents/document-labels";

/**
 * The document list.
 *
 * A row opens the document in place rather than navigating away — you are
 * usually checking one thing on one contract, and losing the list to do it is
 * the wrong trade. Download sits on the row too, because the common case is
 * "send this to someone" and that shouldn't need a preview first.
 */
export function DocumentList({ docs }: { docs: DocumentDetail[] }) {
  const [open, setOpen] = React.useState<DocumentDetail | null>(null);
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState("");
  const [status, setStatus] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (type && d.type !== type) return false;
      if (status && d.status !== status) return false;
      if (!q) return true;
      return [
        d.title,
        d.subcontractor,
        d.customer,
        d.project,
        TYPE_LABEL[d.type],
        ...d.files.map((f) => f.fileName),
      ]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [docs, query, type, status]);

  // Only offer filters for values that actually occur — an empty dropdown of
  // every possible type is noise.
  const types = [...new Set(docs.map((d) => d.type))].sort();
  const statuses = [...new Set(docs.map((d) => d.status))].sort();

  return (
    <>
      <Panel>
        <PanelHeader
          title="All documents"
          count={filtered.length}
          icon={<FileText className="size-3.5" />}
        />

        {docs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-2.5">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 py-1.5 ring-1 ring-inset ring-foreground/[0.06] focus-within:ring-brand/40">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, file, crew, customer or project…"
                className="w-full bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </label>
            <Filter value={type} onChange={setType} label="All types">
              {types.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t] ?? t}
                </option>
              ))}
            </Filter>
            <Filter value={status} onChange={setStatus} label="All statuses">
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </option>
              ))}
            </Filter>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <PanelBody>
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 px-4 py-10 text-center">
              <FileText className="size-5 text-muted-foreground/60" />
              <p className="text-[13px] font-medium text-foreground">
                {docs.length === 0 ? "No documents yet" : "Nothing matches"}
              </p>
              <p className="max-w-sm text-[12px] text-muted-foreground">
                {docs.length === 0
                  ? "Upload contracts, agreements, insurance certificates or W-9s above and they'll appear here."
                  : "Try a different search or clear the filters."}
              </p>
            </div>
          </PanelBody>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((d) => (
              <li key={d.id} className="border-t border-border/60 first:border-t-0">
                <div className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.025] sm:px-5">
                  <button
                    type="button"
                    onClick={() => setOpen(d)}
                    className="focus-ring flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
                      <FileText className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground group-hover:text-white">
                          {d.title}
                        </span>
                        <StatusPill
                          label={STATUS_LABEL[d.status] ?? d.status}
                          tone={STATUS_TONE[d.status] ?? "neutral"}
                          className="shrink-0 text-[10px]"
                          dot={false}
                        />
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                        {[
                          TYPE_LABEL[d.type] ?? d.type,
                          d.subcontractor,
                          d.customer,
                          d.project,
                          d.files.length > 1 ? `${d.files.length} files` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-right text-[11px] text-muted-foreground sm:block">
                      <span className="num block">v{d.versionNo}</span>
                      <span className="block">{formatWhen(d.updatedAt)}</span>
                    </span>
                    {d.fileId ? (
                      <a
                        href={`/api/documents/file/${d.fileId}`}
                        download
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                        className="focus-ring grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Download className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {open ? <DocumentViewer doc={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Filter({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 shrink-0 rounded-lg border border-border bg-foreground/[0.03] px-2 text-[12px] outline-none focus:border-brand/50",
        value ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <option value="">{label}</option>
      {children}
    </select>
  );
}
