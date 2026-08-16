import Link from "next/link";

/**
 * The public legal pages.
 *
 * Deliberately outside the app shell and outside the session check. A carrier
 * vetting an A2P campaign opens these in a clean browser with no account, and
 * a login wall reads as a company with nothing to show — which is the fastest
 * way to have a campaign rejected.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-5 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-[46rem]">
        <header className="mb-8 border-b border-border pb-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
            Fortitude Infrastructure LLC
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Underground utility and fiber construction · Anderson, South Carolina
          </p>
        </header>

        <article className="legal-prose">{children}</article>

        <footer className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-[12.5px] text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms &amp; SMS Program Conditions
          </Link>
          <span>© {new Date().getFullYear()} Fortitude Infrastructure LLC</span>
        </footer>
      </div>
    </div>
  );
}
