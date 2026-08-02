"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/icons";
import { footerNav, navSections } from "@/lib/nav";
import { organization } from "@/data/mock";
import { initials } from "@/lib/format";
import type { NavItem } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VantaraMark, Wordmark } from "@/components/layout/logo";
import { useSidebar } from "@/components/layout/sidebar-context";

export const SIDEBAR_WIDTH = 264;
export const SIDEBAR_WIDTH_COLLAPSED = 68;

function NavRow({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const Icon = getIcon(item.icon);
  const active = pathname === item.href;

  const row = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg text-[13px] font-medium outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring/60",
        collapsed ? "justify-center px-0" : "px-2.5",
        active
          ? "bg-white/[0.07] text-foreground"
          : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      {/* Active rail — anchored outside the padding so it hugs the panel edge */}
      <span
        className={cn(
          "absolute -left-2 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-brand transition-all duration-200",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon
        className={cn(
          "size-[17px] shrink-0 transition-colors",
          active ? "text-brand-bright" : "text-muted-foreground group-hover:text-foreground",
        )}
        strokeWidth={1.9}
      />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span
              className={cn(
                "num shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                active
                  ? "bg-brand text-white"
                  : "bg-white/[0.07] text-muted-foreground ring-1 ring-inset ring-white/[0.06]",
              )}
            >
              {item.badge}
            </span>
          ) : null}
        </>
      )}
      {collapsed && item.badge ? (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand ring-2 ring-sidebar" />
      ) : null}
    </Link>
  );

  if (!collapsed) return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="flex items-center gap-2">
        {item.label}
        {item.badge ? (
          <span className="num rounded-full bg-white/15 px-1.5 text-[10px] font-semibold">
            {item.badge}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarContent({
  collapsed,
  onNavigate,
  showCollapseButton = true,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  showCollapseButton?: boolean;
}) {
  const { toggle } = useSidebar();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-0" : "gap-2.5 px-4",
        )}
      >
        <Link
          href="/"
          onClick={onNavigate}
          aria-label="Vantara IQ — Operations Center"
          className="focus-ring flex min-w-0 items-center gap-2.5 rounded-lg"
        >
          <VantaraMark size={collapsed ? 30 : 32} />
          {!collapsed && <Wordmark />}
        </Link>
        {!collapsed && showCollapseButton ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="focus-ring ml-auto grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <ChevronsLeft className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Sections */}
      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {navSections.map((section) => (
          <div key={section.title} className="space-y-1">
            {!collapsed ? (
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                {section.title}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-white/[0.07]" />
            )}
            {section.items.map((item) => (
              <NavRow key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer nav */}
      <div className="space-y-1 border-t border-sidebar-border px-4 py-3">
        {footerNav.items.map((item) => (
          <NavRow key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>

      {/* Org card */}
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-0")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="focus-ring mx-auto grid size-8 place-items-center rounded-lg bg-white/[0.06] text-[11px] font-semibold text-foreground ring-1 ring-inset ring-white/[0.06]"
              >
                {initials(organization.name)}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {organization.name} · {organization.plan}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            className="focus-ring flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-white/[0.05]"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[11px] font-semibold ring-1 ring-inset ring-white/[0.06]">
              {initials(organization.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-foreground">
                {organization.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {organization.plan} plan
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Desktop rail. Hidden below lg — mobile uses the Sheet in the topbar. */
export function DesktopSidebar() {
  const { collapsed, toggle } = useSidebar();

  return (
    <aside
      data-collapsed={collapsed}
      className="fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border lg:block"
      style={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH,
        transition: "width 260ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <SidebarContent collapsed={collapsed} />

      {/* Expand affordance, only visible while collapsed */}
      {collapsed ? (
        <button
          type="button"
          onClick={toggle}
          aria-label="Expand sidebar"
          className="focus-ring absolute -right-3 top-16 grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-elev-2 transition-colors hover:text-foreground"
        >
          <PanelLeft className="size-3" />
        </button>
      ) : null}
    </aside>
  );
}
