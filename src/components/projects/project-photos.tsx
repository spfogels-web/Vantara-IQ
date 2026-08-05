"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  MapPin,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toneStyles } from "@/lib/tone";
import {
  CATEGORY_META,
  PHOTO_CATEGORIES,
  VISIBILITY_META,
  categoryLabel,
  formatBytes,
  formatCoordinates,
  formatPhotoDate,
  mapsLink,
  photoDateKey,
} from "@/lib/photos";
import {
  deleteProjectPhoto,
  setProjectCoverPhoto,
  setProjectPhotosVisibility,
  updateProjectPhoto,
} from "@/app/actions";
import { PhotoUploader } from "@/components/projects/photo-uploader";
import type {
  PhotoCategory,
  PhotoVisibility,
  ProjectMapRef,
  ProjectPhoto,
} from "@/lib/types";

/**
 * The Photos tab: the whole visual record of a job, filterable.
 *
 * Filtering runs in the browser over the set the server already handed us. A
 * project's photos number in the hundreds, not the millions, and five filter
 * controls that each cost a round trip make the panel feel broken — this way
 * every control is instant and they compose freely.
 *
 * What a subcontractor gets here is decided server-side: they are only ever sent
 * photos explicitly shared with them, so there is no client-side filter to
 * bypass and no "shared" toggle to see.
 */

const ALL = "__all__";

