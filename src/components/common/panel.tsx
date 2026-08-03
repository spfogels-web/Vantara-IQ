import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The one card chrome used by every dashboard section. Centralising it is what
 * keeps header height, padding and hairlines identical across the grid — the
 * detail that separates a designed dashboard from an assembled one.
 */
export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        // h-full lets grid siblings in the same row finish on the same line,
        // which is most of what makes a dashboard look composed rather than
        // assembled.
        "surface surface-interactive relative flex h-full min-w-0 flex-col overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  icon,
  count,
  action,
  actionHref,
  className,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  count?: number;
  action?: string;
  actionHref?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex items-center gap-3 border-b border-border/70 px-4 py-3 sm:px-5",
        className,
      )}
    >
      {icon ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
          {icon}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* Wraps on phones, truncates once there's room for a single line —
              a clipped section title is worse than a two-line one. */}
          <h2 className="text-[13.5px] font-semibold leading-tight tracking-[-0.01em] text-foreground sm:truncate">
            {title}
          </h2>
          {typeof count === "number" ? (
            <span className="num shrink-0 rounded-full bg-foreground/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
              {count}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {children}

      {action ? (
        <Link
          href={actionHref ?? "#"}
          className="focus-ring group inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
          <ArrowUpRight className="size-3 transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" />
        </Link>
      ) : null}
    </header>
  );
}

export function PanelBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("min-w-0 flex-1 p-4 sm:p-5", className)} {...props} />;
}

export function PanelFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-auto flex items-center gap-3 border-t border-border/70 px-4 py-2.5 text-[11.5px] text-muted-foreground sm:px-5",
        className,
      )}
      {...props}
    />
  );
}
