import { isRasterMap } from "@/lib/project-image";
import type {
  PhotoCategory,
  PhotoVisibility,
  Project,
  ProjectCover,
  ProjectPhoto,
  Tone,
} from "@/lib/types";

/**
 * Photo vocabulary shared by the server (mapping Prisma enums) and the client
 * (filters, badges, the uploader). Plain data only — no React, no Prisma — so
 * both sides can import it.
 */

export interface CategoryMeta {
  value: PhotoCategory;
  label: string;
  /** Shown under the label in the uploader's category picker. */
  hint: string;
  tone: Tone;
}

/** Display order is the order work actually happens in on a jobsite. */
export const PHOTO_CATEGORIES: CategoryMeta[] = [
  { value: "overview", label: "Overview", hint: "Satellite or map view of the job", tone: "info" },
  { value: "starting_location", label: "Starting location", hint: "Where the first work happens", tone: "info" },
  { value: "ground_conditions", label: "Ground conditions", hint: "Surface, soil, existing damage", tone: "neutral" },
  { value: "paint_and_locates", label: "Paint & locates", hint: "Markings and utility locate flags", tone: "warning" },
  { value: "construction_progress", label: "Construction progress", hint: "Active work in the ground", tone: "success" },
  { value: "road_crossing", label: "Road crossing", hint: "Road, driveway and sidewalk crossings", tone: "warning" },
  { value: "equipment", label: "Equipment", hint: "Equipment staging and on-site machines", tone: "neutral" },
  { value: "materials", label: "Materials", hint: "Material staging and deliveries", tone: "neutral" },
  { value: "issue", label: "Issue", hint: "Damage, conflict or anything to escalate", tone: "critical" },
  { value: "restoration", label: "Restoration", hint: "Backfill, seed, sod, concrete and asphalt", tone: "success" },
  { value: "closeout", label: "Closeout", hint: "Final condition for the closeout package", tone: "success" },
  { value: "other", label: "Other", hint: "Anything that doesn't fit the list", tone: "neutral" },
];

export const CATEGORY_META: Record<PhotoCategory, CategoryMeta> = Object.fromEntries(
  PHOTO_CATEGORIES.map((c) => [c.value, c]),
) as Record<PhotoCategory, CategoryMeta>;

export function categoryLabel(c: PhotoCategory) {
  return CATEGORY_META[c]?.label ?? "Other";
}

/**
 * `overview` is the satellite/map view; everything else was taken standing on
 * the job. The cover rules below prefer a real jobsite photo over an overview.
 */
export function isPhysicalCategory(c: PhotoCategory) {
  return c !== "overview";
}

export const VISIBILITY_META: Record<PhotoVisibility, { label: string; hint: string; tone: Tone }> = {
  internal: {
    label: "Internal",
    hint: "Fortitude staff only — subcontractors cannot see this photo.",
    tone: "neutral",
  },
  shared: {
    label: "Shared",
    hint: "Visible to the subcontractors assigned to this project.",
    tone: "info",
  },
};

/* -- Cover resolution ------------------------------------------------------ */

function coverFromPhoto(p: ProjectPhoto, source: ProjectCover["source"]): ProjectCover {
  return {
    url: p.storagePath,
    thumbUrl: p.thumbnailPath || p.storagePath,
    source,
    photoId: p.id,
    caption: p.caption,
    photoCategory: p.photoCategory,
    takenAt: p.takenAt,
  };
}

/**
 * Which image leads the card, in priority order:
 *
 *   1. the photo somebody explicitly chose as the cover
 *   2. otherwise the newest physical jobsite photo
 *   3. otherwise the satellite/map overview photo
 *   4. otherwise the uploaded construction map, if it's an image
 *   5. otherwise nothing — the card paints its placeholder
 *
 * `photos` must already be filtered to what the viewer is allowed to see, so a
 * subcontractor never gets an internal photo as a cover.
 */
export function resolveProjectCover(
  project: Pick<Project, "mapUrl" | "photoUrl">,
  photos: ProjectPhoto[],
): ProjectCover | null {
  const chosen = photos.find((p) => p.isCoverImage);
  if (chosen) return coverFromPhoto(chosen, "cover");

  const byRecency = [...photos].sort(
    (a, b) => photoTime(b) - photoTime(a),
  );

  const physical = byRecency.find((p) => isPhysicalCategory(p.photoCategory));
  if (physical) return coverFromPhoto(physical, "photo");

  const overview = byRecency.find((p) => p.photoCategory === "overview");
  if (overview) return coverFromPhoto(overview, "overview");

  // The legacy single cover photo, from before the gallery existed.
  if (project.photoUrl) {
    return { url: project.photoUrl, thumbUrl: project.photoUrl, source: "legacy" };
  }
  // A PDF map can't be painted into an <img>, which is what isRasterMap screens.
  if (isRasterMap(project.mapUrl)) {
    return { url: project.mapUrl!, thumbUrl: project.mapUrl!, source: "map" };
  }
  return null;
}

/** Capture time when we have it, upload time otherwise. */
export function photoTime(p: Pick<ProjectPhoto, "takenAt" | "uploadedAt">) {
  const t = p.takenAt ?? p.uploadedAt;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? 0 : ms;
}

export const COVER_SOURCE_LABEL: Record<ProjectCover["source"], string> = {
  cover: "Cover photo",
  photo: "Latest jobsite photo",
  overview: "Satellite overview",
  map: "Project map",
  legacy: "Jobsite photo",
};

/* -- Formatting ------------------------------------------------------------ */

export function formatCoordinates(lat: number | null, lon: number | null) {
  if (lat == null || lon == null) return null;
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`;
}

/** Google Maps deep link for a photo's GPS fix. */
export function mapsLink(lat: number, lon: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

export function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Mar 14, 2026 · 7:42 AM" — stable across server and client renders. */
export function formatPhotoDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (!withTime) return date;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

/** `2026-03-14` in local time — the value shape the date filters compare against. */
export function photoDateKey(p: Pick<ProjectPhoto, "takenAt" | "uploadedAt">) {
  const d = new Date(photoTime(p));
  if (Number.isNaN(d.getTime())) return "";
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
