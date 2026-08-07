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
 * Both files are built onto one 2002x381 canvas with the artwork at the same
 * scale, so a single height places either identically and the lockup does not
 * change size as the theme flips.
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
  /**
   * Measured, not guessed. On the 2002x381 canvas the V occupies x 180–430,
   * y 47–330 — taller than it is wide, so it is scaled to fill 85% of the
   * window's height and shifted to centre, which keeps the whole mark in frame
   * and leaves the divider bar outside it.
   *
   * Re-measure if the artwork is replaced; a slightly different crop will
   * otherwise clip the point off the V or drag the divider back in.
   */
  const inner = {
    width: size * 5.994,
    left: -size * 0.539,
    top: -size * 0.066,
  };

  const common = "absolute max-w-none object-contain";

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
        className={cn(common, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vantara-logo-on-dark.png"
        alt=""
        aria-hidden="true"
        style={inner}
        className={cn(common, "hidden dark:block")}
      />
    </span>
  );
}
