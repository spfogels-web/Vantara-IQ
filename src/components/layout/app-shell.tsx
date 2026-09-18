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
import type { AppNotification } from "@/lib/types";
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
  notifications,
  showPay,
  alertsLive,
  organisations,
  onSwitchOrganisation,
}: {
  children: React.ReactNode;
  user: CurrentUser | null;
  logoUrl?: string | null;
  badges?: Record<string, number>;
  notifications?: AppNotification[];
  /** Whether this crew may see their own pay. Off unless the office says so. */
  showPay?: boolean;
  /** Whether outbound texts are on. Undefined for anyone who cannot change it. */
  alertsLive?: boolean;
  /** Organisations this person may enter. One or none means no switcher. */
  organisations?: { id: string; label: string; active: boolean }[];
  onSwitchOrganisation?: (id: string) => Promise<unknown>;
}) {
  const { collapsed } = useSidebar();
  const isDesktop = useIsDesktop();

  const offset = isDesktop ? (collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH) : 0;

  /**
   * Whose name goes on the account card.
   *
   * A crew sees their own company, because that is the account they are signed
   * in to — showing them the prime's name was an accident of the card reading
   * from a fixture. The office sees the organization, and the plan only
   * appears for staff: what a customer pays for the software is not a crew's
   * business.
   */
  const isCrew = user?.role === "SUBCONTRACTOR";

  /**
   * When someone can move between organisations, the card has to name the one
   * they are looking at rather than the one their account lives in — otherwise
   * switching to Apex leaves "Fortitude Infrastructure" on screen, which is the
   * single most misleading thing this card could say.
   *
   * For everyone else there is one organisation and nothing changes.
   */
  const active = organisations?.find((o) => o.active);
  const workspace = organisations && organisations.length > 1 ? active?.label : null;

  const account = user
    ? {
        name:
          (isCrew ? user.subcontractorName : workspace || user.organizationName) ||
          user.organizationName,
        plan: isCrew ? null : user.organizationPlan,
      }
    : null;

  return (
    <div className="aurora relative min-h-svh">
      <DesktopSidebar
        logoUrl={logoUrl}
        badges={badges}
        role={user?.role}
        showPay={showPay}
        account={account}
        organisations={organisations}
        onSwitchOrganisation={onSwitchOrganisation}
      />

      <div
        className="relative z-10 flex min-h-svh flex-col"
        style={{
          marginInlineStart: offset,
          transition: "margin-inline-start 260ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <Topbar
          user={user}
          logoUrl={logoUrl}
          badges={badges}
          notifications={notifications}
          alertsLive={alertsLive}
        />
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
  notifications,
  showPay,
  alertsLive,
  organisations,
  onSwitchOrganisation,
}: {
  children: React.ReactNode;
  user: CurrentUser | null;
  logoUrl?: string | null;
  badges?: Record<string, number>;
  notifications?: AppNotification[];
  /** Whether this crew may see their own pay. Off unless the office says so. */
  showPay?: boolean;
  alertsLive?: boolean;
  organisations?: { id: string; label: string; active: boolean }[];
  onSwitchOrganisation?: (id: string) => Promise<unknown>;
}) {
  const pathname = usePathname();

  /**
   * Public, external-facing routes render full-bleed — no internal sidebar,
   * topbar or command palette.
   *
   * The compliance pages belong here and were not: a carrier vetting the A2P
   * campaign opened /privacy and /sms and got the whole internal navigation
   * wrapped around them, which reads as an application screenshot rather than
   * a published policy — and puts the shape of the product in front of
   * somebody who has no business seeing it.
   */
  const bare = ["/invite", "/login", "/sms", "/privacy", "/terms"];
  // The root is bare for a visitor and the full application for a user.
  // Wrapping the marketing site in the internal navigation would put the
  // shape of the product in front of somebody who has not bought it, and
  // read as a screenshot rather than a homepage.
  const marketingRoot = pathname === "/" && !user;
  if (marketingRoot || bare.some((r) => pathname === r || pathname?.startsWith(`${r}/`))) {
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
          <ShellFrame
            user={user}
            logoUrl={logoUrl}
            badges={badges}
            notifications={notifications}
            showPay={showPay}
            alertsLive={alertsLive}
            organisations={organisations}
            onSwitchOrganisation={onSwitchOrganisation}
          >
            {children}
          </ShellFrame>
        </CommandMenuProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}
