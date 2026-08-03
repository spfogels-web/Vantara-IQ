import * as React from "react";
import { Map as MapIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The small square that gives a project row a face: the jobsite photo if
 * there is one, otherwise the uploaded map, otherwise a deterministic gradient
 * derived from the project id so the same job always looks the same.
 *
 * PDF maps are skipped — they can't be an <img> without rasterising, and a
 * dashboard row is not the place to spin up pdf.js.
 */
function isRasterImage(url?: string | null) {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("data:")) return false;
  return !/\.pdf(\?|$)/i.test(url);
}

/**
 * Stable hue from the id so a project always looks the same — but kept inside
 * the brand's blue→violet band. A free 0–360 hash throws magenta and lime
 * squares into the table, which fights whichever palette is on.
 */
function hueFrom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return 198 + (h % 88); // 198–286: cyan-blue through indigo to violet
}

export function ProjectThumb({
  id,
  name,
  photoUrl,
  mapUrl,
  size = 44,
  className,
}: {
  id: string;
  name: string;
  photoUrl?: string | null;
  mapUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const src = isRasterImage(photoUrl) ? photoUrl : isRasterImage(mapUrl) ? mapUrl : null;
  const hue = hueFrom(id || name);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border border-border/70 bg-foreground/[0.04]",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading="lazy" draggable={false} />
      ) : (
        <>
          <span
            className="absolute inset-0"
            style={{
              background: `linear-gradient(140deg, hsl(${hue} var(--vibe-thumb-sat) 46% / 0.6), hsl(${hue + 34} var(--vibe-thumb-sat) 30% / 0.4))`,
            }}
          />
          <span className="absolute inset-0 grid place-items-center text-foreground/55">
            <MapIcon style={{ width: size * 0.4, height: size * 0.4 }} strokeWidth={1.7} />
          </span>
        </>
      )}
      {/* Hairline so a bright photo doesn't blow out against the card */}
      <span className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_0_1px_oklch(1_0_0/0.06)]" />
    </div>
  );
}
