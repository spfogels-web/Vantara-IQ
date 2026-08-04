"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload as blobUpload } from "@vercel/blob/client";
import { ImagePlus, Loader2, Map as MapIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { saveProjectPhotoUrl } from "@/app/actions";

/**
 * The cover image on a project card.
 *
 * Order of preference: the jobsite photo somebody put there, then the uploaded
 * map if it's a raster we can actually draw, then a generated gradient. A PDF
 * map can't be rendered as an image, which is why so many cards read "PDF map
 * attached" and look empty — this gives every project a real face instead.
 *
 * Drop an image anywhere on the banner, or click it. Uploads go straight to
 * Blob so a full-resolution site photo isn't squeezed through the server.
 */
export function ProjectCover({
  projectId,
  projectNumber,
  photoUrl,
  mapUrl,
  className,
}: {
  projectId: string;
  projectNumber: string;
  photoUrl?: string | null;
  mapUrl?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [src, setSrc] = React.useState(photoUrl ?? "");
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // A PDF map can't be shown as an image; a PNG or JPG map can.
  const rasterMap =
    mapUrl && !mapUrl.startsWith("data:application/pdf") && !/\.pdf(\?|$)/i.test(mapUrl)
      ? mapUrl
      : null;
  const shown = src || rasterMap;

  async function accept(file: File | undefined) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      setError("That's not an image.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await blobUpload(`project-covers/${projectId}/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      const res = await saveProjectPhotoUrl(projectId, blob.url);
      if (res.ok) {
        setSrc(blob.url);
        router.refresh();
      } else {
        setError(res.error ?? "Could not save that image.");
      }
    } catch {
      setError("Upload failed — Blob storage isn't configured for this environment.");
    }
    setBusy(false);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        void accept(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "relative h-28 w-full overflow-hidden border-b border-border/60 bg-foreground/[0.03]",
        dragging && "ring-2 ring-inset ring-brand",
        className,
      )}
    >
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

      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shown}
          alt=""
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grid size-full place-items-center bg-[radial-gradient(60%_120%_at_50%_-10%,color-mix(in_oklab,var(--vq-blue)_14%,transparent),transparent)]">
          <span className="flex flex-col items-center gap-1 text-[11px] font-medium text-muted-foreground/70">
            <MapIcon className="size-4" />
            {mapUrl ? "PDF map — add a cover photo" : "Drop a photo or click to add"}
          </span>
        </div>
      )}

      {/* Click target sits above the image so the whole banner is droppable. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.click();
        }}
        title={shown ? "Replace cover photo" : "Add a cover photo"}
        className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11.5px] font-medium text-white">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          {busy ? "Uploading…" : shown ? "Replace photo" : "Add photo"}
        </span>
      </button>

      <span className="num pointer-events-none absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
        {projectNumber}
      </span>

      {error ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-critical/85 px-2 py-1 text-[10.5px] text-white">
          {error}
        </span>
      ) : null}
    </div>
  );
}
