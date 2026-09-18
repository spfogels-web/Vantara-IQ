import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { ORG_HEADER } from "@/lib/org-header";

/**
 * Route protection at the edge, and the one place the organisation enters the
 * request.
 *
 * Verifies the session cookie's signature only — no database access, because
 * middleware runs on the edge runtime where Prisma can't. Pages still read the
 * user server-side, so this is the coarse gate and not the authority on what
 * anyone can see.
 *
 * Subcontractors are held to the crew-facing routes. Everything else — the
 * financials, the customer list, the whole subcontractor roster — is staff
 * only, and a sub who guesses a URL lands back on their dailies.
 *
 * ## The organisation
 *
 * Each organisation is a separate database, so which one a request belongs to
 * decides which database every query in it reaches. It is read from the signed
 * session and forwarded as a request header, because that is the only channel
 * that survives into server-component rendering.
 *
 * Two rules make that safe, and both are absolute:
 *
 *   1. Any inbound copy of the header is **deleted**, on every path, before
 *      anything else happens. Otherwise sending `x-vq-org: apex` by hand would
 *      be enough to read another company's books.
 *   2. The value is only ever taken from a token this server signed.
 *
 * A session predating organisations has no such claim, and is sent to sign in
 * rather than assumed to mean Fortitude.
 */

const SESSION_COOKIE = "vq_session";

/**
 * Reachable without a session cookie.
 *
 * `/api/blob` is here because Vercel calls it back server-to-server when an
 * upload completes, and that request has no cookie to carry — redirecting it to
 * /login would strand every finished upload. The route is not unprotected: it
 * requires a session for the one operation that matters (minting an upload
 * token) and verifies the callback's signature for the other.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/invite",
  "/api/blob",
  "/api/agreement",
  "/api/nda",
  // A carrier vetting the SMS campaign opens these in a clean browser with
  // no account. Behind the login they are a sign-in page, which reads as a
  // company with nothing to show and gets the campaign rejected.
  "/privacy",
  "/terms",
  // The opt-in itself. Behind the login it is a sign-in page, which is what
  // got the A2P campaign rejected for an unverifiable call to action.
  "/sms",
  // Twilio POSTs opt-outs here and cannot carry a session. It authenticates
  // instead by verifying Twilio’s signature over the body.
  "/api/sms",
  // Vercel's scheduler calls this twice a day with a bearer token and no
  // cookie. Without this line it was redirected to /login before the route's
  // own CRON_SECRET check ever ran, which is why the locate sweep has never
  // fired — the 503 about a missing secret was a symptom, not the cause.
  // The route is not unprotected: it compares the bearer against CRON_SECRET
  // and refuses to run at all if that variable is unset.
  "/api/cron",
];

/**
 * What a subcontractor login is allowed to reach.
 *
 * `/api/daily-sheet` is the PDF of a crew's own daily. It needs naming here
 * because it sits under /api rather than /dailies, and without it a crew
 * pressing the PDF button on their own sheet is bounced to the login page.
 * Reaching the route is not the same as being handed the sheet: it checks the
 * requester against the project's assignments before it renders anything.
 *
 * `/api/project-map` is the construction print for a job, for the same reason
 * and with the same caveat — the route checks the crew is on that job before
 * it hands the file over. Without this line the download button renders on a
 * crew's project page and bounces them to the login screen, which is worse
 * than not offering it.
 */
const SUB_ALLOWED_PREFIXES = [
  "/dailies",
  // Their own locate tickets, and only those. The query filters to tickets
  // filed to their company — not to every ticket on a job they happen to
  // share — so two crews on one build never read each other's work.
  "/locates",
  "/projects",
  "/company",
  "/badges",
  "/pay",
  "/tasks",
  "/messages",
  "/support",
  "/settings",
  "/api/daily-sheet",
  "/api/project-map",
  // Their own pay statement's remittance advice. The route checks the
  // statement belongs to the company asking before it renders anything —
  // what another crew is paid is the one figure that must never cross over.
  "/api/remittance",
  // A document from their own onboarding packet — the W-9 they uploaded, the
  // agreement they signed. The route was written to serve exactly that and
  // checks the document belongs to the company asking, but without this line
  // middleware bounced them to /dailies first, so the path was dead.
  "/api/sub-document",
];

/**
 * Carved back out of the allowed prefixes above. Creating and editing projects
 * lives under /projects, so the prefix match would otherwise hand a crew the
 * customer picker and the contract fields on the way past.
 */
const SUB_DENIED_PATTERNS = [/^\/projects\/new$/, /^\/projects\/[^/]+\/edit$/];

function isPublic(pathname: string) {
  // The root, and only the root. An exact match rather than a prefix,
  // because "/" as a prefix is every page in the application — the
  // marketing site is public, the Operations Center underneath it is not,
  // and the page itself decides which of the two a visitor gets.
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Before anything else, and regardless of where this request is going: a
  // client does not get to say which organisation it belongs to.
  const headers = new Headers(request.headers);
  headers.delete(ORG_HEADER);
  const forward = () => NextResponse.next({ request: { headers } });

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;

  let role: string | null = null;
  let org: string | null = null;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      role = typeof payload.role === "string" ? payload.role : null;
      // Both, or neither. A token carrying one without the other was not
      // issued by this application in a state we recognise.
      const home = typeof payload.home === "string" && payload.home ? payload.home : null;
      org = home && typeof payload.org === "string" && payload.org ? payload.org : null;
    } catch {
      // Expired, tampered with, or signed by a different secret. Treated as no
      // session at all rather than as a reason to trust any part of it.
    }
  }

  // Set even on public paths: the root serves the Operations Center to anyone
  // signed in, and it needs a database to read. A visitor with no session gets
  // no header, and the marketing page it renders for them asks for no data.
  if (org) headers.set(ORG_HEADER, org);

  if (isPublic(pathname)) return forward();

  if (!token || !secret) return redirectToLogin(request);
  if (!role) return redirectToLogin(request);

  // A session issued before organisations existed. Repairing it would mean
  // assuming it meant Fortitude, which is the silent defaulting this exists to
  // remove. It costs the holder one sign-in.
  if (!org) return redirectToLogin(request);

  if (role === "SUBCONTRACTOR") {
    const allowed =
      SUB_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
      !SUB_DENIED_PATTERNS.some((re) => re.test(pathname));
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/dailies";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return forward();
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  // Come back to where they were headed once they're signed in.
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
