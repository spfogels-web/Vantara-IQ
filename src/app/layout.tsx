import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
