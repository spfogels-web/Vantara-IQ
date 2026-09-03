"use client";

import * as React from "react";

import { SMS_CONSENT_TEXT } from "@/lib/sms-consent";
import { recordSmsOptIn } from "./actions";

/**
 * The opt-in itself.
 *
 * The box ships unticked and the button will not submit without it, because a
 * pre-ticked box is not consent and is its own rejection code. The wording
 * beside it is the same constant that gets written onto the consent record, so
 * what a reviewer reads here is what an audit would show was agreed.
 */
export function OptInForm({ consentText }: { consentText: string }) {
  const [f, setF] = React.useState({ name: "", company: "", phone: "" });
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await recordSmsOptIn({ ...f, consent });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-600/40 bg-green-50 p-4 text-[14px] text-green-900">
        <p className="font-semibold">You are signed up for job alerts.</p>
        <p className="mt-1">
          Reply <strong>STOP</strong> to any message to stop them, or <strong>HELP</strong> for
          help. You can come back to this page at any time to sign up again.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-300 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Your name" value={f.name} onChange={(v) => set("name", v)} required />
        <Field label="Company" value={f.company} onChange={(v) => set("company", v)} />
        <Field
          label="Mobile number"
          value={f.phone}
          onChange={(v) => set("phone", v)}
          type="tel"
          placeholder="(864) 555-0134"
          required
        />
      </div>

      <label className="mt-4 flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 size-4 shrink-0"
        />
        <span className="text-[13.5px] leading-relaxed text-slate-700">{consentText}</span>
      </label>

      {error ? <p className="mt-2 text-[13px] text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || !consent}
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-[14px] font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Signing up…" : "Sign up for job alerts"}
      </button>
      <p className="mt-2 text-[12.5px] text-slate-500">
        The button stays disabled until you tick the box. We never tick it for you.
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-[14px] text-slate-900 outline-none focus:border-slate-900"
      />
    </label>
  );
}
