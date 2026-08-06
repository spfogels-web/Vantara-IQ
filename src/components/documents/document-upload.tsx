"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload as blobUpload } from "@vercel/blob/client";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { registerUploadedDocument } from "@/app/actions";

/** Mirrors the server list — kept short because the server is the authority. */
const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv";

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "CUSTOM", label: "Document" },
  { value: "MASTER_SUBCONTRACTOR_AGREEMENT", label: "Master subcontract" },
  { value: "PROJECT_SUBCONTRACTOR_AGREEMENT", label: "Project agreement" },
  { value: "SUBCONTRACTOR_RATE_CARD", label: "Rate card" },
  { value: "CUSTOMER_CONTRACT", label: "Customer contract" },
  { value: "CHANGE_ORDER", label: "Change order" },
  { value: "PURCHASE_ORDER", label: "Purchase order" },
  { value: "WORK_AUTHORIZATION", label: "Work authorization" },
  { value: "INSURANCE_REQUEST", label: "Insurance" },
  { value: "W9_REQUEST", label: "W-9" },
  { value: "LIEN_WAIVER", label: "Lien waiver" },
  { value: "SAFETY_FORM", label: "Safety form" },
  { value: "NDA", label: "NDA" },
  { value: "VENDOR_AGREEMENT", label: "Vendor agreement" },
  { value: "EMPLOYMENT_DOCUMENT", label: "Employment" },
  { value: "CLOSEOUT", label: "Closeout" },
];

type Row = {
  id: string;
  file: File;
  state: "queued" | "uploading" | "saving" | "done" | "error";
  message?: string;
};

/**
 * Upload existing paperwork into the document centre.
 *
 * Files go straight from the browser to storage rather than through a server
 * action, because a scanned agreement routinely exceeds the request-body limit
 * and failing at 4.5 MB on a 40 MB contract would be a bad way to find out.
 * Only once the bytes have landed does the server create the document, its
 * first version and the audit entry — so a failed upload leaves no orphan
 * record behind.
 *
 * Each file is reported on individually. One bad file in a drop of ten should
 * not discard the other nine.
 */
export function DocumentUpload({
  projects,
  subcontractors,
}: {
  projects: { id: string; name: string; number: string }[];
  subcontractors: { id: string; company: string }[];
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [type, setType] = React.useState("CUSTOM");
  const [projectId, setProjectId] = React.useState("");
  const [subcontractorId, setSubcontractorId] = React.useState("");

  const busy = rows.some((r) => r.state === "uploading" || r.state === "saving");

  async function handle(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;

    const queued: Row[] = list.map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      file,
      state: "queued",
    }));
    setRows((prev) => [...queued, ...prev]);

    for (const row of queued) {
      const patch = (s: Partial<Row>) =>
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...s } : r)));

      try {
        patch({ state: "uploading" });
        const blob = await blobUpload(
          `documents/original_upload/${Date.now()}-${row.file.name}`,
          row.file,
          { access: "public", handleUploadUrl: "/api/blob/upload" },
        );

        patch({ state: "saving" });
        const res = await registerUploadedDocument({
          storageKey: blob.url,
          fileName: row.file.name,
          mime: row.file.type,
          sizeBytes: row.file.size,
          type,
          projectId: projectId || undefined,
          subcontractorId: subcontractorId || undefined,
        });

        if (res.ok) patch({ state: "done" });
        else patch({ state: "error", message: res.error });
      } catch (err) {
        patch({
          state: "error",
          message:
            err instanceof Error && err.message
              ? err.message
              : "Upload failed. Check the file and try again.",
        });
      }
    }

    router.refresh();
  }

  return (
    <Panel>
      <PanelHeader
        title="Upload documents"
        description="Contracts, agreements, insurance, W-9s — anything you already hold on paper"
        icon={<FileUp className="size-3.5" />}
      />
      <PanelBody className="flex flex-col gap-3">
        {/* Classify before dropping, so a batch lands filed rather than as a
            pile of "Document" to sort out later. */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Select label="Type" value={type} onChange={setType}>
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select label="Project (optional)" value={projectId} onChange={setProjectId}>
            <option value="">Not project-specific</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.number ? ` · ${p.number}` : ""}
              </option>
            ))}
          </Select>
          <Select
            label="Subcontractor (optional)"
            value={subcontractorId}
            onChange={setSubcontractorId}
          >
            <option value="">Not crew-specific</option>
            {subcontractors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.company}
              </option>
            ))}
          </Select>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handle(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "focus-ring cursor-pointer rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
            dragging
              ? "border-brand bg-brand/[0.06]"
              : "border-border/70 hover:border-brand/40 hover:bg-foreground/[0.02]",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              void handle(e.target.files);
              e.target.value = "";
            }}
          />
          <FileUp className="mx-auto size-5 text-muted-foreground/70" />
          <p className="mt-2 text-[13px] font-medium text-foreground">
            {busy ? "Uploading…" : "Drop files here, or click to choose"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            PDF, images, Word, Excel or CSV · up to 50 MB each
          </p>
        </div>

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2"
              >
                <StateIcon state={r.state} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-foreground">
                    {r.file.name}
                  </span>
                  {r.message ? (
                    <span className="block text-[11px] text-critical">{r.message}</span>
                  ) : (
                    <span className="block text-[11px] text-muted-foreground">
                      {(r.file.size / 1024 / 1024).toFixed(1)} MB · {LABEL[r.state]}
                    </span>
                  )}
                </span>
                {r.state === "done" || r.state === "error" ? (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                    className="focus-ring rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Dismiss"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

const LABEL: Record<Row["state"], string> = {
  queued: "Waiting",
  uploading: "Uploading",
  saving: "Filing",
  done: "Uploaded",
  error: "Failed",
};

function StateIcon({ state }: { state: Row["state"] }) {
  if (state === "done") return <CheckCircle2 className="size-4 shrink-0 text-success" />;
  if (state === "error") return <AlertTriangle className="size-4 shrink-0 text-critical" />;
  if (state === "queued") return <FileUp className="size-4 shrink-0 text-muted-foreground" />;
  return <Loader2 className="size-4 shrink-0 animate-spin text-brand-bright" />;
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-foreground/[0.03] px-2.5 text-[13px] text-foreground outline-none focus:border-brand/50"
      >
        {children}
      </select>
    </label>
  );
}
