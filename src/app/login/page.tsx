import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Log in · NEXGEN BUILD AI" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
      {/* The platform's mark, not a tenant's. This is the front door — whoever
          is signing in hasn't been identified yet, so there is no company logo
          to show and NEXGEN is the right brand here. */}
      <div className="mb-8 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nexgen-banner.png"
          alt="NEXGEN BUILD AI"
          className="h-14 w-auto max-w-[260px] object-contain"
        />
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

      <p className="mt-6 text-center text-[12px] text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/" className="font-medium text-brand-bright hover:underline">
          Back to NEXGEN BUILD AI
        </Link>
      </p>
    </div>
  );
}
