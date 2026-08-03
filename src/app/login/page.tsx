import Link from "next/link";
import { Zap } from "lucide-react";

export const metadata = { title: "Log in · Vantara IQ" };

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

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

        <form className="mt-5 flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">Work email</span>
            <input type="email" placeholder="you@company.com" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between">
              <span className="text-[11.5px] font-medium text-muted-foreground">Password</span>
              <span className="text-[11px] text-brand-bright">Forgot?</span>
            </span>
            <input type="password" placeholder="••••••••" className={inputClass} />
          </label>
          <button
            type="button"
            className="brand-gradient focus-ring mt-1 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 rounded-lg border border-border/60 bg-foreground/[0.02] px-3 py-2 text-center text-[11px] text-muted-foreground">
          Accounts &amp; sign-in are being wired up. New subcontractors join via the invite link Fortitude sends.
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
