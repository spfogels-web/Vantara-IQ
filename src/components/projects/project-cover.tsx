"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  ImagePlus,
  Images,
  Loader2,
  Map as MapIcon,
  Maximize2,
  Satellite,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { COVER_SOURCE_LABEL, categoryLabel, formatPhotoDate } from "@/lib/photos";
import { preparePhoto, storePhoto } from "@/lib/photo-upload";
import { createProjectPhotos } from "@/app/actions";
import type { ProjectCover as Cover } from "@/lib/types";

/**
 * The image a project leads with, on the card and on the detail page.
 *
 * What it paints is decided upstream in `resolveProjectCover` — the chosen
 * cover, else the newest jobsite photo, else the satellite overview, else a
 * raster map — so a project looks the same everywhere it appears. When none of
 * those exist this draws a real placeholder with a way to fix it, rather than
 * the "PDF map attached" dead end that used to leave half the cards blank.
 *
 * Two structural rules earn their keep here:
 *
 *   1. The image is always `object-cover` inside a fixed aspect ratio, so a
 *      portrait phone photo and a wide aerial crop to the same shape instead of
 *      stretching. Cards stay on a grid line.
 *   2. Nothing in here is a `<button>` nested inside the card's link — the card
 *      wraps its own stretched anchor and these actions sit above it. A button
 *      inside an anchor is invalid, and browsers resolve it by swallowing one of
 *      the two click targets.
 */

export interface ProjectCoverProps {
  projectId: string;
  projectNumber: string;
  cover: Cover | null;
  /** How many photos this viewer can see — drives the Photos badge. */
  photoCount?: number;
  /** Whether a map exists to link to at all. */
  hasMap?: boolean;
  /** Supervisor / PM / admin. Gates uploading and choosing a cover. */
  canManage?: boolean;
  /** `card` is the compact 16:9 banner; `hero` is the taller detail header. */
  variant?: "card" | "hero";
  className?: string;
}

