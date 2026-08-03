"use client";

import * as React from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { uploadSubDocument, deleteSubDocument } from "@/app/actions";
import { StatusPill } from "@/components/common/status-pill";

export type SubDoc = {
  id: string;
  section: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  dataUrl: string;
  uploadedBy: string;
  createdAt: string;
};

export const DOC_SECTIONS = [
  { key: "w9", label: "W-9", detail: "Signed W-9 tax form.", required: true },
  { key: "insurance", label: "Insurance (COI) & agreements", detail: "Certificate of insurance, workers' comp, signed subcontract.", required: true },
  { key: "payment", label: "Payment / ACH", detail: "Voided check or ACH authorization for pay applications.", required: true },
  { key: "capabilities", label: "Capabilities statement", detail: "Crews, equipment and trade capabilities (PDF).", required: true },
  { key: "license", label: "Business license & certifications", detail: "State license, DOT, safety certs.", required: false },
  { key: "other", label: "Other documents", detail: "Anything else Fortitude requests.", required: false },
] as const;

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.heic";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentCenter({
  subcontractorId,
  initialDocs,
  uploadedBy = "subcontractor",
  canDelete = true,
}: {
  subcontractorId: string;
  initialDocs: SubDoc[];
  uploadedBy?: "subcontractor" | "contractor";
  canDelete?: boolean;
}) {
  const [docs, setDocs] = React.useState<SubDoc[]>(initialDocs);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function upload(section: string, file: File) {
    setBusy(section);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("subcontractorId", subcontractorId);
    fd.set("section", section);
    fd.set("uploadedBy", uploadedBy);
    const res = await uploadSubDocument(fd);
    setBusy(null);
    if (res.ok) setDocs((d) => [...d, res.doc]);
    else setError(res.error ?? "Upload failed");
  }

  async function remove(id: string) {
    setDocs((d) => d.filter((x) => x.id !== id));
    await deleteSubDocument(id);
  }

  const requiredDone = DOC_SECTIONS.filter((s) => s.required).every((s) =>
    docs.some((d) => d.section === s.key),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">
          Upload PDF, image, or Word/Excel. Both you and Fortitude can review and download.
        </p>
        <StatusPill
          label={requiredDone ? "All required uploaded" : "Documents outstanding"}
          tone={requiredDone ? "success" : "warning"}
          className="text-[10px]"
        />
      </div>

      {error ? <p className="text-[12px] text-critical">{error}</p> : null}

      {DOC_SECTIONS.map((section) => {
        const sectionDocs = docs.filter((d) => d.section === section.key);
        const has = sectionDocs.length > 0;
        return (
          <div key={section.key} className="rounded-xl border border-border/70 bg-foreground/[0.02] p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
                  has ? "bg-success/12 text-success ring-success/25" : "bg-foreground/[0.05] text-muted-foreground ring-foreground/[0.08]",
                )}
              >
                {has ? <CheckCircle2 className="size-4" /> : <FileText className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium text-foreground">{section.label}</p>
                  {section.required ? (
                    <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Required
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">{section.detail}</p>
              </div>
              <label className="focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-2.5 py-1.5 text-[11.5px] font-medium text-brand-bright hover:bg-foreground/[0.06]">
                {busy === section.key ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Upload
                <input
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  disabled={busy === section.key}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(section.key, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {sectionDocs.length > 0 ? (
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {sectionDocs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-lg bg-foreground/[0.03] px-2.5 py-1.5">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{d.fileName}</span>
                    <span className="num shrink-0 text-[10.5px] text-muted-foreground">{formatBytes(d.sizeBytes)}</span>
                    <span className="shrink-0 rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground">
                      {d.uploadedBy === "contractor" ? "Fortitude" : "Sub"}
                    </span>
                    <a
                      href={d.dataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
                      title="View"
                    >
                      <Eye className="size-3.5" />
                    </a>
                    <a
                      href={d.dataUrl}
                      download={d.fileName}
                      className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
                      title="Download"
                    >
                      <Download className="size-3.5" />
                    </a>
                    {canDelete ? (
                      <button
                        onClick={() => remove(d.id)}
                        className="focus-ring grid size-6 place-items-center rounded text-muted-foreground hover:text-critical"
                        title="Remove"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
