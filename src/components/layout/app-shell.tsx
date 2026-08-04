"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-context";
import { CommandMenuProvider } from "@/components/layout/command-menu";
import {
  DesktopSidebar,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_COLLAPSED,
} from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { CurrentUser } from "@/lib/auth";
import { useIsDesktop } from "@/hooks/use-media-query";

/**
 * The main column offsets itself by the rail width rather than sitting in a
 * flex row, so the sidebar can stay `fixed` and the page scrolls independently
 * of it — no nested scroll containers, no sticky-header jitter.
 */
function ShellFrame({
  children,
  user,
  logoUrl,
  badges,
}: {
  children: React.ReactNode;
  user: CurrentUser | null;
  logoUrl?: string | null;
  badges?: Record<string, number>;
}) {
  const { collapsed } = useSidebar();
  const isDesktop = useIsDesktop();

  const offset = isDesktop ? (collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH) : 0;

  return (
    <div className="aurora relative min-h-svh">
      <DesktopSidebar logoUrl={logoUrl} badges={badges} role={user?.role} />

      <div
        className="relative z-10 flex min-h-svh flex-col"
        style={{
          marginInlineStart: offset,
          transition: "margin-inline-start 260ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <Topbar user={user} logoUrl={logoUrl} badges={badges} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  user,
  logoUrl,
  badges,
}: {
  children: React.ReactNode;
  user: CurrentUser | null;
  logoUrl?: string | null;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();

  // Public, external-facing routes (e.g. subcontractor onboarding) render
  // full-bleed — no internal sidebar, topbar or command palette.
  if (pathname?.startsWith("/invite") || pathname?.startsWith("/login")) {
    return (
      <TooltipProvider delayDuration={300} skipDelayDuration={200}>
        <div className="aurora relative min-h-svh">{children}</div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={200}>
      <SidebarProvider>
        <CommandMenuProvider role={user?.role}>
          <ShellFrame user={user} logoUrl={logoUrl} badges={badges}>{children}</ShellFrame>
        </CommandMenuProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}
