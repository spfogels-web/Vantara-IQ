"use client";

import * as React from "react";
import {
  Building2,
  Check,
  CircleDot,
  FileCheck2,
  HardHat,
  Landmark,
  MapPin,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type InviteProject = {
  name: string;
  client: string;
  location: string;
} | null;

/** The onboarding pipeline a subcontractor moves through after the invite. */
const STEPS = [
  { key: "account", label: "Create your account", detail: "Name, email and a password.", icon: Sparkles },
  { key: "company", label: "Company information", detail: "Legal name, address, EIN and contacts.", icon: Building2 },
  { key: "docs", label: "W-9, insurance & agreements", detail: "COI, workers' comp, W-9 and the signed subcontract.", icon: ShieldCheck },
  { key: "payment", label: "Payment documents", detail: "ACH / banking details for pay applications.", icon: Landmark },
  { key: "capabilities", label: "Capabilities, equipment & crews", detail: "Trades, equipment, crew sizes and field contacts.", icon: HardHat },
  { key: "check", label: "Requirements check", detail: "Vantara IQ verifies everything required is on file.", icon: FileCheck2 },
  { key: "review", label: "Fortitude review & approval", detail: "Fortitude reviews and approves the account.", icon: Check },
  { key: "active", label: "You're active", detail: "Access opens for your assigned project.", icon: Zap },
] as const;

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

export function InviteOnboarding({
  project,
}: {
  token: string;
  project: InviteProject;
}) {
  const [submitted, setSubmitted] = React.useState(false);
  const [form, setForm] = React.useState({ company: "", name: "", email: "", password: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const canSubmit = form.company.trim() && form.name.trim() && form.email.trim() && form.password.length >= 8;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      {/* Brand header */}
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-brand text-white shadow-[0_4px_14px_-6px_var(--vq-blue)]">
          <Zap className="size-4" strokeWidth={2.4} />
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          VANTARA <span className="text-brand-bright">IQ</span>
        </span>
      </div>

      {/* Invitation banner */}
      <div className="surface mt-8 p-5 sm:p-6">
        <p className="eyebrow">Subcontractor invitation</p>
        <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.025em] text-gradient sm:text-[26px]">
          You&apos;ve been invited by Fortitude Infrastructure
        </h1>
        {project ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand-bright">
              <MapPin className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-foreground">{project.name}</p>
              <p className="text-[12px] text-muted-foreground">
                {project.client} · {project.location}
              </p>
            </div>
            <span className="ml-auto rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-semibold text-brand-bright">
              Your assigned project
            </span>
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-warning/25 bg-warning/[0.08] px-4 py-3 text-[12.5px] text-warning">
            This invite link is missing its project assignment. Ask Fortitude to resend it.
          </p>
        )}
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Complete onboarding to start submitting dailies. You&apos;ll only ever see the project
          you&apos;re assigned to — your production, your approvals, your pay.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Step 1 — create account */}
        <div className="surface p-5">
          {submitted ? (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-success/12 text-success">
                <Check className="size-6" />
              </span>
              <h2 className="mt-4 text-[16px] font-semibold text-foreground">Account created</h2>
              <p className="mt-1.5 max-w-xs text-[12.5px] text-muted-foreground">
                Next, add your company information and upload your compliance and payment documents.
                Fortitude reviews and approves before your access opens.
              </p>
              <button
                type="button"
                className="focus-ring mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-bright"
              >
                Continue onboarding →
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) setSubmitted(true);
              }}
              className="flex flex-col gap-3.5"
            >
              <h2 className="text-[15px] font-semibold text-foreground">Create your account</h2>
              <Field label="Company name">
                <input value={form.company} onChange={set("company")} placeholder="ABC Utilities" className={inputClass} />
              </Field>
              <Field label="Your name">
                <input value={form.name} onChange={set("name")} placeholder="Reggie Vance" className={inputClass} />
              </Field>
              <Field label="Work email">
                <input type="email" value={form.email} onChange={set("email")} placeholder="you@company.com" className={inputClass} />
              </Field>
              <Field label="Password" hint="At least 8 characters">
                <input type="password" value={form.password} onChange={set("password")} placeholder="••••••••" className={inputClass} />
              </Field>
              <button
                type="submit"
                disabled={!canSubmit}
                className="focus-ring mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
              >
                Create account
              </button>
              <p className="text-center text-[11px] text-muted-foreground/80">
                By continuing you agree to Fortitude&apos;s subcontractor terms.
              </p>
            </form>
          )}
        </div>

        {/* Pipeline */}
        <div className="surface p-5">
          <p className="eyebrow">What happens next</p>
          <ol className="mt-3 flex flex-col">
            {STEPS.map((step, i) => {
              const done = submitted && i === 0;
              const current = submitted ? i === 1 : i === 0;
              const Icon = step.icon;
              return (
                <li key={step.key} className="flex gap-3 pb-3.5 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors",
                        done
                          ? "bg-success/15 text-success ring-success/30"
                          : current
                            ? "bg-brand/15 text-brand-bright ring-brand/30"
                            : "bg-foreground/[0.04] text-muted-foreground ring-foreground/[0.08]",
                      )}
                    >
                      {done ? (
                        <Check className="size-3.5" />
                      ) : current ? (
                        <CircleDot className="size-3.5" />
                      ) : (
                        <Icon className="size-3.5" />
                      )}
                    </span>
                    {i < STEPS.length - 1 ? (
                      <span className={cn("mt-1 w-px flex-1", done ? "bg-success/30" : "bg-foreground/[0.08]")} />
                    ) : null}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className={cn("text-[12.5px] font-medium", current || done ? "text-foreground" : "text-muted-foreground")}>
                      {step.label}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground/80">{step.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <p className="mt-8 text-center text-[11px] text-muted-foreground/70">
        Powered by Vantara IQ · Nothing is approved automatically — Fortitude reviews every step.
      </p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
        {hint ? <span className="text-[10.5px] text-muted-foreground/70">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
