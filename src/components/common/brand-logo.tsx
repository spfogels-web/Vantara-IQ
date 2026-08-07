import { cn } from "@/lib/utils";

/**
 * The Vantara IQ lockup, in whichever version stays visible.
 *
 * The artwork exists twice — white for dark backgrounds, black for light — and
 * which one shows is decided by CSS, not JavaScript. Both are in the markup and
 * one is hidden by the `.dark` class the theme script sets on <html> before
 * first paint. That matters: a JS swap would render the wrong logo for a frame
 * on every load, and on the login and invite pages the logo is the first thing
 * on screen.
 *
 * It also means this is a server component. Nothing here needs state.
 *
 * Both files are padded to the same 4:1 canvas, so a single height places
 * either identically and the mark does not jump as the theme flips.
 */
export function BrandLogo({
  className,
  /** Rendered height in pixels. Width follows the 4:1 canvas. */
  height = 36,
  priority = false,
}: {
  className?: string;
  height?: number;
  priority?: boolean;
}) {
  const common = "block w-auto object-contain";
  const style = { height };

  return (
    <span className={cn("inline-block shrink-0", className)} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vantara-logo-on-light.png"
        alt="Vantara IQ"
        style={style}
        fetchPriority={priority ? "high" : undefined}
        className={cn(common, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vantara-logo-on-dark.png"
        alt=""
        aria-hidden="true"
        style={style}
        fetchPriority={priority ? "high" : undefined}
        className={cn(common, "hidden dark:block")}
      />
    </span>
  );
}

/**
 * Just the V mark, for the collapsed rail.
 *
 * Cropped from the left of the same two files rather than shipped as another
 * pair of assets — one thing to replace when the brand moves, and no way for
 * the mark and the lockup to drift apart.
 */
export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  // The mark occupies roughly the first eighth of the 4:1 canvas, so showing a
  // square window of a 4x-wide image lands on it.
  const inner = { width: size * 4.15, height: size * 4.15 * 0.25 };

  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vantara-logo-on-light.png"
        alt="Vantara IQ"
        style={inner}
        className="absolute left-0 top-1/2 max-w-none -translate-y-1/2 object-contain dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vantara-logo-on-dark.png"
        alt=""
        aria-hidden="true"
        style={inner}
        className="absolute left-0 top-1/2 hidden max-w-none -translate-y-1/2 object-contain dark:block"
      />
    </span>
  );
}
