import Link from "next/link";
import { Zap } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Log in · Vantara IQ" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center justify-center gap-2.5">
        <span className="brand-gradient glow-brand grid size-8 place-items-center rounded-lg text-white">
          <Zap className="size-4" strokeWidth={2.4} />
        </span>
        <span className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">
          VANTARA <span className="text-brand-bright">IQ</span>
        </span>
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

      <p className="mt-6 text-center text-[12px] text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/" className="font-medium text-brand-bright hover:underline">
          Back to Vantara IQ
        </Link>
      </p>
    </div>
  );
}
