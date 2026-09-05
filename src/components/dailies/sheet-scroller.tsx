"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A scrollbar for the Globe form that a person can actually see.
 *
 * The form is 17 columns and 1420px wide, and it has always scrolled — but on
 * a dark background with overlay scrollbars there is nothing on screen saying
 * so. A sheet that ends at the right edge of the window reads as a sheet that
 * ends, and the unit code columns past the fold read as missing. The office
 * asked where the rest of the sheet had gone; it had not gone anywhere.
 *
 * So: the word SCROLL, two arrows, and a track showing how much of the form is
 * in view and where in it you are. It only appears when there is something to
 * scroll — on a wide monitor the whole sheet fits and a control for a thing
 * that cannot happen is worse than no control.
 *
 * It drives the real scroll container rather than replacing it. Trackpads,
 * shift-wheel, touch and keyboard all still work, and stay in step with this.
 */
export function SheetScroller({
  targetRef,
  className,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const [geom, setGeom] = React.useState({ left: 0, max: 0, view: 0, total: 0 });
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragFrom = React.useRef<{ x: number; left: number } | null>(null);

  const read = React.useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    setGeom({
      left: el.scrollLeft,
      max: Math.max(0, el.scrollWidth - el.clientWidth),
      view: el.clientWidth,
      total: el.scrollWidth,
    });
  }, [targetRef]);

  React.useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    read();
    el.addEventListener("scroll", read, { passive: true });
    // The sheet's width changes with the window and with the sidebar folding
    // away, so the track has to be re-measured rather than measured once.
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", read);
      ro.disconnect();
    };
  }, [targetRef, read]);

  /** Nothing to scroll — the whole form is on screen. */
  if (geom.max < 2) return null;

  const atStart = geom.left <= 1;
  const atEnd = geom.left >= geom.max - 1;
  // How much of the form is in view, and where that window sits in it.
  const thumbPct = Math.max(8, (geom.view / geom.total) * 100);
  const leftPct = (geom.left / geom.total) * 100;

  const nudge = (dir: -1 | 1) => {
    const el = targetRef.current;
    if (!el) return;
    // Just under a screenful, so a column or two carries over and you can see
    // where the last view ended.
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  /** Map a pointer position on the track to a scroll position. */
  const seek = (clientX: number) => {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const r = track.getBoundingClientRect();
    const frac = (clientX - r.left) / r.width;
    el.scrollLeft = frac * el.scrollWidth - el.clientWidth / 2;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-border bg-foreground/[0.03] px-2.5 py-2 print:hidden",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Scroll the sheet left"
        onClick={() => nudge(-1)}
        disabled={atStart}
        className="focus-ring grid size-7 shrink-0 place-items-center rounded-lg border border-border text-foreground transition-colors hover:bg-foreground/[0.06] disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </button>

      <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">
        Scroll
      </span>

      {/* The track is the honest part: its thumb is as wide a share of it as
          the visible sheet is of the whole form, so the size of the thing you
          are dragging says how much is off screen. */}
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragFrom.current = { x: e.clientX, left: geom.left };
          seek(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragFrom.current) seek(e.clientX);
        }}
        onPointerUp={() => {
          dragFrom.current = null;
        }}
        onPointerCancel={() => {
          dragFrom.current = null;
        }}
        className="relative h-2.5 min-w-0 flex-1 cursor-pointer rounded-full bg-foreground/[0.09]"
      >
        <div
          className="pointer-events-none absolute inset-y-0 rounded-full bg-gold/70"
          style={{ width: `${thumbPct}%`, left: `${leftPct}%` }}
        />
      </div>

      <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
        {/* Named rather than implied. A crew told the sheet is 1420px wide
            learns nothing; a crew told they are seeing half of it knows to
            keep going. */}
        {Math.round((geom.view / geom.total) * 100)}% of the sheet in view
      </span>

      <button
        type="button"
        aria-label="Scroll the sheet right"
        onClick={() => nudge(1)}
        disabled={atEnd}
        className="focus-ring grid size-7 shrink-0 place-items-center rounded-lg border border-border text-foreground transition-colors hover:bg-foreground/[0.06] disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
