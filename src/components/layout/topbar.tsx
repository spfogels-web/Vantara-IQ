"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CreditCard,
  LogOut,
  Menu,
  MessageSquarePlus,
  Plus,
  Search,
  Settings,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/icons";
import { initials } from "@/lib/format";
import { toneStyles } from "@/lib/tone";
import { organization } from "@/data/mock";
import type { AppNotification } from "@/lib/types";
import { markNotificationsRead } from "@/app/actions";
import type { CurrentUser } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarContent } from "@/components/layout/sidebar";
import { useSidebar } from "@/components/layout/sidebar-context";
import { useCommandMenu } from "@/components/layout/command-menu";
import { quickActionsFor } from "@/lib/quick-actions";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/components/layout/language-provider";
import { VibeToggle } from "@/components/layout/vibe-toggle";
import { FeedbackDialog } from "@/components/layout/feedback-dialog";
import { LiveDot } from "@/components/common/status-pill";

/** Renders ⌘ on Mac, Ctrl elsewhere — resolved after mount to avoid a mismatch. */
function useMetaKeyLabel() {
  const [label, setLabel] = React.useState("Ctrl");
  React.useEffect(() => {
    const isMac = /mac|iphone|ipad/i.test(window.navigator.userAgent);
    setLabel(isMac ? "⌘" : "Ctrl");
  }, []);
  return label;
}

function SearchTrigger({ className }: { className?: string }) {
  const { setOpen } = useCommandMenu();
  const meta = useMetaKeyLabel();
  const t = useT();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "focus-ring group flex h-9 items-center gap-2.5 rounded-lg border border-foreground/[0.07] bg-foreground/[0.03] px-3 text-left transition-colors hover:border-foreground/[0.12] hover:bg-foreground/[0.05]",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
        {t("Search projects, dailies, crews…")}
      </span>
      <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-foreground/[0.08] bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
        {meta}K
      </kbd>
    </button>
  );
}

/**
 * The viewer's own feed.
 *
 * Handed in from the server already scoped to whoever is asking: staff get the
 * office feed, a crew gets only rows written about their own work. Nothing is
 * filtered here, which is the point — a filter in a component is a filter
 * somebody can forget.
 */
