"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { requestDemo } from "@/app/(marketing)/demo-actions";

/**
 * The enquiry form.
 *
 * Six fields, three of them required. Every extra box costs enquiries, and the
 * ones here earn their place: a name and a company to know who is asking, an
 * address to answer on, and three optional ones that decide how the call is
 * prepared rather than whether it happens.
 *
 * Nothing about the reply says whether the company is already known to us. A
 * form that answered differently for a customer than for a stranger would let
 * anybody enumerate who is using the product.
 */
export function DemoRequestForm() {
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [f, setF] = React.useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    role: "",
    crews: "",
    message: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  if (done) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
        <CheckCircle2 className="size-7" style={{ color: "#34D399" }} />
        <p className="mt-3 text-[17px] font-semibold text-white">That&rsquo;s with us.</p>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "#c7d2e1" }}>
          We&rsquo;ll be in touch to arrange a time, usually the same day. If it&rsquo;s urgent, call{" "}
          <a href="tel:+18643651521" className="font-semibold underline" style={{ color: "#e0a82e" }}>
            (864) 365-1521
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const res = await requestDemo(f);
        setBusy(false);
        if (!res.ok) return setError(res.error);
        setDone(true);
      }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Your name" required value={f.name} onChange={set("name")} />
        <Field label="Company" required value={f.company} onChange={set("company")} />
        <Field label="Email" required type="email" value={f.email} onChange={set("email")} />
        <Field label="Mobile" type="tel" value={f.phone} onChange={set("phone")} placeholder="(864) 555-0134" />
        <Field label="Your role" value={f.role} onChange={set("role")} placeholder="Owner, operations manager…" />
        <Field label="Crews you run" value={f.crews} onChange={set("crews")} placeholder="6" />
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[12.5px] font-medium" style={{ color: "#c7d2e1" }}>
          Anything we should know
        </span>
        <textarea
          value={f.message}
          onChange={set("message")}
          rows={3}
          placeholder="What you run on today, and what is not working about it."
          className="w-full rounded-lg border border-white/15 bg-[#0b1220] px-3 py-2 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-white/40"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold text-[#0b1220] disabled:opacity-60"
        style={{ background: "#e0a82e" }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Book a demo
      </button>

      {error ? (
        <p className="mt-2 text-[13px]" style={{ color: "#F87171" }}>
          {error}
        </p>
      ) : null}

      <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "#93a3b8" }}>
        We use this to arrange the demonstration and nothing else. No list, no newsletter, and we do
        not pass it on.
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium" style={{ color: "#c7d2e1" }}>
        {label}
        {required ? <span style={{ color: "#e0a82e" }}> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-white/15 bg-[#0b1220] px-3 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-white/40"
      />
    </label>
  );
}