export function ProjectPhotos({
  projectId,
  photos,
  maps,
  workOrders,
  canManage,
  initialUploadOpen = false,
}: {
  projectId: string;
  photos: ProjectPhoto[];
  maps: ProjectMapRef[];
  workOrders: string[];
  canManage: boolean;
  /** Arrived from a card's "Upload photo" action — open the dialog straight away. */
  initialUploadOpen?: boolean;
}) {
  const [uploadOpen, setUploadOpen] = React.useState(initialUploadOpen);
  const [category, setCategory] = React.useState<string>(ALL);
  const [uploader, setUploader] = React.useState<string>(ALL);
  const [mapId, setMapId] = React.useState<string>(ALL);
  const [workOrder, setWorkOrder] = React.useState<string>(ALL);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [viewing, setViewing] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Only offer filter values that actually occur — an empty result from a
  // dropdown the data can never satisfy reads as a bug.
  const uploaders = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of photos) {
      if (p.uploadedBy) seen.set(p.uploadedBy, p.uploadedByName || "Unknown");
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [photos]);

  const usedCategories = React.useMemo(() => {
    const seen = new Set(photos.map((p) => p.photoCategory));
    return PHOTO_CATEGORIES.filter((c) => seen.has(c.value));
  }, [photos]);

  const usedWorkOrders = React.useMemo(() => {
    const seen = new Set<string>(workOrders);
    for (const p of photos) if (p.workOrderId) seen.add(p.workOrderId);
    return [...seen].sort();
  }, [photos, workOrders]);

  const filtered = React.useMemo(() => {
    return photos.filter((p) => {
      if (category !== ALL && p.photoCategory !== category) return false;
      if (uploader !== ALL && p.uploadedBy !== uploader) return false;
      if (mapId !== ALL && (p.projectMapId ?? "") !== (mapId === "__none__" ? "" : mapId)) return false;
      if (workOrder !== ALL && p.workOrderId !== workOrder) return false;
      const day = photoDateKey(p);
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      return true;
    });
  }, [photos, category, uploader, mapId, workOrder, from, to]);

  const filtersOn =
    category !== ALL || uploader !== ALL || mapId !== ALL || workOrder !== ALL || !!from || !!to;

  function reset() {
    setCategory(ALL);
    setUploader(ALL);
    setMapId(ALL);
    setWorkOrder(ALL);
    setFrom("");
    setTo("");
  }

  const viewingIndex = viewing ? filtered.findIndex((p) => p.id === viewing) : -1;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {/* Filters */}
      <div className="surface mb-3 flex flex-wrap items-end gap-2 p-3">
        <Filter label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            <option value={ALL}>All categories</option>
            {usedCategories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Filter>

        <Filter label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </Filter>
        <Filter label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </Filter>

        <Filter label="Uploaded by">
          <select value={uploader} onChange={(e) => setUploader(e.target.value)} className={inputClass}>
            <option value={ALL}>Anyone</option>
            {uploaders.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Filter>

        {maps.length > 0 ? (
          <Filter label="Map">
            <select value={mapId} onChange={(e) => setMapId(e.target.value)} className={inputClass}>
              <option value={ALL}>Any map</option>
              <option value="__none__">No map</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Filter>
        ) : null}

        {usedWorkOrders.length > 0 ? (
          <Filter label="Work order">
            <select value={workOrder} onChange={(e) => setWorkOrder(e.target.value)} className={inputClass}>
              <option value={ALL}>Any WO</option>
              {usedWorkOrders.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Filter>
        ) : null}

        <div className="ml-auto flex items-end gap-2">
          {filtersOn ? (
            <button
              type="button"
              onClick={reset}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-foreground/[0.1] px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" /> Clear
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="brand-gradient focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-white"
            >
              <ImagePlus className="size-4" /> Add photos
            </button>
          ) : null}
        </div>
      </div>

      {/* Bulk sharing — the one action worth doing to a dozen photos at once. */}
      {canManage && selected.size > 0 ? (
        <BulkBar
          projectId={projectId}
          ids={[...selected]}
          onDone={() => setSelected(new Set())}
        />
      ) : null}

      <p className="mb-2 text-[11.5px] text-muted-foreground">
        {filtered.length === photos.length
          ? `${photos.length} photo${photos.length === 1 ? "" : "s"}`
          : `${filtered.length} of ${photos.length} photos`}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          hasAny={photos.length > 0}
          canManage={canManage}
          onUpload={() => setUploadOpen(true)}
          onClear={reset}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((p) => (
            <li key={p.id}>
              <Tile
                photo={p}
                canManage={canManage}
                selected={selected.has(p.id)}
                onSelect={() => toggleSelected(p.id)}
                onOpen={() => setViewing(p.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {viewingIndex >= 0 ? (
        <Lightbox
          projectId={projectId}
          photo={filtered[viewingIndex]}
          maps={maps}
          canManage={canManage}
          hasPrev={viewingIndex > 0}
          hasNext={viewingIndex < filtered.length - 1}
          onPrev={() => setViewing(filtered[viewingIndex - 1]?.id ?? null)}
          onNext={() => setViewing(filtered[viewingIndex + 1]?.id ?? null)}
          onClose={() => setViewing(null)}
        />
      ) : null}

      {canManage ? (
        <PhotoUploader
          projectId={projectId}
          maps={maps}
          workOrders={usedWorkOrders}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
        />
      ) : null}
    </>
  );
}

/* -- Grid tile -------------------------------------------------------------- */

function Tile({
  photo: p,
  canManage,
  selected,
  onSelect,
  onOpen,
}: {
  photo: ProjectPhoto;
  canManage: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const meta = CATEGORY_META[p.photoCategory];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-foreground/[0.03]",
        selected ? "border-brand" : "border-border/60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        // Uniform 4:3 window with object-cover: portrait and landscape shots
        // sit on the same grid line without either being distorted.
        className="focus-ring block aspect-[4/3] w-full"
        aria-label={p.caption || `Photo ${categoryLabel(p.photoCategory)}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.thumbnailPath || p.storagePath}
          alt={p.caption || categoryLabel(p.photoCategory)}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25"
        />
      </button>

      {/* Category + state, top row */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5">
        <span
          className={cn(
            "rounded bg-black/60 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide backdrop-blur-sm",
            toneStyles[meta?.tone ?? "neutral"].text,
          )}
        >
          {categoryLabel(p.photoCategory)}
        </span>
        <span className="flex items-center gap-1">
          {p.isCoverImage ? (
            <span className="rounded bg-warning/90 p-1 text-[9px] font-semibold text-black" title="Project cover">
              <Star className="size-3 fill-current" />
            </span>
          ) : null}
          {p.visibility === "shared" ? (
            <span className="rounded bg-black/60 p-1 text-info backdrop-blur-sm" title="Shared with crews">
              <Eye className="size-3" />
            </span>
          ) : null}
        </span>
      </div>

      {/* Caption + date, bottom row */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-1.5">
        {p.caption ? (
          <p className="truncate text-[11px] font-medium text-white">{p.caption}</p>
        ) : null}
        <p className="num truncate text-[9.5px] text-white/70">
          {formatPhotoDate(p.takenAt ?? p.uploadedAt, false)}
          {p.latitude != null ? " · GPS" : ""}
        </p>
      </div>

      {/* Selection for bulk sharing. A checkbox, not a click-to-select tile —
          the tile's job is to open the photo. */}
      {canManage ? (
        <label
          className="absolute bottom-1.5 right-1.5 z-10 flex size-6 cursor-pointer items-center justify-center rounded-md bg-black/60 backdrop-blur-sm"
          title="Select"
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            className="size-3.5 accent-[var(--vq-blue)]"
          />
        </label>
      ) : null}
    </div>
  );
}

/* -- Bulk share bar --------------------------------------------------------- */

function BulkBar({
  projectId,
  ids,
  onDone,
}: {
  projectId: string;
  ids: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function apply(visibility: PhotoVisibility) {
    setBusy(true);
    await setProjectPhotosVisibility(projectId, ids, visibility);
    setBusy(false);
    onDone();
    router.refresh();
  }

  return (
    <div className="surface mb-3 flex flex-wrap items-center gap-2 p-2.5">
      <span className="num text-[12px] font-medium text-foreground">
        {ids.length} selected
      </span>
      <button
        type="button"
        onClick={() => apply("shared")}
        disabled={busy}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-info/30 bg-info/10 px-2.5 text-[12px] font-medium text-info hover:bg-info/15 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />} Share with crews
      </button>
      <button
        type="button"
        onClick={() => apply("internal")}
        disabled={busy}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-foreground/[0.1] px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <EyeOff className="size-3.5" /> Make internal
      </button>
      <button
        type="button"
        onClick={onDone}
        className="focus-ring ml-auto rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
        aria-label="Clear selection"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/* -- Lightbox --------------------------------------------------------------- */

function Lightbox({
  projectId,
  photo: p,
  maps,
  canManage,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: {
  projectId: string;
  photo: ProjectPhoto;
  maps: ProjectMapRef[];
  canManage: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  // A different photo is a different edit session.
  React.useEffect(() => {
    setEditing(false);
    setError(null);
  }, [p.id]);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? "That didn't work.");
      return;
    }
    router.refresh();
  }

  const coords = formatCoordinates(p.latitude, p.longitude);
  const mapLabel = maps.find((m) => m.id === p.projectMapId)?.label;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0b0d12]/95 backdrop-blur-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[12px] font-medium text-white/70 hover:text-white"
        >
          <X className="size-4" /> Close
        </button>
        <span className="max-w-[40ch] truncate text-[12.5px] font-semibold text-white/90">
          {p.caption || categoryLabel(p.photoCategory)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            className="focus-ring rounded-lg border border-white/10 p-1.5 text-white/70 hover:text-white disabled:opacity-30"
            aria-label="Previous photo"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="focus-ring rounded-lg border border-white/10 p-1.5 text-white/70 hover:text-white disabled:opacity-30"
            aria-label="Next photo"
          >
            <ChevronRight className="size-4" />
          </button>
          <a
            href={p.storagePath}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[12px] font-medium text-white/70 hover:text-white"
            title="Open the original file"
          >
            <Download className="size-3.5" /> Original
          </a>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* The photo. `object-contain` here — the lightbox is where you look at
            the whole frame, so nothing is cropped. */}
        <div className="relative min-h-0 flex-1 bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.storagePath}
            alt={p.caption || categoryLabel(p.photoCategory)}
            className="size-full object-contain"
          />
        </div>

        {/* Metadata */}
        <aside className="w-full shrink-0 overflow-y-auto border-t border-white/10 bg-white/[0.02] p-4 text-white lg:w-80 lg:border-l lg:border-t-0">
          {editing ? (
            <EditForm
              photo={p}
              maps={maps}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                router.refresh();
              }}
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    toneStyles[CATEGORY_META[p.photoCategory]?.tone ?? "neutral"].text,
                  )}
                >
                  {categoryLabel(p.photoCategory)}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium",
                    p.visibility === "shared" ? "text-info" : "text-white/60",
                  )}
                  title={VISIBILITY_META[p.visibility].hint}
                >
                  {p.visibility === "shared" ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                  {VISIBILITY_META[p.visibility].label}
                </span>
                {p.isCoverImage ? (
                  <span className="inline-flex items-center gap-1 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                    <Star className="size-3 fill-current" /> Cover
                  </span>
                ) : null}
              </div>

              <dl className="flex flex-col gap-2 text-[12px]">
                <Meta label="Taken" value={formatPhotoDate(p.takenAt)} />
                <Meta label="Uploaded" value={formatPhotoDate(p.uploadedAt)} />
                <Meta
                  label="Uploaded by"
                  value={`${p.uploadedByName || "Unknown"}${p.uploadedByRole ? ` · ${p.uploadedByRole}` : ""}`}
                />
                {p.locationText ? <Meta label="Location" value={p.locationText} /> : null}
                {p.workOrderId ? <Meta label="Work order" value={p.workOrderId} /> : null}
                {mapLabel ? <Meta label="Map sheet" value={mapLabel} /> : null}
                {coords ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-white/50">GPS</dt>
                    <dd className="min-w-0 text-right">
                      <a
                        href={mapsLink(p.latitude!, p.longitude!)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="num inline-flex items-center gap-1 text-brand-bright hover:underline"
                      >
                        <MapPin className="size-3" /> {coords}
                      </a>
                    </dd>
                  </div>
                ) : null}
                <Meta
                  label="File"
                  value={`${p.fileName || "photo"} · ${formatBytes(p.sizeBytes)}${
                    p.width && p.height ? ` · ${p.width}×${p.height}` : ""
                  }`}
                />
              </dl>

              {canManage ? (
                <div className="mt-4 flex flex-col gap-2">
                  {!p.isCoverImage ? (
                    <LightboxAction
                      onClick={() => run("cover", () => setProjectCoverPhoto(projectId, p.id))}
                      busy={busy === "cover"}
                      icon={<Star className="size-3.5" />}
                      label="Make this the project cover"
                    />
                  ) : null}
                  <LightboxAction
                    onClick={() =>
                      run("vis", () =>
                        setProjectPhotosVisibility(
                          projectId,
                          [p.id],
                          p.visibility === "shared" ? "internal" : "shared",
                        ),
                      )
                    }
                    busy={busy === "vis"}
                    icon={p.visibility === "shared" ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    label={p.visibility === "shared" ? "Make internal" : "Share with crews"}
                  />
                  <LightboxAction
                    onClick={() => setEditing(true)}
                    icon={<Pencil className="size-3.5" />}
                    label="Edit details"
                  />
                  <LightboxAction
                    onClick={() => {
                      if (!window.confirm("Delete this photo from the project record?")) return;
                      void run("del", async () => {
                        const res = await deleteProjectPhoto(p.id);
                        if (res.ok) onClose();
                        return res;
                      });
                    }}
                    busy={busy === "del"}
                    icon={<Trash2 className="size-3.5" />}
                    label="Delete photo"
                    danger
                  />
                </div>
              ) : null}

              {error ? <p className="mt-3 text-[11.5px] text-critical">{error}</p> : null}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-white/50">{label}</dt>
      <dd className="min-w-0 text-right text-white/90">{value}</dd>
    </div>
  );
}

function LightboxAction({
  onClick,
  busy,
  icon,
  label,
  danger,
}: {
  onClick: () => void;
  busy?: boolean;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "focus-ring inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-[12px] font-medium disabled:opacity-50",
        danger
          ? "border-critical/30 bg-critical/10 text-critical hover:bg-critical/20"
          : "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

/* -- Edit form -------------------------------------------------------------- */

function EditForm({
  photo: p,
  maps,
  onCancel,
  onSaved,
}: {
  photo: ProjectPhoto;
  maps: ProjectMapRef[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [caption, setCaption] = React.useState(p.caption);
  const [category, setCategory] = React.useState<PhotoCategory>(p.photoCategory);
  const [workOrderId, setWorkOrderId] = React.useState(p.workOrderId);
  const [locationText, setLocationText] = React.useState(p.locationText);
  const [mapId, setMapId] = React.useState(p.projectMapId ?? "");
  const [visibility, setVisibility] = React.useState<PhotoVisibility>(p.visibility);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateProjectPhoto(p.id, {
      caption,
      photoCategory: category,
      workOrderId,
      projectMapId: mapId || null,
      locationText,
      visibility,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't save that.");
      return;
    }
    onSaved();
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="eyebrow text-white/50">Edit photo</p>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-white/60">Caption</span>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} className={darkInput} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-white/60">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PhotoCategory)}
          className={darkInput}
        >
          {PHOTO_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value} className="bg-[#12151c]">
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-white/60">Work order</span>
        <input
          value={workOrderId}
          onChange={(e) => setWorkOrderId(e.target.value)}
          className={darkInput}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-white/60">Location</span>
        <input
          value={locationText}
          onChange={(e) => setLocationText(e.target.value)}
          className={darkInput}
        />
      </label>

      {maps.length > 0 ? (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-white/60">Map sheet</span>
          <select value={mapId} onChange={(e) => setMapId(e.target.value)} className={darkInput}>
            <option value="" className="bg-[#12151c]">
              No map
            </option>
            {maps.map((m) => (
              <option key={m.id} value={m.id} className="bg-[#12151c]">
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-white/60">Visibility</span>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as PhotoVisibility)}
          className={darkInput}
        >
          <option value="internal" className="bg-[#12151c]">
            Internal — staff only
          </option>
          <option value="shared" className="bg-[#12151c]">
            Shared — crews on this project
          </option>
        </select>
      </label>

      {error ? <p className="text-[11.5px] text-critical">{error}</p> : null}

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="brand-gradient focus-ring inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="focus-ring inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-[12.5px] font-medium text-white/70 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* -- Bits ------------------------------------------------------------------- */

const inputClass =
  "h-9 rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-2.5 text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40";

const darkInput =
  "h-9 w-full rounded-lg border border-white/10 bg-white/[0.06] px-2.5 text-[12.5px] text-white focus:outline-none focus:ring-2 focus:ring-brand/40";

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({
  hasAny,
  canManage,
  onUpload,
  onClear,
}: {
  hasAny: boolean;
  canManage: boolean;
  onUpload: () => void;
  onClear: () => void;
}) {
  return (
    <div className="surface grid place-items-center px-6 py-14 text-center">
      <div className="flex max-w-sm flex-col items-center gap-2">
        <span className="grid size-11 place-items-center rounded-xl bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
          <Camera className="size-5" />
        </span>
        <p className="text-[13.5px] font-semibold text-foreground">
          {hasAny ? "No photos match these filters" : "No photos on this project yet"}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {hasAny
            ? "Widen the date range or clear a filter to see the rest of the record."
            : canManage
              ? "Add the satellite overview and the first jobsite photos — ground conditions, locates and the starting location are the ones worth having before work begins."
              : "Nothing has been shared with your crew on this project yet."}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {hasAny ? (
            <button
              type="button"
              onClick={onClear}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-foreground/[0.1] px-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" /> Clear filters
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              onClick={onUpload}
              className="brand-gradient focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold text-white"
            >
              <ImagePlus className="size-4" /> Add photos
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
