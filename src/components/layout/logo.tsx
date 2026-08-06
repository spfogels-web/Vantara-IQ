"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Brand asset override.
 *
 * Drop a transparent-background export of the Vantara IQ cube at
 * `public/vantara-mark.png` (or .svg) and it is used automatically. Until then
 * the vector mark below renders — same geometry and palette, no 404 visible to
 * the user, and it stays crisp at every size.
 *
 * The full lockup PNG is intentionally not used in the sidebar: its wordmark is
 * dark navy and would disappear against the near-black rail. The wordmark is
 * set in type instead so it inverts cleanly on dark.
 */
const MARK_SRC = "/vantara-mark.png";

/** Isometric cube mark — silver left face, electric-blue right face. */
function MarkSvg({ className }: { className?: string }) {
  const id = React.useId();

  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-top`} x1="5" y1="2" x2="43" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F2F6FB" />
          <stop offset="1" stopColor="#B9C4D2" />
        </linearGradient>
        <linearGradient id={`${id}-left`} x1="5" y1="13" x2="24" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9EAABA" />
          <stop offset="1" stopColor="#5C6878" />
        </linearGradient>
        <linearGradient id={`${id}-right`} x1="24" y1="24" x2="43" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B9CFF" />
          <stop offset="1" stopColor="#1B5FD9" />
        </linearGradient>
        <linearGradient id={`${id}-core`} x1="17" y1="19" x2="31" y2="33" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7DB2FF" />
          <stop offset="1" stopColor="#2F80FF" />
        </linearGradient>

        {/* Knocks the centre out of the three outer faces, leaving the thick
            isometric frame that reads as the Vantara cube. */}
        <mask id={`${id}-frame`}>
          <rect width="48" height="48" fill="white" />
          <path d="M24 15L34.5 21V33L24 39L13.5 33V21L24 15Z" fill="black" />
        </mask>
      </defs>

      <g mask={`url(#${id}-frame)`}>
        <path d="M24 2L43 13L24 24L5 13L24 2Z" fill={`url(#${id}-top)`} />
        <path d="M5 13L24 24V46L5 35V13Z" fill={`url(#${id}-left)`} />
        <path d="M43 13L43 35L24 46V24L43 13Z" fill={`url(#${id}-right)`} />
      </g>

      {/* Inner block — the "data core" at the centre of the frame */}
      <path d="M24 20.5L31 24.5V31L24 35L17 31V24.5L24 20.5Z" fill={`url(#${id}-core)`} />
      <path d="M24 20.5L31 24.5L24 28.5L17 24.5L24 20.5Z" fill="#A8CBFF" fillOpacity="0.85" />
      <path d="M17 24.5L24 28.5V35L17 31V24.5Z" fill="#0B2A5E" fillOpacity="0.45" />
    </svg>
  );
}

/**
 * Probes the brand asset once per session. Rendering the vector first and
 * swapping only on a successful load avoids the broken-image glyph (and its
 * alt text) that an optimistic <img> shows while the file is absent.
 */
let assetStatus: "unknown" | "present" | "absent" = "unknown";

function useBrandAsset() {
  const [available, setAvailable] = React.useState(assetStatus === "present");

  React.useEffect(() => {
    if (assetStatus !== "unknown") {
      setAvailable(assetStatus === "present");
      return;
    }
    const probe = new window.Image();
    probe.onload = () => {
      assetStatus = "present";
      setAvailable(true);
    };
    probe.onerror = () => {
      assetStatus = "absent";
    };
    probe.src = MARK_SRC;
  }, []);

  return available;
}

export function VantaraMark({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  const hasAsset = useBrandAsset();

  return (
    <span
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {hasAsset ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={MARK_SRC} alt="" className="size-full object-contain" />
      ) : (
        <MarkSvg className="size-full" />
      )}
    </span>
  );
}

export function Wordmark({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col justify-center", className)}>
      <span className="select-none whitespace-nowrap text-[14px] font-bold leading-none tracking-[0.16em] text-foreground">
        VANTARA<span className="ml-[0.2em] text-brand-bright">IQ</span>
      </span>
      {showTagline ? (
        <span className="mt-1 truncate text-[8.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Intelligence for every project
        </span>
      ) : null}
    </span>
  );
}

/** Mark + wordmark, for the expanded rail and any full-bleed brand moment. */
export function VantaraLockup({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <VantaraMark size={30} />
      <Wordmark showTagline={showTagline} />
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * NEXGEN BUILD AI brand lockup.
 * ------------------------------------------------------------------ */

const BANNER_SRC = "/nexgen-banner.png";

/**
 * The full NEXGEN BUILD AI banner, for the expanded rail.
 *
 * The source art is a 1536x1024 canvas with the lockup as a wide band through
 * the middle, so `object-contain` alone would shrink it to a stamp and leave
 * most of the row empty. It is scaled up and cropped to the band instead, which
 * is why the wrapper clips rather than letterboxes.
 *
 * The artwork carries an alpha channel and its letterforms are light with dark
 * outlines, so it reads on the near-black rail without a plate behind it.
 */
export function NexgenBanner({ className }: { className?: string }) {
  return (
    <span className={cn("relative block h-8 w-[150px] overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BANNER_SRC}
        alt="NEXGEN BUILD AI"
        className="absolute left-1/2 top-1/2 w-[150px] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
        style={{ height: 150 * (1024 / 1536) }}
      />
    </span>
  );
}

/**
 * Just the N mark, for the collapsed rail.
 *
 * Cropped from the left of the same banner rather than shipped as a second
 * asset — one file to replace when the brand changes, and no risk of the two
 * drifting apart.
 */
export function NexgenMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BANNER_SRC}
        alt="NEXGEN BUILD AI"
        className="absolute left-0 top-1/2 max-w-none -translate-y-1/2 object-contain"
        style={{ width: size * 3.4, height: size * 3.4 * (1024 / 1536) }}
      />
    </span>
  );
}
