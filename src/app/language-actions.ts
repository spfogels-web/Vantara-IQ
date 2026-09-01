"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n";

/**
 * Remember the language.
 *
 * A year, and not httpOnly — this is a display preference, not a credential,
 * and leaving it readable lets the client render in the right language without
 * a round trip. An unrecognised value falls back to English rather than being
 * stored, so a hand-edited cookie cannot put anyone on a blank screen.
 */
export async function setLanguage(next: string) {
  const locale = isLocale(next) ? next : DEFAULT_LOCALE;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // Every page is server-rendered in the chosen language, so the whole tree
  // has to be rebuilt rather than just the page that holds the switch.
  revalidatePath("/", "layout");
  return { ok: true as const, locale };
}
