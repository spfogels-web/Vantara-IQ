"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { normalizeCode } from "@/lib/unit-codes";

/**
 * Picking a unit code on a daily sheet.
 *
 * The card for a job runs to dozens of codes and sometimes thousands. A plain
 * dropdown means scrolling for the one you want, which is how a crew ends up
 * typing it from memory — and a typed code that misses the card by a character
 * prices at nothing, files clean, and is found a month later in the billing.
 *
 * So: click and the codes are there; start typing and they narrow. The order
 * is deliberate, because the first row is the one a thumb hits:
 *
 *   1. the exact code
 *   2. codes starting with what was typed
 *   3. codes containing it
 *   4. descriptions containing it — "pedestal" finds BD4MPF
 *
 * A code the card has never had is still allowed. Losing what a crew wrote
 * down is worse than showing something unpayable, and the sheet flags it in
 * warning colour either way.
 */

export type CodeOption = {
  code: string;
  description: string;
  /** One of the families this organisation bills most. Breaks ties only. */
  preferred?: boolean;
};

/** Where a query matched. Lower sorts first. */
function rank(option: CodeOption, query: string): number {
  if (!query) return option.preferred ? 0 : 1;

  const code = normalizeCode(option.code);
  const q = normalizeCode(query);
  const description = option.description.toLowerCase();
  const raw = query.trim().toLowerCase();

  if (code === q) return 0;
  if (code.startsWith(q)) return 1;
  if (code.includes(q)) return 2;
  if (raw && description.includes(raw)) return 3;
  return -1;
}

export function CodeCombobox({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: CodeOption[];
  label: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);

  const boxRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();

  // Null query means "not typing" — the field shows the chosen code and the
  // list shows everything. Typing replaces it until the field is left.
  const typed = query ?? "";

  const matches = React.useMemo(() => {
    const scored = options
      .map((o) => ({ o, r: rank(o, typed) }))
      .filter((m) => m.r >= 0)
      .sort((a, b) => a.r - b.r || (a.o.preferred === b.o.preferred ? 0 : a.o.preferred ? -1 : 1));
    // Long cards are the reason this exists; rendering all of them on every
    // keystroke is its own kind of unusable. The ranking above means the ones
    // worth seeing are already at the front.
    return scored.slice(0, 50).map((m) => m.o);
  }, [options, typed]);

  const onCard = React.useMemo(
    () => options.some((o) => normalizeCode(o.code) === normalizeCode(value)),
    [options, value],
  );

  React.useEffect(() => setActive(0), [typed, open]);

  // Close when focus or a click leaves the field and its list together.
  React.useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | FocusEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(null);
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  // Keep the highlighted row in view when arrowing through a long list.
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-active="true"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [active, open]);

  function choose(option: CodeOption) {
    onChange(option.code);
    setQuery(null);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
      return;
    }

    if (e.key === "Enter") {
      // Only when a row is highlighted. Otherwise Enter belongs to the sheet.
      if (open && matches[active]) {
        e.preventDefault();
        choose(matches[active]);
      }
      return;
    }

    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery(null);
      }
      return;
    }

    if (e.key === "Tab") {
      setOpen(false);
      setQuery(null);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query ?? value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          // Cards are upper case throughout; matching on what a glove actually
          // types matters more than preserving the case.
          const next = e.target.value.toUpperCase();
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          // Reads as the cell beside it, not as a form control.
          "mt-0.5 h-8 w-full bg-transparent px-0.5 text-center",
          "text-[12px] font-semibold uppercase outline-none focus:bg-brand/10",
          "print:h-5 print:text-[9px]",
          // A code the card cannot price is the expensive mistake. Saying so
          // while it is typed beats a banner after the sheet is filed.
          value && !onCard ? "text-warning" : "text-foreground",
          className,
        )}
      />

      {open && matches.length > 0 ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          // Print takes the field's value, never this list.
          className={cn(
            "absolute left-1/2 z-50 mt-0.5 max-h-64 w-[min(22rem,80vw)] -translate-x-1/2 overflow-y-auto",
            "rounded-lg border border-border bg-popover p-1 text-left shadow-elev-3",
            "print:hidden",
          )}
        >
          {matches.map((o, i) => (
            <li
              key={o.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              // mousedown, not click: click fires after blur, which closes the
              // list before the choice lands.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "cursor-pointer rounded-md px-2 py-1.5",
                i === active ? "bg-brand/15" : "hover:bg-foreground/[0.05]",
              )}
            >
              <span className="block font-mono text-[11.5px] font-semibold text-foreground">
                {o.code}
              </span>
              {o.description ? (
                <span className="block truncate text-[10.5px] text-muted-foreground">
                  {o.description}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Exported for tests: the ranking is the part worth holding still. */
export const __ranking = { rank };
