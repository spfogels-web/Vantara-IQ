/**
 * Browser-side image derivatives.
 *
 * The original file is uploaded byte-for-byte and never touched — it's the
 * record of what the crew actually saw. This module produces the optimized
 * derivative the grids and card covers render, so a Projects page with twenty
 * cards pulls twenty ~80 KB thumbnails instead of twenty 6 MB phone photos.
 *
 * Downscaling happens on the device rather than in a serverless function: no
 * image binary to deploy, no cold-start cost, and the phone that took the photo
 * is the one machine guaranteed to be able to decode it.
 */

export interface Derivative {
  blob: Blob;
  mediaType: string;
  extension: string;
}

export interface ImageMeta {
  width: number;
  height: number;
}

/** Long edge of the generated thumbnail. Covers a 2× retina card comfortably. */
const THUMB_MAX_EDGE = 1400;
const THUMB_QUALITY = 0.82;

/**
 * Decodes with EXIF orientation applied, so a portrait phone photo isn't
 * written sideways into the derivative.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // HEIC and other formats the browser can't decode land here.
    }
  }
  return decodeViaElement(file);
}

function decodeViaElement(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function sizeOf(src: ImageBitmap | HTMLImageElement): ImageMeta {
  if ("naturalWidth" in src) return { width: src.naturalWidth, height: src.naturalHeight };
  return { width: src.width, height: src.height };
}

/**
 * Reads pixel dimensions and produces the thumbnail in one decode.
 *
 * Returns `thumbnail: null` when the browser can't decode the format (HEIC on
 * desktop Chrome, for one) — the caller then serves the original everywhere,
 * which is correct but heavier.
 */
export async function prepareImage(file: File): Promise<{
  meta: ImageMeta | null;
  thumbnail: Derivative | null;
}> {
  const src = await decode(file);
  if (!src) return { meta: null, thumbnail: null };

  const meta = sizeOf(src);
  if (!meta.width || !meta.height) {
    release(src);
    return { meta: null, thumbnail: null };
  }

  const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(meta.width, meta.height));

  // Already small enough that a re-encode would cost quality for no bandwidth.
  if (scale === 1 && file.size <= 400 * 1024) {
    release(src);
    return { meta, thumbnail: null };
  }

  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    release(src);
    return { meta, thumbnail: null };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src as CanvasImageSource, 0, 0, width, height);
  release(src);

  const webp = await toBlob(canvas, "image/webp", THUMB_QUALITY);
  if (webp && webp.size > 0) {
    return { meta, thumbnail: { blob: webp, mediaType: "image/webp", extension: "webp" } };
  }
  const jpeg = await toBlob(canvas, "image/jpeg", THUMB_QUALITY);
  if (jpeg && jpeg.size > 0) {
    return { meta, thumbnail: { blob: jpeg, mediaType: "image/jpeg", extension: "jpg" } };
  }
  return { meta, thumbnail: null };
}

function release(src: ImageBitmap | HTMLImageElement) {
  if ("close" in src) src.close();
  else if (src.src.startsWith("blob:")) URL.revokeObjectURL(src.src);
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** For the small-file fallback path when Blob storage isn't configured. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}

/** Best-effort GPS fix for photos whose EXIF carried none (screenshots, HEIC). */
export function currentPosition(timeoutMs = 8000): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: Math.round(pos.coords.latitude * 1e6) / 1e6,
          longitude: Math.round(pos.coords.longitude * 1e6) / 1e6,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Filesystem-safe slug for the storage key, preserving the extension. */
export function safeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60);
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "jpg";
  return `${base || "photo"}.${ext || "jpg"}`;
}
