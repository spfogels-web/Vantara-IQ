"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { useT } from "@/components/layout/language-provider";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

/**
 * Flips the whole app between the dark and light token sets by swapping the
 * theme class on <html>. The choice persists to localStorage and is applied
 * pre-paint by the inline script in the root layout, so there's no flash.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // The button carries no text, so its label is the only thing a screen reader
  // or a hover has to go on — and on a page a Spanish-speaking contractor is
  // reading, that label should not be the one English word left on the screen.
  const t = useT();
  const [theme, setTheme] = React.useState<Theme>("dark");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    try {
      localStorage.setItem("vq-theme", next);
    } catch {
      /* private mode — theme still applies for this session */
    }
    setTheme(next);
  }

  // Icon reflects the mode you'll switch *to*, the common convention.
  const nextIsLight = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={nextIsLight ? t("Switch to light mode") : t("Switch to dark mode")}
      title={nextIsLight ? t("Light mode") : t("Dark mode")}
      className={cn(
        "focus-ring grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground",
        className,
      )}
    >
      {/* Render nothing theme-specific until mounted to avoid hydration mismatch */}
      {mounted ? (
        nextIsLight ? (
          <Sun className="size-[18px]" strokeWidth={1.9} />
        ) : (
          <Moon className="size-[18px]" strokeWidth={1.9} />
        )
      ) : (
        <span className="size-[18px]" />
      )}
    </button>
  );
}
