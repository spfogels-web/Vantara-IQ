import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { getNavBadges, getOrganizationLogo , getNotifications } from "@/data/queries";
import { getLocale } from "@/lib/i18n-server";
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
  const [user, logoUrl, badges, notifications, locale] = await Promise.all([
    getCurrentUser(),
    getOrganizationLogo(),
    getNavBadges(),
    getNotifications(),
    getLocale(),
  ]);

  // Whether this crew may see their own pay. Off unless the office has
  // turned it on — several owners have their own people fill in the
  // billing and would rather no rate card was in front of them.
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
          <AppShell
            user={user}
            logoUrl={logoUrl}
            badges={badges}
            notifications={notifications}
            showPay={showPay}
          >
            {children}
          </AppShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
