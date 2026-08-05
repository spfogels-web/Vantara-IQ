"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  MapPin,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { PHOTO_CATEGORIES, formatBytes, formatPhotoDate } from "@/lib/photos";
import { currentPosition } from "@/lib/image";
import { preparePhoto, storePhoto, type PreparedPhoto } from "@/lib/photo-upload";
import { createProjectPhotos } from "@/app/actions";
import type { PhotoCategory, PhotoVisibility, ProjectMapRef } from "@/lib/types";

/**
 * Adding photos from the field.
 *
 * Built for a supervisor holding a phone in one hand: "Take photo" opens the
 * camera directly, multiple files are the normal case rather than the special
 * one, and the batch fields at the top set category, work order and location for
 * every shot at once — because a crew photographing a road crossing is filing
 * eight photos of the same thing, and typing that eight times is how the
 * metadata ends up empty.
 *
 * Per-photo caption and category still override the batch, and each row shows
 * what was read off the file itself: capture time, and a GPS fix if the camera
 * recorded one.
 */

interface Row {
  key: string;
  prepared: PreparedPhoto;
  caption: string;
  category: PhotoCategory | "";
  /** Nominated as the project cover. At most one row can hold it. */
  cover: boolean;
  status: "ready" | "uploading" | "done" | "error";
  error?: string;
}

let seq = 0;

