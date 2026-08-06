"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, MessageSquarePlus, PanelLeft, Settings, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/icons";
import { footerNav, homeHrefFor, navSectionsFor } from "@/lib/nav";
import { organization } from "@/data/mock";
import { initials } from "@/lib/format";
import type { NavItem } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NexgenBanner, NexgenMark } from "@/components/layout/logo";
import { FeedbackDialog } from "@/components/layout/feedback-dialog";
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
          ? "bg-brand/[0.1] text-foreground ring-1 ring-inset ring-brand/20"
          : "text-sidebar-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {/* Active rail — anchored outside the padding so it hugs the panel edge */}
      <span
        className={cn(
          "brand-gradient absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-200",
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
                  ? "brand-gradient text-white"
                  : "bg-foreground/[0.07] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]",
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
          <span className="num rounded-full bg-foreground/15 px-1.5 text-[10px] font-semibold">
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
  logoUrl,
  badges,
  role,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  showCollapseButton?: boolean;
  /** The company mark, once one has been uploaded. */
  logoUrl?: string | null;
  /** Live counts by href, overriding the static nav config. */
  badges?: Record<string, number>;
  /** Drives which rail is built — staff get the full one, crews get theirs. */
  role?: string | null;
}) {
  const { toggle } = useSidebar();
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);

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
          href={homeHrefFor(role)}
          onClick={onNavigate}
          aria-label="NEXGEN BUILD AI"
          className="focus-ring flex min-w-0 items-center gap-2.5 rounded-lg"
        >
          {collapsed ? <NexgenMark size={30} /> : <NexgenBanner />}
        </Link>
        {!collapsed && showCollapseButton ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="focus-ring ml-auto grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ChevronsLeft className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Sections */}
      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {navSectionsFor(role).map((section) => (
          <div key={section.title} className="space-y-1">
            {!collapsed ? (
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                {section.title}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-foreground/[0.07]" />
            )}
            {section.items.map((item) => (
              // Live count wins over the static config; no count means no badge.
              <NavRow
                key={item.href}
                item={badges ? { ...item, badge: badges[item.href] } : item}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
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

      {/* Org card — opens profile / org settings / feedback (Fortitude is the
          Enterprise pilot user, so feedback is a first-class action here). */}
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-0")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <button
                type="button"
                aria-label={`${organization.name} — account menu`}
                className="focus-ring mx-auto grid size-8 place-items-center rounded-lg bg-foreground/[0.06] text-[11px] font-semibold text-foreground ring-1 ring-inset ring-foreground/[0.06]"
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="size-full rounded-lg object-contain p-0.5" />
                ) : (
                  initials(organization.name)
                )}
              </button>
            ) : (
              <button
                type="button"
                className="focus-ring flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-foreground/[0.05]"
              >
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-foreground/[0.06] text-[11px] font-semibold ring-1 ring-inset ring-foreground/[0.06]">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="size-full object-contain p-0.5" />
                  ) : (
                    initials(organization.name)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-foreground">
                    {organization.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {organization.plan} · pilot
                  </span>
                </span>
              </button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={12}
            className="w-60 rounded-xl border-foreground/[0.08] shadow-elev-3"
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-[12.5px] font-medium text-foreground">{organization.name}</span>
              <span className="text-[10.5px] font-normal text-muted-foreground">
                {organization.plan} plan · pilot account
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2.5 py-2 text-[12.5px]">
              <Link href="/settings">
                <UserRound className="size-4 text-muted-foreground" />
                Manage profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2.5 py-2 text-[12.5px]">
              <Link href="/settings">
                <Settings className="size-4 text-muted-foreground" />
                Organization settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setFeedbackOpen(true)}
              className="gap-2.5 py-2 text-[12.5px]"
            >
              <MessageSquarePlus className="size-4 text-brand-bright" />
              Give feedback
              <span className="ml-auto rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-bright">
                Pilot
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
}

/** Desktop rail. Hidden below lg — mobile uses the Sheet in the topbar. */
export function DesktopSidebar({
  logoUrl,
  badges,
  role,
}: {
  logoUrl?: string | null;
  badges?: Record<string, number>;
  role?: string | null;
}) {
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
      <SidebarContent collapsed={collapsed} logoUrl={logoUrl} badges={badges} role={role} />

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
