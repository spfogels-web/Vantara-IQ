"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { login } from "@/app/auth-actions";

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null as { error?: string } | null);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-medium text-muted-foreground">Work email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@fortitude-infra.com"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-medium text-muted-foreground">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className={inputClass}
        />
      </label>

      {state?.error ? <p className="text-[12.5px] text-critical">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="brand-gradient focus-ring mt-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
