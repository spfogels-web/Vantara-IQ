"use client";

import * as React from "react";
import { Leaf, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

type Vibe = "chill" | "vibrant";

/**
 * Flips the status palette between the two personalities defined in
 * globals.css — `chill` (desaturated, quiet) and `vibrant` (saturated, loud).
 * Independent of dark/light: either vibe works in either theme. Persisted to
 * localStorage and applied pre-paint by the inline script in the root layout.
 */
export function VibeToggle({ className }: { className?: string }) {
  const [vibe, setVibe] = React.useState<Vibe>("chill");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setVibe(document.documentElement.classList.contains("vibe-vibrant") ? "vibrant" : "chill");
  }, []);

  function toggle() {
    const next: Vibe = vibe === "chill" ? "vibrant" : "chill";
    const root = document.documentElement;
    root.classList.remove("vibe-chill", "vibe-vibrant");
    root.classList.add(`vibe-${next}`);
    try {
      localStorage.setItem("vq-vibe", next);
    } catch {
      /* private mode — vibe still applies for this session */
    }
    setVibe(next);
  }

  const nextIsVibrant = vibe === "chill";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={nextIsVibrant ? "Switch to vibrant palette" : "Switch to chill palette"}
      title={nextIsVibrant ? "Vibrant palette" : "Chill palette"}
      className={cn(
        "focus-ring grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground",
        className,
      )}
    >
      {mounted ? (
        nextIsVibrant ? (
          <Zap className="size-[18px]" strokeWidth={1.9} />
        ) : (
          <Leaf className="size-[18px]" strokeWidth={1.9} />
        )
      ) : (
        <span className="size-[18px]" />
      )}
    </button>
  );
}