function NotificationsPopover({ notifications }: { notifications: AppNotification[] }) {
  const router = useRouter();
  const unread = notifications.filter((n) => n.unread).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications, ${unread} unread`}
          className="focus-ring relative grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <Bell className="size-[18px]" strokeWidth={1.9} />
          {unread > 0 ? (
            <span className="num absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-[9px] font-bold text-white ring-2 ring-background">
              {unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border-foreground/[0.08] p-0 shadow-elev-3"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold">Notifications</h3>
            <span className="num rounded-full bg-critical/15 px-1.5 py-0.5 text-[10px] font-semibold text-critical">
              {unread} new
            </span>
          </div>
          <button
            type="button"
            onClick={() => void markNotificationsRead().then(() => router.refresh())}
            className="focus-ring rounded-md px-1.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Mark all read
          </button>
        </div>

        <div className="max-h-[22rem] overflow-y-auto">
          {notifications.map((item) => {
            const Icon = getIcon(item.icon);
            const tone = toneStyles[item.tone];
            return (
              <button
                key={item.id}
                className="flex w-full gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-foreground/[0.03]"
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border",
                    tone.bg,
                    tone.border,
                    tone.text,
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-foreground">
                      {item.title}
                    </span>
                    {item.unread ? (
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                    {item.detail}
                  </span>
                  <span className="mt-1 block text-[10.5px] text-muted-foreground/70">
                    {item.time}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border/70 p-2">
          <Link
            href="/notifications"
            className="focus-ring block rounded-lg px-3 py-2 text-center text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Create button.
 *
 * Every item is a Link rather than a bare row — the menu did render, but
 * nothing on it went anywhere, which is indistinguishable from a dead button.
 *
 * The ⌘D / ⌘P / ⌘U shortcuts it used to advertise are gone. They were never
 * bound to anything, and binding them was the wrong fix: ⌘P is print, which
 * this app needs for the Globe billing sheet, and ⌘D is bookmark. ⌘K opens the
 * palette, which offers the same three.
 */
function QuickActions({ role }: { role?: string | null }) {
  const t = useT();
  const actions = quickActionsFor(role);
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className="brand-gradient glow-brand h-9 gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-white"
        >
          <Plus className="size-4" strokeWidth={2.4} />
          <span className="hidden sm:inline">{t("Create")}</span>
          <ChevronDown className="hidden size-3 opacity-70 sm:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-xl border-foreground/[0.08] shadow-elev-3">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {t("Quick actions")}
        </DropdownMenuLabel>
        {actions.map((action) => (
          <DropdownMenuItem asChild key={action.label} className="gap-2.5 py-2">
            <Link href={action.href}>
              <action.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-[12.5px] leading-tight text-foreground">
                  {t(action.label)}
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
                  {t(action.hint)}
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  PM: "Project manager",
  OFFICE: "Office",
  SUBCONTRACTOR: "Subcontractor",
};

function UserMenu({ user: current }: { user: CurrentUser | null }) {
  // Falls back to the fixture only when nobody is signed in, which in practice
  // means a page rendered outside the authenticated shell.
  const user = current
    ? {
        name: current.name,
        email: current.email,
        role: ROLE_LABEL[current.role] ?? current.role,
      }
    : organization.user;
  const plan = current?.organizationPlan ?? organization.plan;
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);

  return (
    <>
    <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="focus-ring flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-foreground/[0.06]"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-bright to-brand text-[11px] font-semibold text-white ring-1 ring-inset ring-foreground/20">
            {initials(user.name)}
          </span>
          <span className="hidden min-w-0 text-left xl:block">
            <span className="block truncate text-[12.5px] font-medium leading-tight text-foreground">
              {user.name}
            </span>
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              {user.role}
            </span>
          </span>
          <ChevronDown className="hidden size-3.5 shrink-0 text-muted-foreground xl:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-64 rounded-xl border-foreground/[0.08] shadow-elev-3">
        <div className="flex items-center gap-3 px-2 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-bright to-brand text-[12px] font-semibold text-white">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium">{user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        </div>
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
            Workspace settings
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
        <DropdownMenuItem className="gap-2.5 py-2 text-[12.5px]">
          <CreditCard className="size-4 text-muted-foreground" />
          Billing &amp; plan
          <span className="ml-auto rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-bright">
            {plan}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void logout()}
          className="gap-2.5 py-2 text-[12.5px] text-critical focus:text-critical"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}

function MobileNav({
  logoUrl,
  badges,
  role,
}: {
  logoUrl?: string | null;
  badges?: Record<string, number>;
  role?: string | null;
}) {
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="focus-ring grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground lg:hidden"
        >
          <Menu className="size-[18px]" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[272px] border-sidebar-border p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarContent
          logoUrl={logoUrl}
          badges={badges}
          role={role}
          collapsed={false}
          showCollapseButton={false}
          onNavigate={() => setMobileOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

export function Topbar({
  user,
  logoUrl,
  badges,
  notifications = [],
}: {
  user: CurrentUser | null;
  logoUrl?: string | null;
  badges?: Record<string, number>;
  notifications?: AppNotification[];
}) {
  const { setOpen: setCommandOpen } = useCommandMenu();
  const t = useT();

  return (
    <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-5">
      <MobileNav logoUrl={logoUrl} badges={badges} role={user?.role} />

      {/* From md up the search field is present and absorbs the squeeze, so the
          title keeps shrink-0 and never collapses to an ellipsis. Below md
          there is no search field to give way, and the title was holding the
          bar wider than the phone — enough that the whole page scrolled
          sideways and a fixed overlay stretched with it. So it truncates there,
          and only there. */}
      <div className="flex min-w-0 shrink items-center gap-2.5 md:shrink-0">
        <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground md:whitespace-nowrap">
          {user?.role === "SUBCONTRACTOR"
            ? (user.subcontractorName ?? t("Crew portal"))
            : t("Operations Center")}
        </h1>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2 py-[3px] text-[10.5px] font-medium text-success sm:inline-flex">
              <LiveDot />
              {t("Live")}
            </span>
          </TooltipTrigger>
          <TooltipContent>Data refreshed 2 minutes ago</TooltipContent>
        </Tooltip>
      </div>

      <SearchTrigger className="mx-auto hidden w-full min-w-0 max-w-md md:flex" />

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5 md:ml-0">
        <button
          type="button"
          aria-label="Search"
          className="focus-ring grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground md:hidden"
          onClick={() => setCommandOpen(true)}
        >
          <Search className="size-[18px]" />
        </button>
        <QuickActions role={user?.role} />
        <LanguageToggle />
        <VibeToggle />
        <ThemeToggle />
        <NotificationsPopover notifications={notifications} />
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
