"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload as blobUpload } from "@vercel/blob/client";
import {
  Camera,
  Compass,
  Download,
  ImageIcon,
  Loader2,
  MapPin,
  Signpost,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCoords } from "@/lib/exif";
import {
  deleteProjectPhoto,
  readPhotoExif,
  saveProjectPhoto,
  updateProjectPhoto,
} from "@/app/actions";
import type { ProjectPhotoRow } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * The field record: what was built, where, and when — plus the shots that tell
 * a crew where to go.
 *
 * One rule runs through the whole thing. A photo taken through the camera here
 * carries the device's own position, read at the moment of capture. A photo
 * chosen from the library was taken somewhere else at some other time, so its
 * location comes from the file's own EXIF or it has none — stamping it with
 * where the phone is now would put a coordinate on a record that never had
 * anything to do with the picture. Every tile says which it is, because a
 * timestamp nobody can account for is worse than no timestamp.
 */

const ACCEPT = "image/*,video/*";

/** Wait for a position fix, or give up cleanly. */
function getFix(timeoutMs = 12_000): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (p: GeolocationPosition | null) => {
      if (settled) return;
      settled = true;
      resolve(p);
    };
    navigator.geolocation.getCurrentPosition(
      (p) => done(p),
      // Denied, unavailable, or timed out — all mean "no location", and the
      // photo still saves. Blocking a field record on a GPS fix would lose the
      // photo, which is the thing that actually matters.
      () => done(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
    window.setTimeout(() => done(null), timeoutMs + 500);
  });
}

