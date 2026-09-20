"use client";

import * as React from "react";
import { useBlobUpload } from "@/components/layout/org-provider";
import { captureFacts, looksLikeVideo } from "@/components/evidence/capture";
import {
  EvidenceViewer,
  isVideo,
  type EvidenceItem,
} from "@/components/evidence/evidence-viewer";
import { noteEvidenceGap, saveDailyEvidence } from "@/app/evidence-actions";
import { Camera, ImagePlus, Loader2, Trash2, FileText, Video } from "lucide-react";

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
   *
   * Kept distinct from `capturedAt` below, which is the shutter. Collapsing
   * the two would date a morning's work to the evening it was filed.
   */
  addedAt: string;

  /**
   * The canonical evidence record this file became.
   *
   * The same blob, described once, visible on the daily and on the project.
   * Older entries have none — they pre-date the evidence record — and the
   * viewer copes with that rather than pretending otherwise.
   */
  evidenceId?: string;

  /** What the device or the file said, or nothing. Never filled in from elsewhere. */
  capturedAt?: string | null;
  capturedAtSource?: string;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  locationSource?: string;
  kind?: string;
  mediaType?: string;
  source?: string;
  uploadedBy?: string;
};

/**
 * A sheet entry as the shared evidence viewer sees it.
 *
 * The daily and the project are two windows onto the same record, so the daily
 * does not get its own idea of what a timestamp or a coordinate means — it
 * hands the same shape to the same component. Entries filed before the
 * evidence record existed simply have blanks here, and the viewer says so
 * rather than inventing anything.
 */
function asEvidence(
  photo: SheetPhoto,
  context: {
    subcontractorName?: string | null;
    workDate?: string | null;
    /**
     * The sheet this entry sits on, when it has been saved.
     *
     * Absent on a sheet that has never been saved, and the viewer says so —
     * a photograph taken against a draft is a field capture that is not yet
     * part of any filed day, and it should not read as one.
     */
    sheetId?: string | null;
  },
): EvidenceItem {
  return {
    id: photo.evidenceId ?? photo.id,
    url: photo.url,
    kind: photo.kind ?? "PHOTO",
    mediaType: photo.mediaType,
    caption: photo.caption,
    capturedAt: photo.capturedAt ?? null,
    capturedAtSource: photo.capturedAtSource ?? "",
    lat: photo.lat ?? null,
    lng: photo.lng ?? null,
    accuracyM: photo.accuracyM ?? null,
    locationSource: photo.locationSource ?? "",
    source: photo.source ?? "LIBRARY",
    uploadedBy: photo.uploadedBy ?? "",
    stage: "WORK_RECORD",
    structure: photo.structure,
    dailySheetId: context.sheetId ?? null,
    subcontractorName: context.subcontractorName ?? null,
    workDate: context.workDate ?? null,
  };
}

