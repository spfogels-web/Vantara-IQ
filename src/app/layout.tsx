import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { alertsState } from "@/lib/alerts-switch";
import { getNavBadges, getOrganizationLogo , getNotifications } from "@/data/queries";
import { getLocale } from "@/lib/i18n-server";
import { organisationChoices, switchOrganisation } from "@/app/org-actions";
import { OrgProvider } from "@/components/layout/org-provider";
import { getMarkets } from "@/data/markets";
import { getCodeProfile } from "@/data/code-profile";
import { orgSettings } from "@/lib/org-settings";
import { EMPTY_CODE_PROFILE } from "@/lib/unit-codes";
import { getSession } from "@/lib/auth";
import { LanguageProvider } from "@/components/layout/language-provider";

export const metadata: Metadata = {
  title: {
    default: "Operations Center · Vantara IQ",
    template: "%s · Vantara IQ",
  },
  description:
    "Vantara IQ — the operations intelligence platform for infrastructure contractors. Real-time production, schedule risk, crew capacity and cash position in one view.",
  applicationName: "Vantara IQ",
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read once here so the shell can show who is signed in without every page
  // re-querying it.
  /**
   * The shell's own data, and only when there is somebody to render it for.
   *
   * These four all reach the database, and the layout wraps every route —
   * including the marketing homepage, the sign-in page and the public policy
   * pages, none of which have a session and therefore none of which have an
   * organisation to read from. They used to work by falling back to
   * Fortitude's database; with that fallback gone they would throw, and a
   * visitor would get a 500 where the homepage should be.
   *
   * Asking who it is first, and reading the rest only if there is an answer,
   * is both correct and less work: a logged-out visitor was never going to be
   * shown a nav badge or a notification.
   */
  const [user, locale, session] = await Promise.all([
    getCurrentUser(),
    getLocale(),
    getSession(),
  ]);

  const [logoUrl, badges, notifications, markets, codes] = user
    ? await Promise.all([
        getOrganizationLogo(),
        getNavBadges(),
        getNotifications(),
        // This organisation's own markets and code vocabulary, for the pickers
        // and rate cards deep in the tree.
        getMarkets(),
        getCodeProfile(),
      ])
    : [null, undefined, undefined, [], EMPTY_CODE_PROFILE];

  // What this organisation is called, for the screens that speak on its behalf.
  const settings = user ? await orgSettings() : null;

  // The alerts light in the top bar. Staff only — a crew has their own consent
  // and no say in the master switch, and a control they cannot use is a
  // question with no answer.
  const alertsLive = user && isStaff(user.role) ? (await alertsState()).live : undefined;

  // Whether this crew may see their own pay. Off unless the office has
  // turned it on — several owners have their own people fill in the
  // billing and would rather no rate card was in front of them.
  // Empty for everyone but a platform operator, and the account card renders
  // no switcher for a list of one.
  const organisations = user ? await organisationChoices() : [];

  const showPay = user?.subcontractorId
    ? Boolean(
        (
          await prisma.subcontractor.findUnique({
            where: { id: user.subcontractorId },
            select: { showPayToCrew: true },
          })
        )?.showPayToCrew,
      )
    : true;

  return (
    <html
      lang={locale}
      className={`dark vibe-chill ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme and vibe before first paint so there's no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=document.documentElement;var t=localStorage.getItem('vq-theme');if(t==='light'){r.classList.remove('dark');r.classList.add('light');}var v=localStorage.getItem('vq-vibe');if(v==='vibrant'){r.classList.remove('vibe-chill');r.classList.add('vibe-vibrant');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-svh bg-background font-sans antialiased">
        <LanguageProvider locale={locale}>
          <OrgProvider
            orgId={session?.org ?? null}
            markets={markets}
            codes={codes}
            name={settings?.legalName ?? ""}
            shortName={settings?.shortName ?? ""}
            logoUrl={logoUrl ?? null}
          >
          <AppShell
            user={user}
            logoUrl={logoUrl}
            badges={badges}
            notifications={notifications}
            showPay={showPay}
            alertsLive={alertsLive}
            organisations={organisations}
            onSwitchOrganisation={switchOrganisation}
          >
            {children}
          </AppShell>
          </OrgProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
