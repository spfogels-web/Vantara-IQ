"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  clearSessionCookie,
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
