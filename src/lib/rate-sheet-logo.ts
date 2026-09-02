import "server-only";

/**
 * The company's mark for a rate sheet header.
 *
 * Two ways in, deliberately. An upload in Settings wins, because that is
 * self-service and survives a deploy. Failing that it falls back to
 * public/fortitude-logo.png committed to the repo, so the brand can be set by
 * dropping in a file without waiting on anyone to click through a form.
 *
 * A logo that will not load never blocks the sheet — the rates are the point.
 */
export async function companyLogo(
  logoUrl: string | null,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const mime = res.headers.get("content-type") ?? "image/png";
        if (/png|jpe?g/i.test(mime)) {
          return { bytes: new Uint8Array(await res.arrayBuffer()), mime };
        }
      }
    } catch {
      // fall through to the bundled file
    }
  }

  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const bytes = await readFile(path.join(process.cwd(), "public", "fortitude-logo.png"));
    return { bytes: new Uint8Array(bytes), mime: "image/png" };
  } catch {
    return null;
  }
}