export function PhotoUploader({
  projectId,
  maps,
  workOrders,
  open,
  onClose,
}: {
  projectId: string;
  maps: ProjectMapRef[];
  workOrders: string[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [reading, setReading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Batch defaults, applied to any row that doesn't override them.
  const [category, setCategory] = React.useState<PhotoCategory>("construction_progress");
  const [visibility, setVisibility] = React.useState<PhotoVisibility>("internal");
  const [workOrderId, setWorkOrderId] = React.useState("");
  const [locationText, setLocationText] = React.useState("");
  const [mapId, setMapId] = React.useState<string>(maps.find((m) => m.isPrimary)?.id ?? "");
  const [geo, setGeo] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [geoBusy, setGeoBusy] = React.useState(false);

  // Object URLs are a finite resource; release them when the dialog closes.
  React.useEffect(() => {
    if (open) return;
    setRows((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.prepared.previewUrl));
      return [];
    });
    setError(null);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function addFiles(files: FileList | null) {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) return;
    setReading(true);
    setError(null);
    try {
      // EXIF read and thumbnail generation per file; sequential so a dozen
      // 12-megapixel decodes don't all hit the main thread at once.
      for (const file of picked) {
        const prepared = await preparePhoto(file);
        setRows((prev) => [
          ...prev,
          {
            key: `r${seq++}`,
            prepared,
            caption: "",
            category: "",
            cover: false,
            status: "ready",
          },
        ]);
      }
    } finally {
      setReading(false);
    }
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function remove(key: string) {
    setRows((prev) => {
      const row = prev.find((r) => r.key === key);
      if (row) URL.revokeObjectURL(row.prepared.previewUrl);
      return prev.filter((r) => r.key !== key);
    });
  }

  /** Only one photo can be the cover, so choosing one clears the rest. */
  function chooseCover(key: string) {
    setRows((prev) => prev.map((r) => ({ ...r, cover: r.key === key ? !r.cover : false })));
  }

  async function useMyLocation() {
    setGeoBusy(true);
    const pos = await currentPosition();
    setGeoBusy(false);
    if (!pos) {
      setError("Couldn't get a location fix. Check location permission for this site.");
      return;
    }
    setGeo(pos);
  }

  async function submit() {
    if (busy || rows.length === 0) return;
    setBusy(true);
    setError(null);

    const stored: {
      row: Row;
      storagePath: string;
      thumbnailPath: string;
    }[] = [];

    // Upload first, then write metadata in one call. A failed upload drops that
    // one photo and the rest of the batch still lands.
    for (const row of rows) {
      if (row.status === "done") continue;
      update(row.key, { status: "uploading", error: undefined });
      try {
        const res = await storePhoto(projectId, row.prepared);
        stored.push({ row, ...res });
        update(row.key, { status: "done" });
      } catch (e) {
        update(row.key, {
          status: "error",
          error: e instanceof Error && e.message ? e.message : "Upload failed.",
        });
      }
    }

    if (stored.length === 0) {
      setError("Nothing uploaded. See the errors on each photo.");
      setBusy(false);
      return;
    }

    const res = await createProjectPhotos(
      projectId,
      stored.map(({ row, storagePath, thumbnailPath }) => ({
        storagePath,
        thumbnailPath,
        caption: row.caption,
        photoCategory: row.category || category,
        workOrderId,
        projectMapId: mapId || null,
        locationText,
        // The camera's own fix wins; the device fix is the fallback for photos
        // that carry no GPS (screenshots, HEIC on some phones, re-saved files).
        latitude: row.prepared.latitude ?? geo?.latitude ?? null,
        longitude: row.prepared.longitude ?? geo?.longitude ?? null,
        takenAt: row.prepared.takenAt,
        visibility,
        fileName: row.prepared.file.name,
        mediaType: row.prepared.file.type,
        sizeBytes: row.prepared.file.size,
        width: row.prepared.width,
        height: row.prepared.height,
        makeCover: row.cover,
      })),
    );

    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  const anyError = rows.some((r) => r.status === "error");

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/70 p-0 backdrop-blur-sm sm:p-6">
      <div className="surface mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden sm:h-auto sm:max-h-full">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
            <ImagePlus className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-semibold leading-tight text-foreground">
              Add jobsite photos
            </h2>
            <p className="truncate text-[11.5px] text-muted-foreground">
              Capture time and GPS are read from each photo where the camera recorded them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="focus-ring rounded-lg p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Pick / capture */}
          <div className="grid grid-cols-2 gap-2 p-4">
            <label className="focus-ring flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-foreground/[0.02] px-3 py-3 text-[12.5px] font-medium text-muted-foreground hover:border-brand/50 hover:text-foreground">
              <Upload className="size-4" /> Choose photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {/* `capture` opens the camera straight away on a phone. */}
            <label className="focus-ring flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-foreground/[0.02] px-3 py-3 text-[12.5px] font-medium text-muted-foreground hover:border-brand/50 hover:text-foreground">
              <Camera className="size-4" /> Take photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {/* Batch fields */}
          <div className="grid grid-cols-1 gap-3 border-y border-border/60 bg-foreground/[0.02] p-4 sm:grid-cols-2">
            <Field label="Category (applies to all)">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PhotoCategory)}
                className={selectClass}
              >
                {PHOTO_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-muted-foreground/80">
                {PHOTO_CATEGORIES.find((c) => c.value === category)?.hint}
              </p>
            </Field>

            <Field label="Visibility">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as PhotoVisibility)}
                className={selectClass}
              >
                <option value="internal">Internal — Fortitude staff only</option>
                <option value="shared">Shared — crews on this project can see</option>
              </select>
              <p className="mt-1 text-[10.5px] text-muted-foreground/80">
                {visibility === "internal"
                  ? "Subcontractors will not see these photos."
                  : "The crews assigned to this project will see these photos."}
              </p>
            </Field>

            <Field label="Work order">
              <input
                value={workOrderId}
                onChange={(e) => setWorkOrderId(e.target.value)}
                list="vq-work-orders"
                placeholder="WO / exchange number"
                className={selectClass}
              />
              <datalist id="vq-work-orders">
                {workOrders.map((w) => (
                  <option key={w} value={w} />
                ))}
              </datalist>
            </Field>

            <Field label="Location on the job">
              <input
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="Sta 12+50, north side of Elm"
                className={selectClass}
              />
            </Field>

            {maps.length > 0 ? (
              <Field label="Map sheet">
                <select value={mapId} onChange={(e) => setMapId(e.target.value)} className={selectClass}>
                  <option value="">No map</option>
                  {maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.isPrimary ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="GPS fallback">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoBusy}
                className="focus-ring inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                {geoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />}
                {geo ? `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}` : "Use my location"}
              </button>
              <p className="mt-1 text-[10.5px] text-muted-foreground/80">
                Used only for photos with no GPS of their own.
              </p>
            </Field>
          </div>

          {/* Rows */}
          <div className="p-4">
            {reading ? (
              <p className="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Reading photos…
              </p>
            ) : null}

            {rows.length === 0 && !reading ? (
              <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                No photos picked yet. Choose several at once — captions and categories can be set per
                photo below.
              </p>
            ) : null}

            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <li
                  key={r.key}
                  className={cn(
                    "flex gap-3 rounded-lg border border-border/60 bg-foreground/[0.02] p-2",
                    r.status === "error" && "border-critical/40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.prepared.previewUrl}
                    alt=""
                    className="size-20 shrink-0 rounded-md object-cover"
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <input
                      value={r.caption}
                      onChange={(e) => update(r.key, { caption: e.target.value })}
                      placeholder="Caption — what this shows"
                      className="w-full rounded-md border border-foreground/[0.08] bg-foreground/[0.03] px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={r.category}
                        onChange={(e) => update(r.key, { category: e.target.value as PhotoCategory })}
                        className="rounded-md border border-foreground/[0.08] bg-foreground/[0.03] px-1.5 py-1 text-[11px] text-foreground focus:outline-none"
                      >
                        <option value="">Batch category</option>
                        {PHOTO_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => chooseCover(r.key)}
                        title="Use as the project cover"
                        className={cn(
                          "focus-ring inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-medium",
                          r.cover
                            ? "border-warning/40 bg-warning/15 text-warning"
                            : "border-foreground/[0.08] bg-foreground/[0.03] text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Star className={cn("size-3", r.cover && "fill-current")} /> Cover
                      </button>

                      <span className="num text-[10.5px] text-muted-foreground/80">
                        {formatPhotoDate(r.prepared.takenAt, false)} · {formatBytes(r.prepared.file.size)}
                        {r.prepared.latitude != null ? " · GPS" : ""}
                      </span>

                      <span className="ml-auto flex items-center gap-1">
                        {r.status === "uploading" ? (
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        ) : null}
                        {r.status === "done" ? <Check className="size-3.5 text-success" /> : null}
                        <button
                          type="button"
                          onClick={() => remove(r.key)}
                          disabled={busy}
                          className="focus-ring rounded p-1 text-muted-foreground hover:text-critical disabled:opacity-50"
                          aria-label="Remove"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    </div>
                    {r.error ? <p className="text-[11px] text-critical">{r.error}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-border/70 px-4 py-3">
          {error ? (
            <p className="min-w-0 flex-1 truncate text-[11.5px] text-critical">{error}</p>
          ) : (
            <p className="min-w-0 flex-1 text-[11.5px] text-muted-foreground">
              {rows.length > 0
                ? `${rows.length} photo${rows.length === 1 ? "" : "s"} ready${anyError ? " — some failed" : ""}`
                : "Originals are kept as uploaded; thumbnails are generated on this device."}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="focus-ring inline-flex h-9 items-center rounded-lg border border-foreground/[0.1] px-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || rows.length === 0}
            className="brand-gradient focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {busy ? "Uploading…" : `Upload${rows.length ? ` ${rows.length}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const selectClass =
  "h-9 w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col">
      <span className="eyebrow mb-1">{label}</span>
      {children}
    </label>
  );
}