/** The tile. A video gets a poster frame rather than a broken image. */
function EvidenceThumb({ photo }: { photo: SheetPhoto }) {
  const item = asEvidence(photo, {});
  if (isVideo(item)) {
    return (
      <span className="relative block">
        <video
          src={photo.url}
          preload="metadata"
          muted
          playsInline
          className="h-32 w-full bg-black object-cover"
        />
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid size-8 place-items-center rounded-full bg-black/60 text-white">
            <Video className="size-4" />
          </span>
        </span>
      </span>
    );
  }
  return (
    // Blob-hosted and already sized by the phone that took it; next/image would
    // put a loader in front of a URL that is fine as it is.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo.url} alt={photo.caption || photo.structure} className="h-32 w-full object-cover" />
  );
}

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
        evidenceId: typeof p.evidenceId === "string" ? p.evidenceId : undefined,
        capturedAt: typeof p.capturedAt === "string" ? p.capturedAt : null,
        capturedAtSource: typeof p.capturedAtSource === "string" ? p.capturedAtSource : "",
        lat: typeof p.lat === "number" ? p.lat : null,
        lng: typeof p.lng === "number" ? p.lng : null,
        accuracyM: typeof p.accuracyM === "number" ? p.accuracyM : null,
        locationSource: typeof p.locationSource === "string" ? p.locationSource : "",
        kind: typeof p.kind === "string" ? p.kind : undefined,
        mediaType: typeof p.mediaType === "string" ? p.mediaType : undefined,
        source: typeof p.source === "string" ? p.source : undefined,
        uploadedBy: typeof p.uploadedBy === "string" ? p.uploadedBy : undefined,
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
  sheetId,
  subcontractorId,
  workDate,
}: {
  projectId: string;
  /**
   * The sheet this evidence belongs to, when it already exists.
   *
   * A crew photographing on a brand new sheet has no id yet — the sheet is
   * saved after the photographs are attached — so this is absent on the
   * first pass and the evidence is linked when the sheet is saved. The
   * record is never left guessing which daily it came from: it is either
   * told or linked.
   */
  sheetId?: string | null;
  subcontractorId?: string | null;
  /** The day the work was done, shown beside the evidence in the viewer. */
  workDate?: string | null;
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
  const blobUpload = useBlobUpload();
  // Whether this uploader takes a document as well as a photograph. Read off
  // the accept list rather than passed separately, so the button offered and
  // the file types allowed cannot drift apart.
  const takesPdf = accept.includes("pdf");

  const pickRef = React.useRef<HTMLInputElement>(null);
  const shootRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(0);
  /** Which entry is open in the evidence viewer, if any. */
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Take what the device and the file can honestly say, upload once, and make
   * it evidence.
   *
   * `source` is the difference between a photograph taken here and now — whose
   * position is the device's position — and one chosen from the library, which
   * was taken somewhere else and can only be described by its own EXIF. The two
   * must not be conflated: stamping a library photo with where the phone is
   * standing would put a coordinate on a record that never had one, and it
   * would look exactly like a real one.
   *
   * A refused location permission is not an error. The upload continues, the
   * record says it has no location, and the crew still files their day.
   */
  async function add(files: FileList | null, source: "CAMERA" | "LIBRARY" = "LIBRARY") {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files);
    setBusy(list.length);
    const added: SheetPhoto[] = [];
    for (const file of list) {
      try {
        const facts = await captureFacts(file, source);
        const isVid = looksLikeVideo(file);

        const blob = await blobUpload(
          `daily-photos/${projectId}/${Date.now()}-${file.name}`,
          file,
          { access: "public", handleUploadUrl: "/api/blob/upload" },
        );

        /**
         * The canonical record, written against the same blob the sheet is
         * about to reference. Not a second copy: the URL below is the one the
         * single upload above returned.
         */
        const saved = await saveDailyEvidence({
          projectId,
          dailySheetId: sheetId ?? null,
          subcontractorId: subcontractorId ?? null,
          url: blob.url,
          mediaType: file.type || "",
          sizeBytes: file.size,
          kind: isVid ? "VIDEO" : "PHOTO",
          source,
          capturedAt: facts.capturedAt,
          capturedAtSource: facts.capturedAtSource,
          lat: facts.lat,
          lng: facts.lng,
          accuracyM: facts.accuracyM,
          locationSource: facts.locationSource,
          structure: "Ped",
        }).catch(() => null);

        if (!saved?.ok) {
          /**
           * The file is in Blob and the record is not. The photograph stays on
           * the sheet — losing it would be the worse failure — but the two
           * stores now disagree, and that has to be findable. The URL goes with
           * the note so the record can be rebuilt from the file that is already
           * there, without anybody re-uploading anything.
           */
          void noteEvidenceGap({
            projectId,
            url: blob.url,
            reason: saved === null ? "action failed" : "action refused",
          }).catch(() => undefined);
        }

        added.push({
          id: blob.url,
          url: blob.url,
          name: file.name,
          structure: "Ped",
          caption: "",
          addedAt: new Date().toISOString(),
          evidenceId: saved?.ok ? saved.id : undefined,
          capturedAt: facts.capturedAt,
          capturedAtSource: facts.capturedAtSource,
          lat: facts.lat,
          lng: facts.lng,
          accuracyM: facts.accuracyM,
          locationSource: facts.locationSource,
          kind: isVid ? "VIDEO" : "PHOTO",
          mediaType: file.type || "",
          source,
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
              void add(e.target.files, "CAMERA");
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
              {/* A PDF as-built opens in a tab; a photograph or video opens in
                  the evidence viewer, which is the same one the project
                  gallery uses — so what the office sees on a daily and what it
                  sees on the project cannot drift apart. */}
              <button
                type="button"
                onClick={() => (isPdf(p.url) ? window.open(p.url, "_blank") : setOpenId(p.id))}
                className="focus-ring block w-full text-left"
              >
                {isPdf(p.url) ? (
                  <span className="flex h-32 w-full flex-col items-center justify-center gap-1.5 bg-foreground/[0.04] text-muted-foreground">
                    <FileText className="size-7" />
                    <span className="text-[11.5px] font-medium">PDF as-built</span>
                    <span className="text-[10.5px]">Open</span>
                  </span>
                ) : (
                   
                  <EvidenceThumb photo={p} />
                )}
              </button>
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

      {/* The same viewer the project gallery opens. One implementation, so
          what the office sees on a daily and on the project cannot drift. */}
      {openId
        ? (() => {
            const photo = photos.find((x) => x.id === openId);
            if (!photo) return null;
            return (
              <EvidenceViewer
                item={asEvidence(photo, { subcontractorName: null, workDate, sheetId })}
                onClose={() => setOpenId(null)}
              />
            );
          })()
        : null}
    </div>
  );
}
