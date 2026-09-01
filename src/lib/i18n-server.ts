import "server-only";

import { cookies } from "next/headers";

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translator, type Locale } from "@/lib/i18n";

/**
 * The viewer's language, on the server.
 *
 * A cookie rather than a path prefix. Locale routing would mean /es/dailies
 * beside /dailies, which doubles every route, every link and every middleware
 * rule — and this app's middleware already decides what a crew may reach by
 * matching path prefixes. A cookie leaves all of that alone.
 */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** The lookup, for server components. */
export async function getT() {
  return translator(await getLocale());
}