export function ProjectPhotos({
  projectId,
  photos,
  canDelete,
}: {
  projectId: string;
  photos: ProjectPhotoRow[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [purpose, setPurpose] = React.useState<"RECORD" | "DIRECTION">("RECORD");
  const [filter, setFilter] = React.useState<"ALL" | "RECORD" | "DIRECTION">("ALL");
  const [open, setOpen] = React.useState<ProjectPhotoRow | null>(null);

  const shown = photos.filter((p) => filter === "ALL" || p.purpose === filter);

  async function handle(file: File | undefined | null, source: "CAMERA" | "LIBRARY") {
    if (!file) return;
    setError(null);

    const isVideo = file.type.startsWith("video/");
    setBusy(source === "CAMERA" ? "Reading location…" : "Reading file…");

    let lat: number | null = null;
    let lng: number | null = null;
    let accuracyM: number | null = null;
    let locationSource = "";
    let capturedAt: string | null = null;
    let capturedAtSource = "";

    if (source === "CAMERA") {
      // Taken here, now: the device's position is the photo's position.
      const fix = await getFix();
      if (fix) {
        lat = fix.coords.latitude;
        lng = fix.coords.longitude;
        accuracyM = Number.isFinite(fix.coords.accuracy) ? fix.coords.accuracy : null;
        locationSource = "device";
      }
      capturedAt = new Date().toISOString();
      capturedAtSource = "camera";
    } else {
      // From the library: only the file can say where and when.
      if (!isVideo) {
        const fd = new FormData();
        fd.set("file", file);
        try {
          const facts = await readPhotoExif(fd);
          if (facts.ok) {
            if (facts.lat != null && facts.lng != null) {
              lat = facts.lat;
              lng = facts.lng;
              locationSource = "exif";
            }
            if (facts.capturedAt) {
              capturedAt = facts.capturedAt;
              capturedAtSource = "exif";
            }
          }
        } catch {
          // No EXIF is normal — phones strip it on share sheets. Carry on.
        }
      }
      if (!capturedAt && file.lastModified) {
        // Weaker, and labelled as such: the file's own modified time is often
        // the capture time, and is sometimes the time it was copied.
        capturedAt = new Date(file.lastModified).toISOString();
        capturedAtSource = "file";
      }
    }

    setBusy(`Uploading ${isVideo ? "video" : "photo"}…`);
    try {
      const blob = await blobUpload(`project-photos/${projectId}/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });

      const res = await saveProjectPhoto({
        projectId,
        url: blob.url,
        mediaType: file.type || "",
        sizeBytes: file.size,
        kind: isVideo ? "VIDEO" : "PHOTO",
        source,
        capturedAt,
        capturedAtSource,
        lat,
        lng,
        accuracyM,
        locationSource,
        purpose,
      });
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    } catch {
      setBusy(null);
      setError(
        "Upload failed. Blob storage needs to be connected for this environment — check Vercel → Storage.",
      );
    }
  }

  async function remove(id: string) {
    setBusy("Removing…");
    await deleteProjectPhoto(id);
    setBusy(null);
    setOpen(null);
    router.refresh();
  }

  const records = photos.filter((p) => p.purpose === "RECORD").length;
  const directions = photos.length - records;

  return (
    <Panel>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files?.[0], "CAMERA");
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void (async () => {
            for (const f of files) await handle(f, "LIBRARY");
          })();
        }}
      />

      <PanelHeader
        title="Project images"
        description="Timestamped, located field record — and the shots that show a crew where to go"
        count={photos.length}
        icon={<ImageIcon className="size-3.5" />}
      >
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={Boolean(busy)}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          Take photo
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={Boolean(busy)}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
        >
          <Upload className="size-3.5" /> Upload
        </button>
      </PanelHeader>

      {/* What the next capture is for. Set before shooting, because a crew in
          the field will not come back and reclassify forty photos. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-3 py-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          New shots are
        </span>
        <div className="flex rounded-lg border border-border p-0.5">
          <Toggle active={purpose === "RECORD"} onClick={() => setPurpose("RECORD")}>
            <Compass className="size-3" /> Record of work
          </Toggle>
          <Toggle active={purpose === "DIRECTION"} onClick={() => setPurpose("DIRECTION")}>
            <Signpost className="size-3" /> Direction for crew
          </Toggle>
        </div>

        {photos.length > 0 ? (
          <div className="ml-auto flex rounded-lg border border-border p-0.5">
            <Toggle active={filter === "ALL"} onClick={() => setFilter("ALL")}>
              All {photos.length}
            </Toggle>
            <Toggle active={filter === "RECORD"} onClick={() => setFilter("RECORD")}>
              Record {records}
            </Toggle>
            <Toggle active={filter === "DIRECTION"} onClick={() => setFilter("DIRECTION")}>
              Direction {directions}
            </Toggle>
          </div>
        ) : null}
      </div>

      {busy ? (
        <p className="border-b border-border/70 px-3 py-2 text-[12px] text-muted-foreground">
          <Loader2 className="mr-1.5 inline size-3 animate-spin" />
          {busy}
        </p>
      ) : null}
      {error ? (
        <p className="border-b border-border/70 px-3 py-2 text-[12px] text-critical">{error}</p>
      ) : null}

      {shown.length === 0 ? (
        <PanelBody className="py-10 text-center">
          <ImageIcon className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            {photos.length === 0
              ? "No images yet. Take a photo on site and it lands here with the time and place it was taken."
              : "Nothing in this view."}
          </p>
        </PanelBody>
      ) : (
        <ul className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setOpen(p)}
                className="focus-ring group/ph block w-full overflow-hidden rounded-lg border border-border/70 text-left transition hover:border-brand/40"
              >
                <span className="relative block aspect-[4/3] bg-foreground/[0.04]">
                  {p.kind === "VIDEO" ? (
                    <>
                      <video
                        src={p.url}
                        preload="metadata"
                        muted
                        playsInline
                        className="size-full object-cover"
                      />
                      <span className="absolute inset-0 grid place-items-center bg-black/25">
                        <Video className="size-6 text-white/90" />
                      </span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.url}
                      alt={p.caption || "Field photo"}
                      loading="lazy"
                      className="size-full object-cover transition group-hover/ph:scale-[1.02]"
                    />
                  )}
                  {p.purpose === "DIRECTION" ? (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-info/85 px-1.5 py-0.5 text-[9.5px] font-semibold text-white">
                      <Signpost className="size-2.5" /> Direction
                    </span>
                  ) : null}
                </span>
                <Stamp photo={p} compact />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <Lightbox
          photo={open}
          canDelete={canDelete}
          onClose={() => setOpen(null)}
          onDelete={() => void remove(open.id)}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </Panel>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition",
        active ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The stamp under every image: when, where, and how each was established.
 *
 * "Device GPS" and "from the file" are not the same claim, and a record that
 * presents them identically is one nobody can lean on in a dispute.
 */
function Stamp({ photo: p, compact }: { photo: ProjectPhotoRow; compact?: boolean }) {
  const when = p.capturedAt ? new Date(p.capturedAt) : null;
  const whenText = when
    ? when.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: compact ? undefined : "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "No timestamp";

  const whenNote =
    p.capturedAtSource === "camera"
      ? "taken in app"
      : p.capturedAtSource === "exif"
        ? "from the photo"
        : p.capturedAtSource === "file"
          ? "file date"
          : "";

  return (
    <span className="block px-2 py-1.5">
      <span className="num block text-[11px] font-medium text-foreground">{whenText}</span>
      {p.lat != null && p.lng != null ? (
        <span className="num mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
          <MapPin className="size-2.5 shrink-0" />
          {formatCoords(p.lat, p.lng)}
          {p.accuracyM != null ? ` ±${Math.round(p.accuracyM)}m` : ""}
        </span>
      ) : (
        <span className="mt-0.5 block text-[10.5px] text-muted-foreground/70">
          {p.source === "CAMERA" ? "Location unavailable" : "No location on file"}
        </span>
      )}
      {whenNote && !compact ? (
        <span className="mt-0.5 block text-[10.5px] text-muted-foreground/70">{whenNote}</span>
      ) : null}
      {p.caption ? (
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{p.caption}</span>
      ) : null}
    </span>
  );
}

function Lightbox({
  photo: p,
  canDelete,
  onClose,
  onDelete,
  onSaved,
}: {
  photo: ProjectPhotoRow;
  canDelete: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [caption, setCaption] = React.useState(p.caption);
  const [purpose, setPurpose] = React.useState(p.purpose);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    await updateProjectPhoto(p.id, { caption, purpose });
    setSaving(false);
    onSaved();
  }

  const mapHref =
    p.lat != null && p.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
          <p className="text-[12.5px] font-medium text-foreground">
            {p.kind === "VIDEO" ? "Video" : "Photo"}
            <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">
              {p.source === "CAMERA" ? "taken in app" : "uploaded"}
              {p.uploadedBy ? ` · ${p.uploadedBy}` : ""}
            </span>
          </p>
          <div className="flex items-center gap-1">
            <a
              href={p.url}
              download
              className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              <Download className="size-3" /> Download
            </a>
            {canDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] text-muted-foreground hover:border-critical/40 hover:text-critical"
              >
                <Trash2 className="size-3" /> Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="focus-ring grid size-7 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-black/40">
          {p.kind === "VIDEO" ? (
            <video src={p.url} controls playsInline className="mx-auto max-h-[60vh]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.url} alt={p.caption || "Field photo"} className="mx-auto max-h-[60vh]" />
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-border/70 p-3">
          <div className="min-w-[180px] flex-1">
            <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Caption
            </label>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What this shows"
              className="mt-0.5 w-full rounded-lg border border-border/70 bg-foreground/[0.03] px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-brand/60"
            />
          </div>
          <div>
            <label className="block text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Purpose
            </label>
            <div className="mt-0.5 flex rounded-lg border border-border p-0.5">
              <Toggle active={purpose === "RECORD"} onClick={() => setPurpose("RECORD")}>
                Record
              </Toggle>
              <Toggle active={purpose === "DIRECTION"} onClick={() => setPurpose("DIRECTION")}>
                Direction
              </Toggle>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Save
          </button>

          {/* The observed facts sit apart from the editable ones. Where and when
              are not opinions and are never retyped. */}
          <div className="w-full border-t border-border/40 pt-2">
            <Stamp photo={p} />
            {mapHref ? (
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                className="focus-ring mt-1 inline-flex items-center gap-1 rounded text-[11.5px] text-brand-bright hover:underline"
              >
                <MapPin className="size-3" /> Open in Maps
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
