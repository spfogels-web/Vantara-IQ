import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Log in · NEXGEN BUILD AI" };

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

      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
      {/* The platform's mark, not a tenant's. This is the front door — whoever
          is signing in hasn't been identified yet, so there is no company logo
          to show and NEXGEN is the right brand here.

          The artwork is drawn for a light backdrop: NEXGEN is white-filled with
          dark outlines, BUILD AI is thin dark type. On a dark page the wordmark
          pops and BUILD AI vanishes; on a plain white one the reverse. So it
          sits on its own light plate, which is the surface it was designed for,
          and the plate is what makes it stand off the page. */}
      <div className="mb-8 flex items-center justify-center">
        <div className="rounded-2xl bg-gradient-to-b from-white to-[#eef3fa] px-7 py-5 shadow-[0_18px_50px_-12px_rgba(12,32,64,0.45)] ring-1 ring-black/[0.06]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nexgen-banner.png"
            alt="NEXGEN BUILD AI"
            className="h-24 w-auto max-w-[380px] object-contain sm:h-28"
          />
        </div>
      </div>

      <div className="surface p-6">
        <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">Welcome back</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Sign in to your NEXGEN BUILD AI account.
        </p>

        <LoginForm />

        <p className="mt-4 rounded-lg border border-border/60 bg-foreground/[0.02] px-3 py-2 text-center text-[11px] text-muted-foreground">
          New subcontractors join via the invite link Fortitude sends.
        </p>
      </div>

        <p className="mt-6 text-center text-[12px] text-white/60">
          Don&apos;t have an account?{" "}
          <Link href="/" className="font-medium text-sky-300 hover:underline">
            Back to NEXGEN BUILD AI
          </Link>
        </p>
      </div>
    </div>
  );
}
