"use client";

import * as React from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { Camera, ImagePlus, Loader2, Trash2, FileText } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Field photos on a daily — peds, handholes, as-built evidence.
 *
 * Each photo is stamped with when it was attached to the sheet, not when the
 * camera took it — the picture is usually hours older than the filing, and the
 * submission time is the one that matters.
 */

export type SheetPhoto = {
  id: string;
  url: string;
  name: string;
  /** What the picture is of — this is what makes a wall of photos searchable. */
  structure: string;
  caption: string;
  /**
   * When it was attached to the sheet. Deliberately not the camera's capture
   * time: the photo was usually taken hours earlier, and the record that
   * matters is when it was filed.
   */
  addedAt: string;
};

const STRUCTURES = ["Ped", "Handhole", "Vault", "Bore pit", "Splice", "Other"];

/** Saved JSON comes back untyped — coerce rather than trust. */
export function parsePhotos(v: unknown): SheetPhoto[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    const p = (raw ?? {}) as Partial<SheetPhoto>;
    if (typeof p.url !== "string" || !p.url) return [];
    return [
      {
        id: typeof p.id === "string" ? p.id : p.url,
        url: p.url,
        name: typeof p.name === "string" ? p.name : "photo",
        structure: typeof p.structure === "string" ? p.structure : "Other",
        caption: typeof p.caption === "string" ? p.caption : "",
        addedAt: typeof p.addedAt === "string" ? p.addedAt : "",
      },
    ];
  });
}

function stamp(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}


/** Whether an attachment is a PDF rather than a photograph. */
function isPdf(url: string): boolean {
  const clean = url.split("?")[0].toLowerCase();
  return clean.endsWith(".pdf") || url.startsWith("data:application/pdf");
}

