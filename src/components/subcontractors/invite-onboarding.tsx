"use client";

import * as React from "react";
import Link from "next/link";
import { Check, HardHat, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { createSubcontractorDraft, updateSubcontractorCapabilities } from "@/app/actions";
import { BrandLogo } from "@/components/common/brand-logo";
import { LogoUpload } from "@/components/common/logo-upload";
import { DocumentCenter } from "@/components/subcontractors/document-center";
import { AgreementStep } from "@/components/subcontractors/agreement-step";

export type InviteProject = {
  name: string;
  client: string;
  location: string;
} | null;

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

/** Multi-line placeholder, kept out of JSX where a raw newline breaks it. */
const EQUIPMENT_PLACEHOLDER = ["Directional drill", "Mini excavator", "Vac trailer"].join(
  String.fromCharCode(10),
);

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

type Step = "account" | "capabilities" | "agreement" | "documents" | "done";

export function InviteOnboarding({ token, project }: { token: string; project: InviteProject }) {
  const [step, setStep] = React.useState<Step>("account");
  const [subId, setSubId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [account, setAccount] = React.useState({ company: "", name: "", email: "", password: "" });
  const [caps, setCaps] = React.useState({ crews: "", fieldStaff: "", equipment: "", trades: [] as string[] });
  const [agreementDownloaded, setAgreementDownloaded] = React.useState(false);
  const [docStatus, setDocStatus] = React.useState<{ canSubmit: boolean; blockers: string[] }>({
    canSubmit: false,
    blockers: [],
  });
  // Identity-stable so DocumentCenter's effect doesn't refire every render.
  const handleDocStatus = React.useCallback(
    (next: { canSubmit: boolean; blockers: string[] }) => setDocStatus(next),
    [],
  );

  const setA = (k: keyof typeof account) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAccount((f) => ({ ...f, [k]: e.target.value }));
  const setC = (k: keyof typeof caps) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCaps((f) => ({ ...f, [k]: e.target.value }));
  const toggleTrade = (t: string) =>
    setCaps((f) => ({ ...f, trades: f.trades.includes(t) ? f.trades.filter((x) => x !== t) : [...f.trades, t] }));

  const accountValid = account.company.trim() && account.name.trim() && account.email.trim() && account.password.length >= 8;
  const capsValid = caps.trades.length > 0 && caps.crews.trim();

  async function createAccount() {
    if (!accountValid || saving) return;
    setSaving(true);
    try {
      const res = await createSubcontractorDraft({
        company: account.company,
        name: account.name,
        email: account.email,
        projectName: project?.name,
        inviteToken: token,
        // The password they just set. Without this they finish onboarding
        // with no way to sign in.
        password: account.password,
      });
      if (res.ok) {
        setSubId(res.id);
        setStep("capabilities");
      }
    } finally {
      setSaving(false);
    }
  }

  /** Save the capabilities statement and move on — this is no longer the end. */
  async function saveCapabilities() {
    if (!subId || !capsValid || saving) return;
    setSaving(true);
    try {
      await updateSubcontractorCapabilities(
        subId,
        {
          trades: caps.trades,
          crews: caps.crews,
          fieldStaff: caps.fieldStaff,
          equipment: caps.equipment.split("\n").map((s) => s.trim()).filter(Boolean),
        },
        // Nobody has a login yet — the token is what proves this browser is
        // filling in this company's record and not someone else's.
        token,
      );
      setStep("agreement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      {/* Brand header */}
      <div className="flex items-center justify-between">
        <BrandLogo height={44} />
        <Link href="/login" className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
          Log in
        </Link>
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
              <p className="text-[12px] text-muted-foreground">{project.client} · {project.location}</p>
            </div>
            <span className="ml-auto rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-semibold text-brand-bright">
              Your assigned project
            </span>
          </div>
        ) : null}
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Complete onboarding to start submitting dailies. You&apos;ll only ever see the project
          you&apos;re assigned to — your production, your approvals, your pay.
        </p>
      </div>

      {step === "account" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Create account */}
          <div className="surface p-5">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <StepDot on n={1} /> <span className="h-px w-6 bg-foreground/[0.1]" /> <StepDot n={2} />
              <span className="ml-2">Create account</span>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void createAccount(); }} className="flex flex-col gap-3.5">
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
                disabled={!accountValid || saving}
                className="brand-gradient focus-ring mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {saving ? "Creating…" : "Continue →"}
              </button>
              <p className="text-center text-[12px] text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-brand-bright hover:underline">Log in</Link>
              </p>
            </form>
          </div>

          {/* Journey preview */}
          <div className="surface p-5">
            <p className="eyebrow">What you&apos;ll complete</p>
            <ol className="mt-3 flex flex-col gap-3">
              {["Create your account", "Company logo & capabilities", "W-9, insurance & agreements", "Payment / ACH details", "Fortitude review & approval", "You're active on your project"].map((label, i) => (
                <li key={label} className="flex items-center gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.05] text-[10px] font-semibold text-muted-foreground ring-1 ring-inset ring-foreground/[0.08]">
                    {i + 1}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">{label}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 rounded-lg border border-border/60 bg-foreground/[0.02] p-3 text-[11.5px] leading-relaxed text-muted-foreground">
              Nothing is approved automatically — Fortitude reviews every document before your access opens.
            </p>
          </div>
        </div>
      ) : step === "capabilities" && subId ? (
        <div className="mt-6">
          <StepBar current={2} />
          <div className="surface mt-4 flex flex-col p-5">
            <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
              <HardHat className="size-4 text-brand-bright" /> Capabilities statement
            </h2>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Tell Fortitude what your crews and equipment can do.
            </p>

            <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/70 bg-foreground/[0.02] p-3">
              <LogoUpload fallback={initials(account.company || "Co")} size={44} />
              <div>
                <p className="text-[12.5px] font-medium text-foreground">Company logo</p>
                <p className="text-[11px] text-muted-foreground">Optional — appears on your profile.</p>
              </div>
            </div>

            <div className="mt-4">
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

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Number of crews *">
                <input value={caps.crews} onChange={setC("crews")} inputMode="numeric" placeholder="3" className={inputClass} />
              </Field>
              <Field label="Total field staff">
                <input value={caps.fieldStaff} onChange={setC("fieldStaff")} inputMode="numeric" placeholder="18" className={inputClass} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Equipment available" hint="One per line">
                <textarea value={caps.equipment} onChange={setC("equipment")} rows={3} placeholder={EQUIPMENT_PLACEHOLDER} className={cn(inputClass, "resize-none")} />
              </Field>
            </div>

            <button
              type="button"
              onClick={() => void saveCapabilities()}
              disabled={!capsValid || saving}
              className="brand-gradient focus-ring mt-5 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Continue"}
            </button>
          </div>
        </div>
      ) : step === "agreement" && subId ? (
        <div className="mt-6">
          <StepBar current={3} />
          <div className="mt-4">
            <AgreementStep
              companyName={account.company}
              downloaded={agreementDownloaded}
              onDownloaded={() => setAgreementDownloaded(true)}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setStep("documents")}
              className="brand-gradient focus-ring inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white"
            >
              Continue to documents
            </button>
            <button
              type="button"
              onClick={() => setStep("capabilities")}
              className="focus-ring rounded-lg border border-border px-3 py-2.5 text-[12.5px] text-muted-foreground hover:text-foreground"
            >
              Back
            </button>
          </div>
        </div>
      ) : step === "documents" && subId ? (
        <div className="mt-6">
          <StepBar current={4} />
          <div className="surface mt-4 p-5">
            <h2 className="text-[15px] font-semibold text-foreground">Your documents</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Upload each item below. Anything marked <span className="text-foreground">can follow</span>{" "}
              — a COI usually comes from your agent — can be sent later; you can still submit your
              account now.
            </p>
            <div className="mt-4">
              <DocumentCenter subcontractorId={subId} initialDocs={[]} inviteToken={token} onStatusChange={handleDocStatus} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* Blocked only by the documents that must be in hand now. A
                missing COI never stops a crew finishing — they upload it from
                their portal when their agent sends it. */}
            <button
              type="button"
              onClick={() => setStep("done")}
              disabled={!docStatus.canSubmit}
              title={
                docStatus.canSubmit
                  ? undefined
                  : `Still needed: ${docStatus.blockers.join(", ")}`
              }
              className="brand-gradient focus-ring inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Submit for review
            </button>
            <button
              type="button"
              onClick={() => setStep("agreement")}
              className="focus-ring rounded-lg border border-border px-3 py-2.5 text-[12.5px] text-muted-foreground hover:text-foreground"
            >
              Back
            </button>
            <span className="text-[11.5px] text-muted-foreground">
              {docStatus.canSubmit
                ? "Anything still outstanding can be uploaded from your portal later."
                : `Still needed: ${docStatus.blockers.join(", ")}.`}
            </span>
          </div>
        </div>
      ) : (
        <div className="surface mt-6 flex flex-col items-center p-8 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-success/12 text-success">
            <Check className="size-6" />
          </span>
          <h2 className="mt-4 text-[16px] font-semibold text-foreground">Submitted for review</h2>
          <p className="mt-1.5 max-w-sm text-[12.5px] text-muted-foreground">
            Your account, capabilities and documents are in. Fortitude reviews and approves before
            your access opens — you&apos;ll get an email the moment you&apos;re active on{" "}
            {project ? project.name : "your project"}.
          </p>
        </div>
      )}

      <p className="mt-8 text-center text-[11px] text-muted-foreground/70">
        Powered by Vantara IQ · Nothing is approved automatically — Fortitude reviews every step.
      </p>
    </div>
  );
}

function StepDot({ on, n }: { on?: boolean; n: number }) {
  return (
    <span
      className={cn(
        "grid size-5 place-items-center rounded-full text-[10px] font-semibold ring-1 ring-inset",
        on ? "bg-brand/15 text-brand-bright ring-brand/30" : "bg-foreground/[0.04] text-muted-foreground ring-foreground/[0.08]",
      )}
    >
      {n}
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

/**
 * Where the crew is in onboarding.
 *
 * Four named steps rather than a bare progress bar, because "what do I still
 * have to do" is the question being asked, and a percentage does not answer it.
 */
function StepBar({ current }: { current: number }) {
  const steps = ["Account", "Capabilities", "Agreement", "Documents"];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors",
                done
                  ? "bg-success/15 text-success ring-1 ring-inset ring-success/30"
                  : active
                    ? "brand-gradient text-white"
                    : "bg-foreground/[0.06] text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : n}
            </span>
            <span
              className={cn(
                "text-[12px]",
                active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {n < steps.length ? (
              <span className="mx-1 hidden h-px w-6 bg-foreground/[0.12] sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
