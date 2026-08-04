/**
 * Is Blob storage actually working here?
 *
 *   npm run check:blob
 *
 * Reads .env the same way Next does, then does a real round trip — writes a
 * small file, reads it back over HTTP, and deletes it. A token that exists but
 * belongs to a deleted store still looks fine in the environment and only
 * fails at upload time, so checking the variable alone proves nothing.
 */
import fs from "node:fs";
import path from "node:path";

// Minimal .env reader: Next loads these automatically, plain node does not.
for (const file of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.log("✗ BLOB_READ_WRITE_TOKEN is not set.\n");
  console.log("  Vercel dashboard → Storage → your Blob store → .env.local tab,");
  console.log("  copy the BLOB_READ_WRITE_TOKEN line into .env, then re-run this.");
  process.exit(1);
}
console.log(`✓ BLOB_READ_WRITE_TOKEN is set (${token.slice(0, 12)}…)`);

const { put, del } = await import("@vercel/blob");
const key = `_healthcheck/${Date.now()}.txt`;

try {
  const blob = await put(key, "vantara-iq blob health check", {
    access: "public",
    token,
    addRandomSuffix: true,
  });
  console.log("✓ upload succeeded");

  const res = await fetch(blob.url);
  console.log(
    res.ok
      ? "✓ file is readable at its URL"
      : `✗ uploaded but not readable (HTTP ${res.status})`,
  );

  await del(blob.url, { token });
  console.log("✓ cleanup ok\n");
  console.log("Blob storage is working. Images will upload.");
} catch (err) {
  console.log(`✗ ${err instanceof Error ? err.message : err}\n`);
  console.log("  A token that no longer matches a live store gives this.");
  console.log("  Re-copy it from Vercel → Storage → your Blob store.");
  process.exit(1);
}
