"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  clearSessionCookie,
  getSession,
  hashPassword,
  setSessionCookie,
  signSession,
  verifyPassword,
  type SessionRole,
} from "@/lib/auth";

/**
 * Sign in. The failure message is deliberately identical whether the email is
 * unknown or the password is wrong — telling an attacker which half they got
 * right turns a login form into an account-enumeration tool.
 */
export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  // Fail loudly on a misconfigured deployment rather than letting a correct
  // password look wrong. Without AUTH_SECRET no session can be signed at all.
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    return {
      error:
        "This deployment is missing its AUTH_SECRET, so sessions can't be issued. Add it in the hosting environment settings and redeploy.",
    };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !ok) {
    return { error: "That email and password don't match an account." };
  }

  let token: string;
  try {
    token = await signSession({ userId: user.id, role: user.role as SessionRole });
  } catch {
    return { error: "Couldn't start a session. Check the server configuration and try again." };
  }
  await setSessionCookie(token);
  redirect("/");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

/** Rename yourself. The greeting and the account menu both read this. */
export async function updateProfile(input: { name: string; email: string }) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false as const, error: "Name can't be empty." };
  if (!email.includes("@")) return { ok: false as const, error: "That doesn't look like an email." };

  const clash = await prisma.user.findFirst({
    where: { email, NOT: { id: session.userId } },
    select: { id: true },
  });
  if (clash) return { ok: false as const, error: "Another account already uses that email." };

  await prisma.user.update({ where: { id: session.userId }, data: { name, email } });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/**
 * Change your own password. Requires the current one — a hijacked session
 * shouldn't be able to lock the real owner out.
 */
export async function changePassword(input: { current: string; next: string }) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  if (input.next.length < 10) {
    return { ok: false as const, error: "Use at least 10 characters." };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.passwordHash) return { ok: false as const, error: "No password set on this account." };

  const ok = await verifyPassword(input.current, user.passwordHash);
  if (!ok) return { ok: false as const, error: "Current password is wrong." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.next) },
  });
  return { ok: true as const };
}
