import "server-only";

import type { PDFDocument, PDFImage } from "pdf-lib";

/**
 * The company mark, ready to draw on a page.
 *
 * Fetched rather than bundled: the logo is uploaded through Settings and can be
 * changed without a deploy, which is the whole point of storing it.
 *
 * It goes through the app's own image optimizer first. The Fortitude mark is a
 * 2.52 MB PNG at 1536x1024 and it is drawn here 46 points wide — embedded raw
 * it turned a 3 KB remittance advice into a 3.3 MB one, which is then emailed
 * to a crew and attached to every invoice a customer receives. The same file
 * through the optimizer is 18.9 KB.
 *
 * Returns null on anything unexpected. A remittance that fails to generate
 * because a decorative image would not load is worse than one without the
 * image, and this is a document somebody is waiting to send with a payment.
 */

/**
 * Decoded logos, by URL.
 *
 * A batch of statements is a dozen documents in a row off the same mark, and
 * without this that is a dozen fetches of the same file. Cleared whenever the
 * process restarts, which is also when a newly uploaded logo takes effect.
 */
const cache = new Map<string, Uint8Array | null>();

async function bytesFor(url: string, origin?: string | null): Promise<Uint8Array | null> {
  const key = `${origin ?? ""}|${url}`;
  const held = cache.get(key);
  if (held !== undefined) return held;

  const attempt = async (target: string): Promise<Uint8Array | null> => {
    try {
      const res = await fetch(target, {
        // Generous: a cold connection to blob storage is slower than a warm
        // one, and a logo that silently vanishes from a document the first
        // time it is generated each morning is worse than a slow request.
        signal: AbortSignal.timeout(15000),
        headers: { accept: "image/png,image/jpeg,image/*" },
      });
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  };

  let bytes: Uint8Array | null = null;

  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    bytes = comma > 0 ? new Uint8Array(Buffer.from(url.slice(comma + 1), "base64")) : null;
  } else {
    if (origin) {
      // Resized by the same optimizer the browser gets. It only answers for
      // hosts named in next.config, which is exactly the set a logo can be
      // uploaded to.
      const opt = `${origin}/_next/image?url=${encodeURIComponent(url)}&w=256&q=80`;
      bytes = await attempt(opt);
    }
    // The original, if the optimizer is unavailable — a different deployment
    // shape, a host that was never allowed, an image route turned off.
    if (!bytes) bytes = await attempt(url);
  }

  cache.set(key, bytes);
  return bytes;
}

export async function embedOrgLogo(
  pdf: PDFDocument,
  url: string | null | undefined,
  origin?: string | null,
): Promise<PDFImage | null> {
  if (!url) return null;
  const bytes = await bytesFor(url, origin);
  if (!bytes || bytes.length < 8) return null;

  // pdf-lib reads PNG and JPEG only. Sniff the bytes rather than trusting the
  // extension or the content type — these are uploaded files, and the
  // optimizer will happily return webp if asked wrongly.
  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;

  try {
    if (isPng) return await pdf.embedPng(bytes);
    if (isJpg) return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

/** Fit a logo into a box, keeping its proportions. */
export function logoBox(img: PDFImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  return { width: img.width * scale, height: img.height * scale };
}
