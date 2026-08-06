import "server-only";

import crypto from "node:crypto";

/**
 * Where document files live.
 *
 * Deliberately a thin seam. Contracts are currently held in Vercel Blob, which
 * has no private objects — every URL is world-readable to anyone who has it.
 * That is acceptable for a jobsite photo and wrong for an executed agreement,
 * so nothing outside this module ever sees a storage URL: the app stores an
 * opaque key, and downloads go through a route that authorises first.
 *
 * When we move to private storage (Supabase, S3, R2), only this file changes.
 * The key format and the calling code stay as they are.
 */

export type DocumentFileKind =
  | "original_upload"
  | "generated_pdf"
  | "executed_pdf"
  | "audit_certificate"
  | "signature_image"
  | "attachment";

/** Keys are prefixed by kind so originals and renders never collide. */
export function documentStorageKey(
  kind: DocumentFileKind,
  documentId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(-80);
  const unique = crypto.randomBytes(12).toString("hex");
  return `documents/${kind}/${documentId}/${unique}-${safe}`;
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** What we accept. Anything else is refused before a byte is stored. */
export const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export function describeFileRejection(mime: string, size: number): string | null {
  if (!ALLOWED_DOCUMENT_TYPES.has(mime)) {
    return `${mime || "That file type"} isn't accepted. Upload a PDF, image, Word, Excel or CSV file.`;
  }
  if (size > MAX_DOCUMENT_BYTES) {
    return `That file is ${(size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

/**
 * True when files can be stored privately.
 *
 * False today — Vercel Blob serves every object publicly. Screens use this to
 * say so plainly rather than implying a contract is locked down when it is one
 * leaked link away from being readable.
 */
export const STORAGE_IS_PRIVATE = false;
