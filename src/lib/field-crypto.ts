import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for the handful of fields that are payment credentials.
 *
 * A bank account and routing number together are enough to move money. They are
 * not "sensitive data" in the way a phone number is — they are a key, and a key
 * sitting in a plain Postgres column is readable by every backup, every logged
 * query, every read-replica and anybody who ever gets a connection string.
 *
 * AES-256-GCM, so the ciphertext is authenticated: a tampered value fails to
 * decrypt rather than returning something plausible. The key never touches the
 * database — it lives in the environment, which means a stolen database dump on
 * its own yields nothing.
 *
 * Deliberately not a general-purpose utility. Encrypt the account and routing
 * numbers and nothing else: encrypting a company address would make it
 * unsearchable and buy no safety at all.
 */

const KEY_VAR = "ACH_ENCRYPTION_KEY";

/** 32 bytes, base64. Generate with: openssl rand -base64 32 */
function key(): Buffer {
  const raw = process.env[KEY_VAR];
  if (!raw) {
    throw new Error(
      `${KEY_VAR} is not set. Bank details cannot be stored without it — generate one with \`openssl rand -base64 32\` and add it to the environment.`,
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(`${KEY_VAR} must be 32 bytes of base64 (got ${buf.length}).`);
  }
  return buf;
}

/** True when the environment can store bank details at all. */
export function canStoreBankDetails(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt one field. Output is `v1.<iv>.<tag>.<ciphertext>`, all base64.
 *
 * The version prefix is there so the scheme can be changed later without
 * guessing how old rows were written.
 */
export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const out = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${out.toString("base64")}`;
}

/**
 * Decrypt one field.
 *
 * Throws on a tampered or truncated value rather than returning something that
 * looks like an account number and isn't.
 */
export function decryptField(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Stored value is not in the expected encrypted format.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last four digits, for showing an account without revealing it. */
export function last4(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits;
}

/**
 * A US routing number is nine digits and carries a checksum.
 *
 * Worth validating because a transposed digit produces a number that looks
 * perfectly fine, reaches a real different bank, and is only discovered when a
 * payment fails or — worse — lands somewhere else.
 */
export function isValidRouting(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 9) return false;
  const n = [...d].map(Number);
  const sum =
    3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + 1 * (n[2] + n[5] + n[8]);
  return sum % 10 === 0;
}
