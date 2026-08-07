"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload as blobUpload } from "@vercel/blob/client";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { registerUploadedDocument } from "@/app/actions";

/**
 * Upload a document against one crew — their signed rate card, a countersigned
 * agreement, a certificate.
 *
 * Whatever lands here is filed to this subcontractor, which is also what makes
 * it appear in their own portal: the crew sees documents addressed to their
 * company. So uploading the signed rates here is the same action as delivering
 * them, rather than a second step somebody forgets.
 */
const TYPES = [
  { value: "SUBCONTRACTOR_RATE_CARD", label: "Signed rate card" },
  { value: "MASTER_SUBCONTRACTOR_AGREEMENT", label: "Signed master agreement" },
  { value: "PROJECT_SUBCONTRACTOR_AGREEMENT", label: "Project agreement" },
  { value: "INSURANCE_REQUEST", label: "Certificate of insurance" },
  { value: "W9_REQUEST", label: "W-9" },
  { value: "LIEN_WAIVER", label: "Lien waiver" },
  { value: "CUSTOM", label: "Other document" },
];

export function SubFileUpload({
  subcontractorId,
  company,
}: {
  subcontractorId: string;
  company: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [type, setType] = React.useState("SUBCONTRACTOR_RATE_CARD");
  const [state, setState] = React.useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  async function accept(file: File | undefined) {
    if (!file || state === "busy") return;
    setState("busy");
    setMessage(null);

    try {
      const blob = await blobUpload(
        `documents/original_upload/${subcontractorId}/${Date.now()}-${file.name}`,
        file,
        { access: "public", handleUploadUrl: "/api/blob/upload" },
      );

      const res = await registerUploadedDocument({
        storageKey: blob.url,
        fileName: file.name,
        mime: file.type,
        sizeBytes: file.size,
        type,
        subcontractorId,
        title: `${TYPES.find((t) => t.value === type)?.label ?? "Document"} — ${company}`,
      });

      if (res.ok) {
        setState("done");
        setMessage("Uploaded and shared with this crew's portal.");
        router.refresh();
      } else {
        setState("error");
        setMessage(res.error ?? "Could not file that document.");
      }
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error && err.message ? err.message : "Upload failed.");
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Upload for this crew"
        description="Signed rates, agreements and certificates — visible in their portal straight away"
        icon={<FileUp className="size-3.5" />}
      />
      <PanelBody className="flex flex-col gap-2.5">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Document type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-foreground/[0.03] px-2.5 text-[12.5px] text-foreground outline-none focus:border-brand/50"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void accept(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "focus-ring cursor-pointer rounded-xl border border-dashed px-3 py-6 text-center transition-colors",
            dragging
              ? "border-brand bg-brand/[0.06]"
              : "border-border/70 hover:border-brand/40 hover:bg-foreground/[0.02]",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              void accept(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {state === "busy" ? (
            <Loader2 className="mx-auto size-5 animate-spin text-brand-bright" />
          ) : (
            <FileUp className="mx-auto size-5 text-muted-foreground/70" />
          )}
          <p className="mt-2 text-[12.5px] font-medium text-foreground">
            {state === "busy" ? "Uploading…" : "Drop a file, or click to choose"}
          </p>
        </div>

        {message ? (
          <p
            className={cn(
              "flex items-start gap-1.5 text-[11.5px]",
              state === "error" ? "text-critical" : "text-success",
            )}
          >
            {state === "error" ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            )}
            {message}
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
