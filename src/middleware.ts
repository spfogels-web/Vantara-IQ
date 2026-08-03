import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Route protection at the edge.
 *
 * Verifies the session cookie's signature only — no database access, because
 * middleware runs on the edge runtime where Prisma can't. Pages still read the
 * user server-side, so this is the coarse gate and not the authority on what
 * anyone can see.
 *
 * Subcontractors are held to the crew-facing routes. Everything else — the
 * financials, the customer list, the whole subcontractor roster — is staff
 * only, and a sub who guesses a URL lands back on their dailies.
 */

const SESSION_COOKIE = "vq_session";

/** Reachable without signing in. */
const PUBLIC_PREFIXES = ["/login", "/invite", "/api/blob"];

/** What a subcontractor login is allowed to reach. */
const SUB_ALLOWED_PREFIXES = ["/dailies", "/projects", "/support", "/settings"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return redirectToLogin(request);

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Misconfigured rather than unauthorised — fail closed either way.
    return redirectToLogin(request);
  }

  let role: string | null = null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    role = typeof payload.role === "string" ? payload.role : null;
  } catch {
    return redirectToLogin(request);
  }

  if (role === "SUBCONTRACTOR") {
    const allowed = SUB_ALLOWED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/dailies";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
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
