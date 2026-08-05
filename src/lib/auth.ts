import "server-only";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

import { prisma } from "@/lib/prisma";

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

export type SessionRole = "ADMIN" | "PM" | "SUPERVISOR" | "OFFICE" | "SUBCONTRACTOR";

export interface SessionPayload {
  userId: string;
  role: SessionRole;
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
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

/** Edge-safe: verifies the token only, no database access. */
export async function readSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.role !== "string") return null;
    return { userId: payload.sub, role: payload.role as SessionRole };
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

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { organization: true, subcontractor: true },
  });
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
  return role === "ADMIN" || role === "PM" || role === "SUPERVISOR" || role === "OFFICE";
}

/**
 * Who may add jobsite photos, edit their metadata, share them out and choose
 * the cover shown on the Projects page: supervisors, project managers and
 * administrators. Office staff read the full internal record but don't publish
 * into it, and a subcontractor does neither.
 */
export function canManagePhotos(role: SessionRole) {
  return role === "ADMIN" || role === "PM" || role === "SUPERVISOR";
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
