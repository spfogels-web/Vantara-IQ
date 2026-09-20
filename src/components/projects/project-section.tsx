"use client";

/**
 * One row of the project command page.
 *
 * The page it replaces was a column of ten panels, every one of them open, and
 * reading it meant scrolling past a 62-page plan drawing to find out who was
 * on the job. An operations manager opening a project wants the same ten facts
 * every time and usually only one of the ten sections; so the facts live on the
 * closed rows and the sections open on demand.
 *
 * Two things follow from that, and both matter more than the styling:
 *
 * - A closed row still has to answer its own question. "13 codes ·
 *   $23,206 / $14,295" is the reason not to open Rates. A row that says only
 *   "Rates" has made the page longer and told nobody anything, which is what
 *   the old page did.
 * - What is closed is not mounted. `children` is rendered on the server either
 *   way, but the PDF engine, the evidence gallery and the rate table do not
 *   become live client components until somebody asks for them. Opening every
 *   section at once was the cost of the old page, and an accordion that merely
 *   hides them with CSS keeps paying it.
 *
 * Sections are independent. Opening Rates does not close Dailies, because
 * comparing two of them is a real thing people do and a page that fights it is
 * worse than a long one.
 */
import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The colour a section is known by.
 *
 * Ten identical grey tiles make the page one undifferentiated column, and the
 * eye has to read every label to find the one it wants. A colour per section
 * means somebody who opens this page daily stops reading and starts aiming —
 * the orange one is material, the violet one is the photographs.
 *
 * Named against the palette rather than given hex values, so both themes keep
 * working: every one of these is redefined for light mode, where the dark
 * theme's pastels would be illegible on white.
 */
export type SectionAccent =
  | "green"
  | "blue"
  | "blue-bright"
  | "gold"
  | "orange"
  | "cyan"
  | "indigo"
  | "violet"
  | "red";

export function ProjectSection({
  icon,
  title,
  description,
  summary,
  badge,
  accent = "blue",
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  /** What the section is for, in one line. Never a restatement of the title. */
  description: string;
  /**
   * The live summary, on the right of the closed row.
   *
   * Derived from data the page already loaded — never a second query, and
   * never a placeholder. A section with nothing in it says so plainly rather
   * than showing a zero dressed up as a figure.
   */
  summary?: React.ReactNode;
  badge?: React.ReactNode;
  accent?: SectionAccent;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = React.useId();

  return (
    <section
      // The accent travels as a custom property rather than as a class name.
      // Tailwind only keeps classes it can find as literal strings, so a
      // `text-${accent}` built at runtime would be stripped from the bundle and
      // every tile would silently come back grey.
      style={{ ["--accent" as string]: `var(--vq-${accent})` }}
      className={cn(
        "overflow-hidden rounded-xl border transition-colors",
        open
          ? "border-brand/35 bg-foreground/[0.025]"
          : "border-border/60 bg-foreground/[0.015] hover:border-border",
      )}
    >
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="focus-ring flex w-full items-center gap-3 px-3 py-3 text-left sm:gap-3.5 sm:px-4"
        >
          {/* The tile carries the section's colour whether it is open or not.
              Colouring only the open one would mean the closed page — the one
              people actually scan — is the grey column this was meant to fix.
              Opening it deepens the same hue rather than changing it. */}
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors sm:size-9",
              "text-[var(--accent)]",
              "border-[color-mix(in_oklab,var(--accent)_32%,transparent)]",
              open
                ? "bg-[color-mix(in_oklab,var(--accent)_20%,transparent)]"
                : "bg-[color-mix(in_oklab,var(--accent)_11%,transparent)]",
            )}
          >
            {icon}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">
                {title}
              </span>
              {badge}
            </span>
            {/* The description is for somebody who has not used the page
                before. It gives up its room on a phone, where the summary is
                the thing worth the width. */}
            <span className="mt-0.5 hidden truncate text-[12px] text-muted-foreground md:block">
              {description}
            </span>
          </span>

          {summary ? (
            <span className="hidden shrink-0 text-right text-[12px] text-muted-foreground sm:block">
              {summary}
            </span>
          ) : null}

          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>

      {/* Below the fold on a phone, where the row above has no room for it. */}
      {summary ? (
        <p className="border-t border-border/40 px-3 py-1.5 text-[12px] text-muted-foreground sm:hidden">
          {summary}
        </p>
      ) : null}

      {open ? (
        <div id={panelId} className="border-t border-border/50">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A figure and what it is, for the closed rows.
 *
 * Separated by a middot rather than a table, because these are read at a
 * glance and in a row — and because a section with one fact and a section with
 * three should look like the same kind of thing.
 */
export function Summary({ parts }: { parts: (string | null | undefined | false)[] }) {
  const kept = parts.filter((p): p is string => Boolean(p));
  if (!kept.length) return null;
  return (
    <span className="num">
      {kept.map((p, i) => (
        <React.Fragment key={p + i}>
          {i > 0 ? <span className="px-1.5 text-muted-foreground/40">·</span> : null}
          {p}
        </React.Fragment>
      ))}
    </span>
  );
}
