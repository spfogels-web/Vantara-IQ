/**
 * A session cookie for a given user, minted the same way the app mints them.
 *
 * The tests need to arrive as a specific person — this contractor's office,
 * that crew's foreman — and passwords are beside the point: what is under test
 * is what the server does once it believes who you are. Signing the token here
 * rather than posting a login form also means a test failure points at the
 * authorization code instead of at the sign-in flow.
 */
import { SignJWT } from "jose";

export type Role = "ADMIN" | "PM" | "OFFICE" | "SUPERVISOR" | "SUBCONTRACTOR";

export async function sessionCookie(userId: string, role: Role): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set; the tests cannot mint a session.");
  const jwt = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
  return `vq_session=${jwt}`;
}

export type Reply = { status: number; location: string | null; body: string };

/**
 * A request that does not follow redirects.
 *
 * Middleware turns a refusal into a 302 to /dailies, and following it would
 * turn "you were denied" into "you got a page", which is the opposite of what
 * the assertion needs to see.
 */
export async function get(base: string, path: string, cookie?: string): Promise<Reply> {
  const res = await fetch(base + path, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* a PDF body may not decode as text; the status is what matters */
  }
  return { status: res.status, location: res.headers.get("location"), body };
}

/**
 * Everything a page actually delivered, as one searchable string.
 *
 * A server component's data reaches the browser as a React flight stream,
 * pushed in chunks through `self.__next_f.push([1,"…"])` with the JSON
 * escaped. A name can straddle two chunks, so searching the raw HTML for
 * "Pellham Boring" finds it on one run and misses it on the next — which is
 * exactly the flake this suite produced before. Reassembling the chunks and
 * unescaping them restores the original stream, and a leak either is or is not
 * in it.
 */
export function pageText(r: Reply): string {
  const chunks: string[] = [];
  const re = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(r.body)) !== null) {
    try {
      chunks.push(JSON.parse(m[1]) as string);
    } catch {
      /* a malformed chunk is not worth failing the whole read over */
    }
  }
  return r.body + "\n" + chunks.join("");
}

/**
 * Fetch a page until it has actually rendered, then hand it back.
 *
 * A dev server compiles a route on first request, and a streamed response that
 * loses its race comes back a 200 with an incomplete body. An incomplete body
 * contains no other tenant's name either, so a leak test reads it as a pass —
 * this suite produced exactly that flake twice before the polling went in.
 *
 * The wait is for the page to be ready, never for the security property: the
 * predicate looks only for the caller's *own* data. If it never appears the
 * helper gives up and the caller reports a fixture problem rather than a
 * boundary result.
 */
export async function getRendered(
  base: string,
  path: string,
  cookie: string,
  ownMarker: string,
  timeoutMs = 25_000,
): Promise<Reply> {
  const deadline = Date.now() + timeoutMs;
  let last = await get(base, path, cookie);
  while (Date.now() < deadline) {
    if (last.status === 200 && pageText(last).includes(ownMarker)) return last;
    await new Promise((r) => setTimeout(r, 700));
    last = await get(base, path, cookie);
  }
  return last;
}

/** Did this response actually hand over the thing, or turn the caller away? */
export function wasServed(r: Reply): boolean {
  return r.status >= 200 && r.status < 300;
}

export function wasRefused(r: Reply): boolean {
  return r.status === 401 || r.status === 403 || r.status === 404 || r.status === 302 || r.status === 307;
}
