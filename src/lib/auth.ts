import "server-only";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

import { prisma } from "@/lib/prisma";
import { runWithOrg } from "@/lib/org-context";

/**
 * Session handling.
 *
 * A signed JWT in an httpOnly cookie, deliberately carrying only the user id
 * and role. Role lives in the token so middleware can gate routes at the edge
 * without a database round trip on every request; anything else the UI needs
 * is read fresh from the database server-side, so a changed name or a revoked
 * account takes effect on the next page load rather than the next login.
 *
 * Passwords are bcrypt hashed. Nothing here ever stores or logs a plaintext
 * password.
 */

export const SESSION_COOKIE = "vq_session";
const SESSION_DAYS = 7;

export type SessionRole = "ADMIN" | "PM" | "OFFICE" | "SUPERVISOR" | "SUBCONTRACTOR";

export interface SessionPayload {
  userId: string;
  role: SessionRole;
  /**
   * Which organisation's database this session reads.
   *
   * In the token because the token is signed: the browser holds it, cannot
   * edit it, and middleware can read it at the edge without a database round
   * trip — which matters, since resolving it *is* how we decide which database
   * to round-trip to. A cookie or a header the client could set would let
   * anyone type another company's id and be served their books.
   *
   * Switching organisations re-signs the token. There is no other way to
   * change it.
   */
  org: string;
  /**
   * Which organisation's database this account *lives* in.
   *
   * Identity and data are not the same question, and conflating them breaks
   * the switcher outright: a platform operator's user row exists in one
   * database, so the moment they switch to another, looking themselves up
   * there finds nothing and the session reads as signed out. Every screen goes
   * blank and the switcher appears to have logged them out.
   *
   * So `home` answers "who is this", `org` answers "whose data are they
   * looking at", and they are equal for everybody who never switches.
   *
   * This is the one place step 3 goes beyond the approved blueprint, which
   * names only `org`. The alternative — mirroring operator accounts into every
   * organisation's database — would put real people's credentials in the demo
   * tenant, which is worse.
   */
  home: string;
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a random 32+ character value in .env and in Vercel.",
    );
  }
  return new TextEncoder().encode(value);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function signSession(payload: SessionPayload) {
  if (!payload.org || !payload.home) {
    throw new Error("Refusing to sign a session with no organisation on it.");
  }
  return new SignJWT({ role: payload.role, org: payload.org, home: payload.home })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

/**
 * Edge-safe: verifies the token only, no database access.
 *
 * A token with no `org` is rejected outright rather than repaired. Those are
 * the sessions issued before organisations existed, and the repair — assuming
 * they meant Fortitude — is exactly the silent defaulting this whole step
 * removes. They are a week from expiring at most, and the cost of rejecting
 * one is a sign-in.
 */
export async function readSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.role !== "string") return null;
    if (typeof payload.org !== "string" || !payload.org) return null;
    if (typeof payload.home !== "string" || !payload.home) return null;
    return {
      userId: payload.sub,
      role: payload.role as SessionRole,
      org: payload.org,
      home: payload.home,
    };
  } catch {
    return null; // expired, tampered with, or signed by a different secret
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? readSessionToken(token) : null;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: SessionRole;
  organizationName: string;
  organizationPlan: string;
  /** Set only for subcontractor logins — the company they belong to. */
  subcontractorId: string | null;
  subcontractorName: string | null;
}

/** The signed-in user, read fresh so edits and revocations apply immediately. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;

  // Identity comes from where the account lives, never from the organisation
  // currently being looked at — see `home` on SessionPayload.
  const user = await runWithOrg(session.home, () =>
    prisma.user.findUnique({
      where: { id: session.userId },
      include: { organization: true, subcontractor: true },
    }),
  );
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as SessionRole,
    organizationName: user.organization?.name ?? "Vantara IQ",
    organizationPlan: user.organization?.plan ?? "Enterprise",
    subcontractorId: user.subcontractorId,
    subcontractorName: user.subcontractor?.company ?? null,
  };
}

/** Staff see the whole operation; subcontractors see only their own work. */
export function isStaff(role: SessionRole) {
  return role === "ADMIN" || role === "PM" || role === "OFFICE" || role === "SUPERVISOR";
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
