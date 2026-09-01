"use client";

import * as React from "react";

import { DEFAULT_LOCALE, translator, type Locale, type T } from "@/lib/i18n";

/**
 * The viewer's language, on the client.
 *
 * Handed down from the server layout, which read the cookie — so the first
 * paint is already in the right language and there is no flash of English.
 */

const LanguageContext = React.createContext<{ locale: Locale; t: T }>({
  locale: DEFAULT_LOCALE,
  t: translator(DEFAULT_LOCALE),
});

export function LanguageProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ locale, t: translator(locale) }), [locale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** `const t = useT()` then `t("Photos")`. */
export function useT(): T {
  return React.useContext(LanguageContext).t;
}

export function useLocale(): Locale {
  return React.useContext(LanguageContext).locale;
}
