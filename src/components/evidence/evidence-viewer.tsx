"use client";

import * as React from "react";
import Link from "next/link";
import { Download, ExternalLink, FileWarning, MapPin, Trash2, Video, X } from "lucide-react";

import { formatCoords } from "@/lib/exif";
import { cn } from "@/lib/utils";

/**
 * One way to look at a piece of evidence, wherever it is being looked at.
 *
 * The project gallery and the daily review are two windows onto the same
 * record, and the thing that must not happen is for them to drift — one
 * showing a coordinate the other hides, one offering Open in Maps and the
 * other not, one quietly filling a blank the other leaves honest. So the
 * viewer, the stamp and the map link live here and both import them.
 *
 * The rule the whole file turns on: nothing is displayed that the record does
 * not contain. A photograph with no coordinate says so, and gets no map link,
 * because a map link that guesses is worse than none — it invites somebody to
 * treat a guess as the place the picture was taken.
 */

/** What any surface must be able to hand the viewer. */
export type EvidenceItem = {
  id: string;
  url: string;
  kind: string;
  mediaType?: string;
  caption: string;

  capturedAt: string | Date | null;
  capturedAtSource: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  locationSource: string;

  source: string;
  uploadedBy: string;
  uploadedAt?: string | Date | null;

  stage?: string;
  category?: string;
  existingDamage?: boolean;
  damageNote?: string;

  /** Where it came from, when it came in on a crew's sheet. */
  dailySheetId?: string | null;
  dailyId?: string | null;
  subcontractorName?: string | null;
  workDate?: string | null;
  structure?: string | null;
};

const asDate = (v: string | Date | null | undefined) =>
  v == null ? null : v instanceof Date ? v : new Date(v);

export function isVideo(item: Pick<EvidenceItem, "kind" | "mediaType" | "url">): boolean {
  if (item.kind === "VIDEO") return true;
  if (item.mediaType?.startsWith("video/")) return true;
  // A record written before kind was set still has its file extension.
  return /\.(mp4|mov|m4v|webm|avi)(\?|$)/i.test(item.url);
}

/** The Google Maps link for a fix, or null when there isn't one. */
export function mapHrefFor(item: Pick<EvidenceItem, "lat" | "lng">): string | null {
  if (item.lat == null || item.lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;
}

const STAGE_LABEL: Record<string, string> = {
  PRE_CONSTRUCTION: "Pre-construction",
  WORK_RECORD: "Record of work",
  DIRECTION: "Direction for crew",
  CLOSEOUT: "Closeout",
};

const CATEGORY_LABEL: Record<string, string> = {
  EXISTING_DAMAGE: "Existing damage",
  DRIVEWAY: "Driveway",
  CURB_SIDEWALK: "Curb / sidewalk",
  LANDSCAPING_LAWN: "Landscaping / lawn",
  IRRIGATION: "Irrigation",
  MAILBOX: "Mailbox",
  FENCE: "Fence",
  ROAD_SHOULDER: "Road / shoulder",
  DRAINAGE: "Drainage",
  UTILITY_PEDESTAL: "Utility / pedestal",
  STRUCTURE: "Structure",
  GENERAL_ROUTE: "General route condition",
  OTHER: "Other",
};

export const EVIDENCE_CATEGORIES = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({
  value,
  label,
}));

/**
 * When and where, and how each was established.
 *
 * The provenance note is not decoration. "taken in app" and "from the photo"
 * are different weights of evidence, and a reader deciding whether to rely on
 * a timestamp should be able to see which one they have without asking.
 */
export function EvidenceStamp({
  item,
  compact,
}: {
  item: EvidenceItem;
  compact?: boolean;
}) {
  const when = asDate(item.capturedAt);
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
    item.capturedAtSource === "camera"
      ? "taken in app"
      : item.capturedAtSource === "exif"
        ? "from the photo"
        : item.capturedAtSource === "file"
          ? "file date"
          : "";

  const hasFix = item.lat != null && item.lng != null;

  return (
    <span className="block px-2 py-1.5">
      <span className="num block text-[11px] font-medium text-foreground">{whenText}</span>
      {hasFix ? (
        <span className="num mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
          <MapPin className="size-2.5 shrink-0" />
          {formatCoords(item.lat!, item.lng!)}
          {item.accuracyM != null ? ` ±${Math.round(item.accuracyM)}m` : ""}
        </span>
      ) : (
        <span className="mt-0.5 block text-[10.5px] text-muted-foreground/70">
          {/* Distinguished on purpose: a camera that could not get a fix is a
              different story from a file that never carried one. */}
          {item.source === "CAMERA" ? "Location unavailable" : "No location on file"}
        </span>
      )}
      {whenNote && !compact ? (
        <span className="mt-0.5 block text-[10.5px] text-muted-foreground/70">{whenNote}</span>
      ) : null}
      {item.caption ? (
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {item.caption}
        </span>
      ) : null}
    </span>
  );
}

/** The link, or nothing at all. Never a link to somewhere approximate. */
export function OpenInMaps({ item, className }: { item: EvidenceItem; className?: string }) {
  const href = mapHrefFor(item);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "focus-ring inline-flex items-center gap-1 rounded text-[11.5px] text-brand-bright hover:underline",
        className,
      )}
    >
      <MapPin className="size-3" /> Open in Maps
    </a>
  );
}

