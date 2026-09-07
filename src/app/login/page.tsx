import Link from "next/link";

import { BrandLogo } from "@/components/common/brand-logo";

import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Log in · Vantara IQ" };

export default function LoginPage() {
  return (
    <div className="relative min-h-svh overflow-hidden">
      {/* A deep construction-blue field, so the light logo plate and the form
          both lift off it. Fixed rather than theme-reactive: the login is the
          one screen shown before we know who is looking, and it should look the
          same to everyone. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[#0a1628]"
        style={{
          backgroundImage:
            "radial-gradient(1100px 620px at 12% -8%, rgba(59,130,246,0.34), transparent 62%)," +
            "radial-gradient(900px 560px at 92% 8%, rgba(37,99,235,0.28), transparent 60%)," +
            "radial-gradient(880px 620px at 50% 112%, rgba(14,165,233,0.20), transparent 62%)",
        }}
      />

      {/* Alerts, at the top and reachable without an account.

          It was a 11.5px link at the bottom of the page in white at 45%
          opacity. The two audiences for it are a carrier verifying the
          campaign and a crew member trying to make the texts stop, and
          neither should have to hunt. Stopping in particular has to be at
          least as easy as starting. */}
      <div className="absolute inset-x-0 top-0 z-10 border-b border-white/10 bg-white/[0.04] backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2 px-4 py-2.5">
          <Link
            href="/sms"
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[12.5px] font-semibold text-white ring-1 ring-white/20 transition-colors hover:bg-white/20"
          >
            Text message alerts
          </Link>
          <Link
            href="/sms#stop"
            className="focus-ring inline-flex h-8 items-center rounded-lg px-2.5 text-[12.5px] font-medium text-white/70 transition-colors hover:text-white"
          >
            Stop my texts
          </Link>
        </div>
      </div>

      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 pb-10 pt-20">
      {/* The platform's mark, not a tenant's. This is the front door — whoever
          is signing in has not been identified yet, so there is no company logo
          to show.

          No plate behind it any more: the artwork is transparent and comes in
          both inks, so it sits directly on the page and stays legible whichever
          way the theme is set. The plate only ever existed to give a
          light-backdrop logo somewhere to live. */}
      <div className="mb-8 flex items-center justify-center">
        <BrandLogo height={96} priority className="max-w-full" />
      </div>

      <div className="surface p-6">
        <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">Welcome back</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Sign in to your Vantara IQ account.
        </p>

        <LoginForm />

        <p className="mt-4 rounded-lg border border-border/60 bg-foreground/[0.02] px-3 py-2 text-center text-[11px] text-muted-foreground">
          New subcontractors join via the invite link Fortitude sends.
        </p>
      </div>

        <p className="mt-6 text-center text-[12px] text-white/60">
          Don&apos;t have an account?{" "}
          <Link href="/" className="font-medium text-sky-300 hover:underline">
            Back to Vantara IQ
          </Link>
        </p>
        {/* Reachable without signing in, because the people who need it are
            the ones who cannot get past this screen — a crew wanting job
            alerts, or wanting them to stop. */}
        <p className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-[11.5px] text-white/45">
          <Link href="/sms" className="hover:text-white/80 hover:underline">
            Text message alerts
          </Link>
          <Link href="/privacy" className="hover:text-white/80 hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white/80 hover:underline">
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}
