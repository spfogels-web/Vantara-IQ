"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, FileUp, Loader2, Pencil, Sparkles, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { extractRateDocument, renameRateImport } from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";

const DOC_TYPES = [
  { value: "GC_RATE_SHEET", label: "GC / customer rate sheet" },
  { value: "UNIT_DESCRIPTION", label: "Unit-description sheet" },
  { value: "MATERIAL_LIST", label: "Project material list" },
  { value: "SUB_RATE_CARD", label: "Subcontractor rate card" },
];

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "critical" | "neutral"> = {
  PROCESSING: "info",
  EXTRACTED: "warning",
  APPROVED: "success",
  REJECTED: "neutral",
  FAILED: "critical",
};

export type ImportRow = {
  id: string;
  docType: string;
  /** The file as it arrived. Always kept. */
  fileName: string;
  /** What the office calls it, when somebody has said. */
  displayName: string;
  status: string;
  summary: string;
  rowCount: number;
  createdAt: string;
};

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

export function RateImportView({
  imports,
  configured,
}: {
  imports: ImportRow[];
  configured: boolean;
}) {
  const router = useRouter();
  const [docType, setDocType] = React.useState(DOC_TYPES[0].value);
  const [file, setFile] = React.useState<File | null>(null);
  const [displayName, setDisplayName] = React.useState("");
  const [customer, setCustomer] = React.useState("");
  const [market, setMarket] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("docType", docType);
    fd.set("displayName", displayName);
    fd.set("customer", customer);
    fd.set("market", market);
    const res = await extractRateDocument(fd);
    setBusy(false);
    if (res.ok) {
      setDisplayName("");
      router.push(`/rate-import/${res.id}`);
    }
    else {
      setError(res.error ?? "Extraction failed");
      if (res.id) router.push(`/rate-import/${res.id}`);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className="lg:col-span-5 xl:col-span-4">
        <Panel>
          <PanelHeader
            title="Upload a document"
            description="Claude extracts structured rows for your review"
            icon={<Sparkles className="size-3.5 text-brand-bright" />}
          />
          <PanelBody>
            {!configured ? (
              <div className="mb-3 rounded-lg border border-warning/25 bg-warning/[0.08] px-3 py-2.5 text-[12px] text-warning">
                Claude AI isn&apos;t connected yet. Add an API key on the{" "}
                <Link href="/integrations" className="underline">Integrations</Link> page to enable extraction.
              </div>
            ) : null}
            <form onSubmit={submit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-muted-foreground">Document type</span>
                <select value={docType} onChange={(e) => setDocType(e.target.value)} className={cn(inputClass, "appearance-none")}>
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </label>

              {/* What to call it.
                  Files arrive named things like
                  "Fortitude_A85311_EA_24042_08012026.xls (1)-compressed.pdf",
                  and a list of twenty-five of those is unreadable. Optional —
                  left blank, the file name stands in as it always did. */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-muted-foreground">
                  Name it (optional)
                </span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={file ? file.name : "Trawick S Georgia rates"}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-muted-foreground">File (PDF, image, XLSX, or CSV)</span>
                <label className="focus-ring flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-foreground/[0.14] bg-foreground/[0.02] px-3 py-4 text-[12.5px] text-muted-foreground hover:bg-foreground/[0.04]">
                  <FileUp className="size-4 shrink-0" />
                  <span className="truncate">{file ? file.name : "Choose a file…"}</span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.txt"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] font-medium text-muted-foreground">Customer (optional)</span>
                  <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Windstream" className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] font-medium text-muted-foreground">Market (optional)</span>
                  <input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Georgia" className={inputClass} />
                </label>
              </div>

              {error ? <p className="text-[12px] text-critical">{error}</p> : null}

              <Button
                type="submit"
                disabled={!file || busy}
                className="brand-gradient h-10 gap-1.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {busy ? <><Loader2 className="size-4 animate-spin" /> Extracting…</> : <><Upload className="size-4" /> Extract with Claude</>}
              </Button>
              <p className="text-center text-[10.5px] text-muted-foreground/70">
                AI extracts and scores confidence. Nothing activates until you approve it.
              </p>
            </form>
          </PanelBody>
        </Panel>
      </div>

      <div className="lg:col-span-7 xl:col-span-8">
        <Panel>
          <PanelHeader title="Recent imports" count={imports.length} icon={<FileUp className="size-3.5" />} />
          {imports.length === 0 ? (
            <PanelBody className="py-10 text-center text-[12.5px] text-muted-foreground">
              No imports yet. Upload a rate sheet, unit-description sheet, material list, or rate card to get started.
            </PanelBody>
          ) : (
            <ul className="p-2">
              {imports.map((imp) => (
                <li key={imp.id}>
                  <ImportRowItem imp={imp} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}


/**
 * One import in the list, renameable where it sits.
 *
 * The row is a link to the review screen, so the rename controls stop the
 * click going through — a pencil that navigates instead of editing is worse
 * than no pencil. Editing swaps the link for a field rather than opening a
 * dialog: it is one short string and a dialog for it is ceremony.
 */
function ImportRowItem({ imp }: { imp: ImportRow }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(imp.displayName || "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const shown = imp.displayName || imp.fileName;

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await renameRateImport(imp.id, name);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-foreground/[0.03] px-2.5 py-2.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={imp.fileName}
          aria-label="Name this import"
          className="focus-ring h-8 min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setName(imp.displayName || "");
            setEditing(false);
          }}
          className="focus-ring h-8 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground"
        >
          Cancel
        </button>
        {/* Clearing the name puts the file name back, so a rename is undoable
            without anybody having written the original down. */}
        {imp.displayName ? (
          <button
            type="button"
            onClick={() => {
              setName("");
              void (async () => {
                setBusy(true);
                await renameRateImport(imp.id, "");
                setBusy(false);
                setEditing(false);
                router.refresh();
              })();
            }}
            className="focus-ring h-8 rounded-lg px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            Use the file name
          </button>
        ) : null}
        {error ? <span className="w-full text-[11.5px] text-critical">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="group/imp flex items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-foreground/[0.03]">
      <Link href={`/rate-import/${imp.id}`} className="focus-ring min-w-0 flex-1 rounded">
        <p className="truncate text-[12.5px] font-medium text-foreground">{shown}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {DOC_TYPES.find((d) => d.value === imp.docType)?.label ?? imp.docType}
          {imp.summary ? ` · ${imp.summary}` : ""}
        </p>
        {/* The real file, once it is no longer the name on the row. Somebody
            tracing a document back needs what it was actually called. */}
        {imp.displayName ? (
          <p className="truncate text-[10.5px] text-muted-foreground/60">{imp.fileName}</p>
        ) : null}
      </Link>

      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Rename ${shown}`}
        title="Rename"
        className="focus-ring grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 transition hover:text-foreground focus:opacity-100 group-hover/imp:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>

      <span className="num shrink-0 text-[11.5px] text-muted-foreground">{imp.rowCount} rows</span>
      <StatusPill label={imp.status} tone={STATUS_TONE[imp.status] ?? "neutral"} dot={false} className="shrink-0 text-[10px]" />
    </div>
  );
}