/** The media itself. A video is played, never rendered into an img. */
export function EvidenceMedia({ item, className }: { item: EvidenceItem; className?: string }) {
  if (isVideo(item)) {
    return (
      <video
        src={item.url}
        controls
        playsInline
        preload="metadata"
        className={cn("mx-auto max-h-[60vh] w-full bg-black", className)}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt={item.caption || "Field evidence"}
      className={cn("mx-auto max-h-[60vh]", className)}
    />
  );
}

/** Small marks on a card, so a wall of thumbnails still says something. */
export function EvidenceBadges({ item }: { item: EvidenceItem }) {
  const video = isVideo(item);
  const fromDaily = Boolean(item.dailySheetId);
  const noFix = item.lat == null || item.lng == null;

  if (!video && !item.existingDamage && !fromDaily && !noFix) return null;

  return (
    <div className="pointer-events-none absolute left-1.5 top-1.5 flex flex-wrap gap-1">
      {video ? <Badge tone="plain"><Video className="size-2.5" /> Video</Badge> : null}
      {item.existingDamage ? (
        <Badge tone="warn">
          <FileWarning className="size-2.5" /> Existing damage
        </Badge>
      ) : null}
      {fromDaily ? <Badge tone="plain">Daily</Badge> : null}
      {noFix ? <Badge tone="quiet">No GPS</Badge> : null}
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "plain" | "warn" | "quiet";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-medium backdrop-blur",
        tone === "warn"
          ? "bg-warning/85 text-black"
          : tone === "quiet"
            ? "bg-black/55 text-white/70"
            : "bg-black/60 text-white",
      )}
    >
      {children}
    </span>
  );
}

/**
 * The full viewer.
 *
 * `editor` is whatever the surface wants to offer for changing what a picture
 * is *of* — a caption, a classification. The observed facts are not passed to
 * it, because they are not editable: they are rendered below, apart, by this
 * component, in every surface, identically.
 */
export function EvidenceViewer({
  item,
  onClose,
  onDelete,
  editor,
  projectHref,
  dailyHref,
}: {
  item: EvidenceItem;
  onClose: () => void;
  onDelete?: () => void;
  editor?: React.ReactNode;
  projectHref?: string | null;
  dailyHref?: string | null;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
          <p className="min-w-0 truncate text-[12.5px] font-medium text-foreground">
            {isVideo(item) ? "Video" : "Photo"}
            <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">
              {item.source === "CAMERA" ? "taken in app" : "uploaded"}
              {item.uploadedBy ? ` · ${item.uploadedBy}` : ""}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={item.url}
              download
              className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              <Download className="size-3" />
              <span className="hidden sm:inline">Download</span>
            </a>
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11.5px] text-muted-foreground hover:border-critical/40 hover:text-critical"
              >
                <Trash2 className="size-3" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="focus-ring grid size-7 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-black/40">
          <EvidenceMedia item={item} />
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-border/70 p-3">
          {editor}

          {/* The observed facts sit apart from the editable ones. Where and
              when are not opinions and are never retyped. */}
          <div className="w-full border-t border-border/40 pt-2">
            <EvidenceStamp item={item} />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2">
              <OpenInMaps item={item} />
              {dailyHref ? (
                <Link
                  href={dailyHref}
                  className="focus-ring inline-flex items-center gap-1 rounded text-[11.5px] text-brand-bright hover:underline"
                >
                  <ExternalLink className="size-3" /> View Daily
                </Link>
              ) : null}
              {projectHref ? (
                <Link
                  href={projectHref}
                  className="focus-ring inline-flex items-center gap-1 rounded text-[11.5px] text-brand-bright hover:underline"
                >
                  <ExternalLink className="size-3" /> View project
                </Link>
              ) : null}
            </div>

            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 px-2 sm:grid-cols-3">
              {item.stage ? <Fact label="Stage" value={STAGE_LABEL[item.stage] ?? item.stage} /> : null}
              {item.category && item.category !== "OTHER" ? (
                <Fact label="Category" value={CATEGORY_LABEL[item.category] ?? item.category} />
              ) : null}
              {/* A work record with no daily behind it was captured in the
                  field and never filed — the crew abandoned the sheet, or the
                  link failed. It is real evidence and it stays on the project,
                  but it must not be read as filed, approved, or billable work,
                  so it says what it is. Pre-construction and closeout evidence
                  legitimately has no daily and is not labelled. */}
              {item.stage === "WORK_RECORD" && !item.dailySheetId && !item.dailyId ? (
                <Fact label="Filing" value="Unlinked field capture — not on a filed daily" />
              ) : null}
              {item.subcontractorName ? <Fact label="Crew" value={item.subcontractorName} /> : null}
              {item.workDate ? <Fact label="Work date" value={item.workDate} /> : null}
              {item.structure ? <Fact label="Structure" value={item.structure} /> : null}
              {item.existingDamage && item.damageNote ? (
                <Fact label="Damage" value={item.damageNote} />
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] uppercase tracking-wider text-muted-foreground/70">{label}</dt>
      <dd className="truncate text-[11.5px] text-foreground">{value}</dd>
    </div>
  );
}