export function SheetPhotos({
  projectId,
  photos,
  onChange,
  title = "Field photos",
  hint = "Peds, handholes and as-built evidence — stamped with the time and place they were taken.",
  emptyTitle = "No photos on this daily yet",
  emptyHint = "Photograph what you built — peds, handholes, bores, restoration. This is the evidence behind the footage you are billing, and a daily without it is the one that gets queried.",
  accept = "image/*",
}: {
  projectId: string;
  photos: SheetPhoto[];
  onChange: (next: SheetPhoto[]) => void;
  /** Reused for the redline print, which is a different document with the
   *  same uploader — so the wording is a prop rather than baked in. Wrapping
   *  this component in another headed box printed two headers. */
  title?: string;
  hint?: string;
  emptyTitle?: string;
  emptyHint?: string;
  /**
   * What the file picker will take.
   *
   * Photos everywhere by default. The redline widens it to PDFs, because an
   * as-built often comes off a plotter or a scanner rather than a phone, and a
   * crew who has a proper PDF should not be made to photograph a screen.
   */
  accept?: string;
}) {
  // Whether this uploader takes a document as well as a photograph. Read off
  // the accept list rather than passed separately, so the button offered and
  // the file types allowed cannot drift apart.
  const takesPdf = accept.includes("pdf");

  const pickRef = React.useRef<HTMLInputElement>(null);
  const shootRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files);
    setBusy(list.length);

    const added: SheetPhoto[] = [];
    for (const file of list) {
      try {
        const blob = await blobUpload(
          `daily-photos/${projectId}/${Date.now()}-${file.name}`,
          file,
          { access: "public", handleUploadUrl: "/api/blob/upload" },
        );
        added.push({
          id: blob.url,
          url: blob.url,
          name: file.name,
          structure: "Ped",
          caption: "",
          addedAt: new Date().toISOString(),
        });
      } catch {
        setError(
          "Upload failed. Blob storage needs BLOB_READ_WRITE_TOKEN set in this environment.",
        );
        break;
      } finally {
        setBusy((n) => Math.max(0, n - 1));
      }
    }

    if (added.length) onChange([...photos, ...added]);
    setBusy(0);
  }

  const patch = (id: string, changes: Partial<SheetPhoto>) =>
    onChange(photos.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  return (
    <div className="border-t border-border">
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 transition-colors",
          // Amber while empty, quiet once there is evidence on the sheet. A
          // banner that never stops shouting stops being read.
          photos.length === 0 && "border-warning/30 bg-warning/[0.06] print:bg-transparent",
        )}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-foreground print:text-[8px]">
            {title}
            <span
              aria-hidden="true"
              className="text-[16px] font-black leading-none text-warning print:text-black"
            >
              *
            </span>
            {photos.length === 0 ? (
              <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[9.5px] font-bold tracking-normal text-warning print:hidden">
                REQUIRED
              </span>
            ) : (
              <span className="rounded bg-success/15 px-1.5 py-0.5 text-[9.5px] font-bold tracking-normal text-success print:hidden">
                {photos.length} ON FILE
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground print:hidden">
            {hint}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 print:hidden">
          <input
            ref={pickRef}
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={shootRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy > 0}
            onClick={() => pickRef.current?.click()}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-50"
          >
            {busy > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
            {busy > 0 ? `Uploading ${busy}…` : takesPdf ? "Add photos or PDF" : "Add photos"}
          </button>
          <button
            type="button"
            disabled={busy > 0}
            onClick={() => shootRef.current?.click()}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
          >
            <Camera className="size-3.5" /> Take photo
          </button>
        </div>
      </div>

      {error ? <p className="px-3 py-2 text-[11.5px] text-critical print:hidden">{error}</p> : null}

      {photos.length === 0 ? (
        <div className="flex w-full flex-col items-center gap-2 border-b border-dashed border-warning/40 bg-warning/[0.03] px-3 py-8 text-center print:hidden">
          <Camera className="size-7 text-warning" />
          <span className="text-[14px] font-semibold text-foreground">
            {emptyTitle}
          </span>
          <span className="max-w-sm text-[12px] text-muted-foreground">
            {emptyHint}
          </span>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={busy > 0}
              onClick={() => shootRef.current?.click()}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-warning px-3.5 text-[12.5px] font-semibold text-black hover:brightness-105 disabled:opacity-50"
            >
              <Camera className="size-3.5" /> Take a photo now
            </button>
            {/* The empty panel offered the camera and nothing else, so the one
                crew member holding a proper PDF as-built had no way in from
                the place that was asking them for it — the file picker was up
                in the header, labelled "Add photos". */}
            {takesPdf ? (
              <button
                type="button"
                disabled={busy > 0}
                onClick={() => pickRef.current?.click()}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-warning/50 px-3.5 text-[12.5px] font-semibold text-foreground hover:bg-warning/[0.1] disabled:opacity-50"
              >
                <FileText className="size-3.5" /> Upload PDF as-built
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="group/photo overflow-hidden rounded-lg border border-border">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                {isPdf(p.url) ? (
                  <span className="flex h-32 w-full flex-col items-center justify-center gap-1.5 bg-foreground/[0.04] text-muted-foreground">
                    <FileText className="size-7" />
                    <span className="text-[11.5px] font-medium">PDF as-built</span>
                    <span className="text-[10.5px]">Open</span>
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.caption || p.structure} className="h-32 w-full object-cover" />
                )}
              </a>
              <div className="flex flex-col gap-1 p-2">
                <div className="flex items-center gap-1.5">
                  <select
                    value={p.structure}
                    onChange={(e) => patch(p.id, { structure: e.target.value })}
                    className={cn(
                      "num h-6 flex-1 rounded border border-border bg-transparent px-1 text-[10.5px] font-semibold uppercase text-brand-bright outline-none",
                      "print:border-0 disabled:border-transparent disabled:opacity-100",
                    )}
                  >
                    {STRUCTURES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
                    title="Remove photo"
                    className="focus-ring grid size-6 shrink-0 place-items-center rounded text-muted-foreground/0 transition group-hover/photo:text-muted-foreground hover:!text-critical print:hidden"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <input
                  value={p.caption}
                  onChange={(e) => patch(p.id, { caption: e.target.value })}
                  placeholder="Location / note"
                  className="w-full rounded border border-transparent bg-transparent px-1 text-[11px] text-foreground outline-none hover:border-border focus:border-brand/50"
                />
                <p className="num px-1 text-[10px] text-muted-foreground">
                  {stamp(p.addedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
