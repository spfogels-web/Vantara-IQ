import { upload as blobUpload } from "@vercel/blob/client";

import { readExif } from "@/lib/exif";
import { blobToDataUrl, prepareImage, safeFileName } from "@/lib/image";
import { uploadProjectPhotoInline } from "@/app/actions";

/**
 * The browser side of adding a jobsite photo.
 *
 * Two steps, deliberately separate: `preparePhoto` reads what the file itself
 * knows (capture time, GPS, dimensions) and builds the thumbnail, all locally,
 * so the uploader can show a filled-in row before anything is sent. `storePhoto`
 * then puts the original and the derivative in storage.
 *
 * Preferred path is a direct-to-Blob upload — a 6 MB phone photo never touches a
 * serverless function, so there is no request-body ceiling to trip over. When no
 * Blob store is connected the small-file fallback posts through the server
 * action instead, which is the only path with a real size limit.
 */

export interface PreparedPhoto {
  file: File;
  /** Object URL for the local preview; revoke it when the row goes away. */
  previewUrl: string;
  takenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  width: number | null;
  height: number | null;
  /** Optimized derivative, or null when the browser couldn't decode the file. */
  thumbnail: Blob | null;
  thumbnailExtension: string;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  // EXIF first: it's a 512 KB read and tells us when and where, which is the
  // metadata a photo can never be re-derived from later.
  const [exif, prepared] = await Promise.all([readExif(file), prepareImage(file)]);

  return {
    file,
    previewUrl: URL.createObjectURL(file),
    // No EXIF capture time (screenshots, some Androids, anything re-saved) —
    // the file's own modified time is the closest honest answer.
    takenAt: exif.takenAt ?? isoOrNull(file.lastModified),
    latitude: exif.latitude ?? null,
    longitude: exif.longitude ?? null,
    width: prepared.meta?.width ?? null,
    height: prepared.meta?.height ?? null,
    thumbnail: prepared.thumbnail?.blob ?? null,
    thumbnailExtension: prepared.thumbnail?.extension ?? "webp",
  };
}

function isoOrNull(ms: number) {
  if (!ms || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface StoredPhoto {
  storagePath: string;
  thumbnailPath: string;
}

export async function storePhoto(projectId: string, p: PreparedPhoto): Promise<StoredPhoto> {
  const name = safeFileName(p.file.name || "photo.jpg");
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = `project-photos/${projectId}/${stamp}`;

  try {
    const original = await blobUpload(`${base}-${name}`, p.file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      contentType: p.file.type || undefined,
    });

    let thumbnailPath = "";
    if (p.thumbnail) {
      try {
        const thumb = await blobUpload(`${base}-thumb.${p.thumbnailExtension}`, p.thumbnail, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          contentType: p.thumbnail.type || "image/webp",
        });
        thumbnailPath = thumb.url;
      } catch {
        // A missing derivative is cosmetic — the grid falls back to the
        // original. Losing the original would be the actual failure.
      }
    }
    return { storagePath: original.url, thumbnailPath };
  } catch (blobError) {
    return storeInline(projectId, p, blobError);
  }
}

/**
 * No Blob store: post the bytes through the server action as data URLs. Only
 * viable for small files, and the action says so plainly when it isn't.
 */
async function storeInline(projectId: string, p: PreparedPhoto, blobError: unknown): Promise<StoredPhoto> {
  const fd = new FormData();
  fd.set("projectId", projectId);
  fd.set("file", p.file);
  if (p.thumbnail) {
    fd.set("thumbnail", new File([p.thumbnail], `thumb.${p.thumbnailExtension}`, {
      type: p.thumbnail.type || "image/webp",
    }));
  }

  const res = await uploadProjectPhotoInline(fd);
  if (!res.ok) {
    // Surface whichever message is more useful — the fallback's size ceiling is
    // usually the real story, but a Blob misconfiguration names its env var.
    throw new Error(res.error || messageOf(blobError));
  }
  return { storagePath: res.storagePath, thumbnailPath: res.thumbnailPath };
}

function messageOf(e: unknown) {
  return e instanceof Error && e.message ? e.message : "Upload failed.";
}

/** Data URL of a prepared thumbnail — for previews that outlive an object URL. */
export async function thumbnailDataUrl(p: PreparedPhoto) {
  return p.thumbnail ? blobToDataUrl(p.thumbnail) : null;
}
