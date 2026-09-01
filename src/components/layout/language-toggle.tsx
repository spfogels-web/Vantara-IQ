"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Languages } from "lucide-react";

import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";
import { setLanguage } from "@/app/language-actions";
import { useLocale, useT } from "@/components/layout/language-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * English or Spanish, in the top bar.
 *
 * Beside the theme and notification controls rather than buried in settings: a
 * crew who cannot read the English screen cannot navigate to the page where
 * the language lives. The trigger shows the current language as two letters, so
 * it is findable without reading anything.
 *
 * Each language is written in its own name — "Español", never "Spanish" — since
 * the person looking for it is reading for the word they recognise.
 */
export function LanguageToggle() {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const [pending, start] = React.useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    start(async () => {
      await setLanguage(next);
      // The whole tree is server-rendered in the chosen language.
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t("Language")} — ${LOCALE_LABEL[locale]}`}
          className="focus-ring grid h-9 min-w-9 place-items-center gap-1 rounded-lg px-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
          disabled={pending}
        >
          <span className="flex items-center gap-1">
            <Languages className="size-[18px]" strokeWidth={1.9} />
            <span className="text-[11px] font-semibold uppercase tracking-wide">{locale}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-44 rounded-xl border-foreground/[0.08] shadow-elev-3"
      >
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {t("Language")}
        </DropdownMenuLabel>
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onSelect={() => choose(l)}
            className="gap-2.5 py-2 text-[12.5px]"
          >
            <span className="w-6 text-[11px] font-semibold uppercase text-muted-foreground">
              {l}
            </span>
            {LOCALE_LABEL[l]}
            {l === locale ? <Check className="ml-auto size-3.5 text-gold" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
