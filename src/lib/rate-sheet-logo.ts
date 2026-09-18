import "server-only";

/**
 * The organisation's mark for a rate sheet header.
 *
 * Only what the organisation has uploaded in Settings. There used to be a
 * second way in: failing an upload, it read `public/fortitude-logo.png` from
 * the repo, so that a brand could be set by dropping a file in rather than
 * clicking through a form.
 *
 * That convenience put one company's logo on the top of every other
 * organisation's rate sheets — a document that goes out to subcontractors
 * being asked to agree a price. A sheet with no logo is plainly a sheet with
 * no logo. A sheet with the wrong company's logo is a different document
 * entirely.
 *
 * A logo that will not load never blocks the sheet — the rates are the point.
 */
export async function companyLogo(
  logoUrl: string | null,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!logoUrl) return null;

  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "image/png";
    if (!/png|jpe?g/i.test(mime)) return null;
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime };
  } catch {
    return null;
  }
}