export function ProjectCover({
  projectId,
  projectNumber,
  cover,
  photoCount = 0,
  hasMap = false,
  canManage = false,
  variant = "card",
  className,
}: ProjectCoverProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hero = variant === "hero";
  const photosHref = `/projects/${projectId}?tab=photos`;
  const uploadHref = `${photosHref}&upload=1`;

  /**
   * Dropping an image straight onto the cover is the fastest path from "this
   * project has no face" to one that does, so it files a real gallery photo and
   * promotes it — not a second, parallel notion of a cover photo.
   */
  async function accept(file: File | undefined) {
    if (!file || busy || !canManage) return;
    if (!file.type.startsWith("image/")) {
      setError("That's not an image.");
      return;
    }
    setBusy(true);
    setError(null);

    let previewUrl: string | null = null;
    try {
      const prepared = await preparePhoto(file);
      previewUrl = prepared.previewUrl;
      const stored = await storePhoto(projectId, prepared);
      const res = await createProjectPhotos(projectId, [
        {
          ...stored,
          photoCategory: "other",
          takenAt: prepared.takenAt,
          latitude: prepared.latitude,
          longitude: prepared.longitude,
          width: prepared.width,
          height: prepared.height,
          fileName: file.name,
          mediaType: file.type,
          sizeBytes: file.size,
          makeCover: true,
        },
      ]);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Upload failed.");
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={
        canManage
          ? (e) => {
              e.preventDefault();
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={canManage ? () => setDragging(false) : undefined}
      onDrop={
        canManage
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              void accept(e.dataTransfer.files?.[0]);
            }
          : undefined
      }
      className={cn(
        // One ratio for every cover. Cropping happens inside it, so no image is
        // ever stretched to fit and the grid keeps its rhythm.
        "group/cover relative w-full overflow-hidden bg-foreground/[0.03]",
        hero
          ? "aspect-[16/9] rounded-2xl border border-border/60 sm:aspect-[21/9]"
          : "aspect-[16/9] border-b border-border/60",
        dragging && "ring-2 ring-inset ring-brand",
        className,
      )}
    >
      {canManage ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      ) : null}

      {cover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.thumbUrl}
            alt={cover.caption || "Project cover"}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover/cover:scale-[1.03]"
          />
          {/* Dark gradient: the badges and controls sit on top of a photo of
              unknown brightness, and a scrim is what keeps white text legible
              over a noon aerial as well as a night shot. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/40"
          />
        </>
      ) : (
        <CoverPlaceholder hasMap={hasMap} hero={hero} />
      )}

      {/* Top row: job number, and what the image actually is. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
        <span className="num rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          {projectNumber || "—"}
        </span>
        {cover ? (
          <span className="inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
            {cover.source === "overview" || cover.source === "map" ? (
              <Satellite className="size-3" />
            ) : (
              <Camera className="size-3" />
            )}
            {cover.photoCategory && cover.source !== "map"
              ? categoryLabel(cover.photoCategory)
              : COVER_SOURCE_LABEL[cover.source]}
          </span>
        ) : null}
      </div>

      {/* Bottom row: caption and date on the left, quick actions on the right. */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
        <div className="pointer-events-none min-w-0">
          {cover?.caption ? (
            <p className={cn("truncate font-medium text-white", hero ? "text-[13px]" : "text-[11.5px]")}>
              {cover.caption}
            </p>
          ) : null}
          {cover?.takenAt ? (
            <p className="num truncate text-[10px] text-white/70">
              {formatPhotoDate(cover.takenAt, false)}
            </p>
          ) : null}
        </div>

        {/* Always reachable on touch, revealed on hover with a pointer. */}
        <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/cover:opacity-100 md:focus-within:opacity-100">
          <CoverAction href={`/projects/${projectId}`} label="View project" hero={hero}>
            <Maximize2 className="size-3.5" />
          </CoverAction>
          {hasMap ? (
            <CoverAction href={`/projects/${projectId}#project-map`} label="View map" hero={hero}>
              <MapIcon className="size-3.5" />
            </CoverAction>
          ) : null}
          <CoverAction href={photosHref} label="Photos" hero={hero} count={photoCount}>
            <Images className="size-3.5" />
          </CoverAction>
          {canManage ? (
            <CoverAction href={uploadHref} label="Upload photo" hero={hero}>
              <ImagePlus className="size-3.5" />
            </CoverAction>
          ) : null}
        </div>
      </div>

      {/* The empty state gets one obvious action instead of four subtle ones. */}
      {!cover && canManage ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="focus-ring absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg bg-white/10 px-3 py-2 text-[12px] font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-sm transition-colors hover:bg-white/20 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          {busy ? "Uploading…" : "Upload cover"}
        </button>
      ) : null}

      {/* With a cover present, replacing it stays available but recessive. */}
      {cover && canManage ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title="Replace cover image"
          className="focus-ring absolute left-1/2 top-1/2 z-20 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg bg-black/55 px-2.5 py-1.5 text-[11.5px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 group-hover/cover:opacity-100 focus-visible:opacity-100"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          {busy ? "Uploading…" : "Replace"}
        </button>
      ) : null}

      {error ? (
        <p className="absolute inset-x-0 bottom-0 z-20 bg-critical/90 px-2 py-1 text-[10.5px] text-white">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Quick action. A link rather than a button so it nests legally inside a card
 * that is itself a link, and so middle-click and "open in new tab" work.
 */
function CoverAction({
  href,
  label,
  count,
  hero,
  children,
}: {
  href: string;
  label: string;
  count?: number;
  hero: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      // Above the card's stretched link, or the card swallows the click.
      className="focus-ring relative z-20 inline-flex h-7 items-center gap-1.5 rounded-lg bg-black/55 px-2 text-[11px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/75"
    >
      {children}
      {hero ? <span>{label}</span> : null}
      {typeof count === "number" && count > 0 ? <span className="num">{count}</span> : null}
    </Link>
  );
}

/**
 * No image yet. A deliberate gradient in the brand's blue→violet band reads as
 * designed rather than broken — and it says which of the two things is missing,
 * because "no photos" and "the map is a PDF we can't draw" need different fixes.
 */
function CoverPlaceholder({ hasMap, hero }: { hasMap: boolean; hero: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(80%_140%_at_50%_-20%,color-mix(in_oklab,var(--vq-blue)_22%,transparent),transparent_70%),radial-gradient(60%_100%_at_100%_100%,color-mix(in_oklab,var(--vq-violet)_16%,transparent),transparent_70%)]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:28px_28px]"
      />
      <div className={cn("relative flex flex-col items-center", hero ? "gap-1.5" : "gap-1")}>
        <MapIcon className={cn("text-white/45", hero ? "size-7" : "size-5")} strokeWidth={1.6} />
        <p className={cn("font-medium text-white/70", hero ? "text-[12.5px]" : "text-[11px]")}>
          {hasMap ? "Map is a PDF — add a jobsite photo" : "No photos yet"}
        </p>
      </div>
    </div>
  );
}
