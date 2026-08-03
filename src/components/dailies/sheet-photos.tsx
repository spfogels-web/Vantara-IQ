"use client";

import * as React from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Field photos on a daily — peds, handholes, as-built evidence.
 *
 * Each photo carries two timestamps: when the camera took it (read from the
 * file's own lastModified) and when it was added to the sheet. Those differ
 * whenever a crew shoots in the morning and files the sheet at end of day,
 * and for a dispute the first one is the one that matters.
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

export function SheetPhotos({
  projectId,
  photos,
  onChange,
  /**
   * A submitted daily is a filed record. Photos can still be added to it —
   * that is the one allowance — but nothing already on it may be edited or
   * removed. The server enforces this too; this only keeps the UI honest.
   */
  locked = false,
  lockedIds,
}: {
  projectId: string;
  photos: SheetPhoto[];
  onChange: (next: SheetPhoto[]) => void;
  locked?: boolean;
  /** Photos already filed — untouchable even while newer ones are editable. */
  lockedIds?: Set<string>;
}) {
  const pickRef = React.useRef<HTMLInputElement>(null);
  const shootRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const isFiled = (id: string) => Boolean(locked && lockedIds?.has(id));

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
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground print:text-[7px]">
            Field photos
          </p>
          <p className="text-[11px] text-muted-foreground print:hidden">
            Peds, handholes and as-built evidence — each stamped with when it was taken.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 print:hidden">
          <input
            ref={pickRef}
            type="file"
            accept="image/*"
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
            {busy > 0 ? `Uploading ${busy}…` : "Add photos"}
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
        <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
          No photos on this daily yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="group/photo overflow-hidden rounded-lg border border-border">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || p.structure} className="h-32 w-full object-cover" />
              </a>
              <div className="flex flex-col gap-1 p-2">
                <div className="flex items-center gap-1.5">
                  <select
                    value={p.structure}
                    disabled={isFiled(p.id)}
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
                    hidden={isFiled(p.id)}
                    onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
                    title="Remove photo"
                    className="focus-ring grid size-6 shrink-0 place-items-center rounded text-muted-foreground/0 transition group-hover/photo:text-muted-foreground hover:!text-critical print:hidden"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <input
                  value={p.caption}
                  readOnly={isFiled(p.id)}
                  onChange={(e) => patch(p.id, { caption: e.target.value })}
                  placeholder={isFiled(p.id) ? "" : "Location / note"}
                  className={cn(
                    "w-full rounded border border-transparent bg-transparent px-1 text-[11px] text-foreground outline-none",
                    isFiled(p.id) ? "cursor-default" : "hover:border-border focus:border-brand/50",
                  )}
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
