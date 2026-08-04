import "server-only";

import crypto from "node:crypto";

/**
 * Encryption for the few fields that move money.
 *
 * The subcontractor agreement collects a routing and account number. Those are
 * not "sensitive" in the way a phone number is — someone holding them can pull
 * funds — so they are never written to the database in the clear and never sent
 * to a browser. Everything else in the vendor packet is stored plainly, because
 * encrypting a business address buys nothing and makes it unsearchable.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than returning plausible garbage. Each value gets its own random IV, so the
 * same account number encrypted twice does not produce the same output — that
 * matters here, since a handful of subs bank at the same places.
 *
 * The key lives in VQ_FIELD_KEY, separate from AUTH_SECRET on purpose: rotating
 * a session secret should log people out, not make bank details unreadable.
 */

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const raw = process.env.VQ_FIELD_KEY;
  if (!raw) {
    throw new Error(
      "VQ_FIELD_KEY is not set. Banking details cannot be stored or read without it.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("VQ_FIELD_KEY must be 32 bytes, base64 encoded.");
  }
  return buf;
}

/** True when the app is configured to hold banking details at all. */
export function canStoreSecrets(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** Encrypts to "v1.<iv>.<tag>.<ciphertext>", all base64. Empty in, empty out. */
export function encryptField(plain: string): string {
  const value = plain.trim();
  if (!value) return "";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

/**
 * Decrypts a stored value. Returns null rather than throwing when the value is
 * unreadable — a rotated key or a corrupted row should show "unavailable" in
 * the UI, not take down the page that happens to display it.
 */
export function decryptField(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;

  try {
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(parts[1], "base64"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** "123456789" -> "••••6789". What a screen is allowed to show. */
export function maskTail(value: string | null | undefined, keep = 4): string {
  const v = (value ?? "").replace(/\s/g, "");
  if (!v) return "";
  if (v.length <= keep) return v;
  return "•".repeat(Math.min(v.length - keep, 8)) + v.slice(-keep);
}
