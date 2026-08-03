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

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !ok) {
    return { error: "That email and password don't match an account." };
  }

  const token = await signSession({ userId: user.id, role: user.role as SessionRole });
  await setSessionCookie(token);
  redirect("/");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}
