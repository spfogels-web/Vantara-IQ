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
import { initials } from "@/lib/format";
import { submitOnboarding } from "@/app/actions";
import { LogoUpload } from "@/components/common/logo-upload";

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
  { key: "capabilities", label: "Capabilities statement", detail: "Trades, crews and equipment available — required.", icon: HardHat },
  { key: "check", label: "Requirements check", detail: "Vantara IQ verifies everything required is on file.", icon: FileCheck2 },
  { key: "review", label: "Fortitude review & approval", detail: "Fortitude reviews and approves the account.", icon: Check },
  { key: "active", label: "You're active", detail: "Access opens for your assigned project.", icon: Zap },
] as const;

const TRADES = [
  "Directional bore",
  "Trenching",
  "Fiber placement",
  "Vault / handhole setting",
  "Aerial / strand",
  "Restoration",
  "Utility locating",
  "Rock bore",
  "Water / sewer",
  "Splicing",
];

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

type Step = "account" | "capabilities" | "done";

export function InviteOnboarding({
  project,
}: {
  token: string;
  project: InviteProject;
}) {
  const [step, setStep] = React.useState<Step>("account");
  const [saving, setSaving] = React.useState(false);
  const [account, setAccount] = React.useState({ company: "", name: "", email: "", password: "" });
  const [caps, setCaps] = React.useState({ crews: "", fieldStaff: "", equipment: "", trades: [] as string[] });

  async function finishOnboarding() {
    if (!capsValid || saving) return;
    setSaving(true);
    try {
      await submitOnboarding({
        company: account.company,
        name: account.name,
        email: account.email,
        projectName: project?.name,
        trades: caps.trades,
        crews: caps.crews,
        fieldStaff: caps.fieldStaff,
        equipment: caps.equipment
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setStep("done");
    } finally {
      setSaving(false);
    }
  }

  const setA = (k: keyof typeof account) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAccount((f) => ({ ...f, [k]: e.target.value }));
  const setC = (k: keyof typeof caps) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCaps((f) => ({ ...f, [k]: e.target.value }));
  const toggleTrade = (t: string) =>
    setCaps((f) => ({ ...f, trades: f.trades.includes(t) ? f.trades.filter((x) => x !== t) : [...f.trades, t] }));

  const accountValid = account.company.trim() && account.name.trim() && account.email.trim() && account.password.length >= 8;
  const capsValid = caps.trades.length > 0 && caps.crews.trim() && caps.equipment.trim();

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      {/* Brand header */}
      <div className="flex items-center gap-2.5">
        <span className="brand-gradient glow-brand grid size-8 place-items-center rounded-lg text-white">
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
        {/* Wizard */}
        <div className="surface p-5">
          {/* Step indicator */}
          {step !== "done" ? (
            <div className="mb-4 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <StepDot on={step === "account"} done={step !== "account"} n={1} />
              <span className="h-px w-6 bg-foreground/[0.1]" />
              <StepDot on={step === "capabilities"} done={false} n={2} />
              <span className="ml-2">{step === "account" ? "Create account" : "Capabilities statement"}</span>
            </div>
          ) : null}

          {step === "account" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (accountValid) setStep("capabilities");
              }}
              className="flex flex-col gap-3.5"
            >
              <h2 className="text-[15px] font-semibold text-foreground">Create your account</h2>
              <Field label="Company name">
                <input value={account.company} onChange={setA("company")} placeholder="ABC Utilities" className={inputClass} />
              </Field>
              <Field label="Your name">
                <input value={account.name} onChange={setA("name")} placeholder="Reggie Vance" className={inputClass} />
              </Field>
              <Field label="Work email">
                <input type="email" value={account.email} onChange={setA("email")} placeholder="you@company.com" className={inputClass} />
              </Field>
              <Field label="Password" hint="At least 8 characters">
                <input type="password" value={account.password} onChange={setA("password")} placeholder="••••••••" className={inputClass} />
              </Field>
              <button
                type="submit"
                disabled={!accountValid}
                className="brand-gradient focus-ring mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                Continue →
              </button>
            </form>
          ) : step === "capabilities" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void finishOnboarding();
              }}
              className="flex flex-col gap-3.5"
            >
              <div>
                <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
                  <HardHat className="size-4 text-brand-bright" /> Capabilities statement
                </h2>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  Required. Tell Fortitude what your crews and equipment can do — this drives which
                  projects you&apos;re a fit for.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-foreground/[0.02] p-3">
                <LogoUpload fallback={initials(account.company || "Co")} size={44} />
                <div>
                  <p className="text-[12.5px] font-medium text-foreground">Company logo</p>
                  <p className="text-[11px] text-muted-foreground">Optional — appears on your profile.</p>
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[11.5px] font-medium text-muted-foreground">
                  Trades &amp; capabilities<span className="ml-0.5 text-critical">*</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TRADES.map((t) => {
                    const on = caps.trades.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTrade(t)}
                        className={cn(
                          "focus-ring rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                          on
                            ? "border-brand/40 bg-brand/10 text-brand-bright"
                            : "border-border/70 bg-foreground/[0.02] text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {on ? <Check className="mr-1 inline size-3" /> : null}
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Number of crews">
                  <input value={caps.crews} onChange={setC("crews")} inputMode="numeric" placeholder="3" className={inputClass} />
                </Field>
                <Field label="Total field staff">
                  <input value={caps.fieldStaff} onChange={setC("fieldStaff")} inputMode="numeric" placeholder="18" className={inputClass} />
                </Field>
              </div>

              <Field label="Equipment available" hint="One per line">
                <textarea
                  value={caps.equipment}
                  onChange={setC("equipment")}
                  rows={4}
                  placeholder={"Vermeer D24x40 directional drill\nMini excavator\nVac trailer\nHydro-excavator"}
                  className={cn(inputClass, "resize-none")}
                />
              </Field>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep("account")}
                  className="focus-ring rounded-lg px-3 py-2 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={!capsValid || saving}
                  className="brand-gradient focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {saving ? "Submitting…" : "Submit for review"}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-success/12 text-success">
                <Check className="size-6" />
              </span>
              <h2 className="mt-4 text-[16px] font-semibold text-foreground">Submitted for review</h2>
              <p className="mt-1.5 max-w-xs text-[12.5px] text-muted-foreground">
                Your account and capabilities statement are in. Fortitude reviews and approves before
                your access opens — you&apos;ll get an email the moment you&apos;re active on{" "}
                {project ? project.name : "your project"}.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {caps.trades.slice(0, 4).map((t) => (
                  <span key={t} className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pipeline */}
        <div className="surface p-5">
          <p className="eyebrow">The full journey</p>
          <ol className="mt-3 flex flex-col">
            {STEPS.map((s, i) => {
              const st = statusOf(s.key, step);
              const Icon = s.icon;
              return (
                <li key={s.key} className="flex gap-3 pb-3.5 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors",
                        st === "done"
                          ? "bg-success/15 text-success ring-success/30"
                          : st === "current"
                            ? "bg-brand/15 text-brand-bright ring-brand/30"
                            : "bg-foreground/[0.04] text-muted-foreground ring-foreground/[0.08]",
                      )}
                    >
                      {st === "done" ? <Check className="size-3.5" /> : st === "current" ? <CircleDot className="size-3.5" /> : <Icon className="size-3.5" />}
                    </span>
                    {i < STEPS.length - 1 ? (
                      <span className={cn("mt-1 w-px flex-1", st === "done" ? "bg-success/30" : "bg-foreground/[0.08]")} />
                    ) : null}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className={cn("text-[12.5px] font-medium", st !== "pending" ? "text-foreground" : "text-muted-foreground")}>
                      {s.label}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground/80">{s.detail}</p>
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

const ORDER = ["account", "company", "docs", "payment", "capabilities", "check", "review", "active"];

function statusOf(key: string, step: Step): "done" | "current" | "pending" {
  const activeKey = step === "account" ? "account" : step === "capabilities" ? "capabilities" : "check";
  const idx = ORDER.indexOf(key);
  const activeIdx = ORDER.indexOf(activeKey);
  if (idx < activeIdx) return "done";
  if (idx === activeIdx) return "current";
  return "pending";
}

function StepDot({ on, done, n }: { on: boolean; done: boolean; n: number }) {
  return (
    <span
      className={cn(
        "grid size-5 place-items-center rounded-full text-[10px] font-semibold ring-1 ring-inset",
        done
          ? "bg-success/15 text-success ring-success/30"
          : on
            ? "bg-brand/15 text-brand-bright ring-brand/30"
            : "bg-foreground/[0.04] text-muted-foreground ring-foreground/[0.08]",
      )}
    >
      {done ? <Check className="size-3" /> : n}
    </span>
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
