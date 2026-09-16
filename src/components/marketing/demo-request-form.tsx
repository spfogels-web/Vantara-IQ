"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { requestDemo } from "@/app/(marketing)/demo-actions";
import { useT } from "@/components/layout/language-provider";

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
 *
 * Colours come from the page's own `--mk-*` tokens rather than being written
 * in hex, so the form follows the page into light. It was the one card left
 * painted dark when the rest of the page learned both inks, which on a light
 * screen read as a form belonging to somebody else's site.
 *
 * The server action's validation messages are English sentences that are keys
 * in the dictionary, so `t()` renders them in the reader's language and falls
 * back to the English if one is ever missing.
 */
export function DemoRequestForm() {
  const t = useT();
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
      <div
        className="rounded-2xl border p-6"
        style={{ borderColor: "var(--mk-hair)", background: "var(--mk-card)" }}
      >
        <CheckCircle2 className="size-7" style={{ color: "var(--mk-ok)" }} />
        <p className="mt-3 text-[17px] font-semibold" style={{ color: "var(--mk-ink)" }}>
          {t("That’s with us.")}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--mk-body)" }}>
          {t("We’ll be in touch to arrange a time, usually the same day. If it’s urgent, call")}{" "}
          <a
            href="tel:+18643651521"
            className="font-semibold underline"
            style={{ color: "var(--mk-gold)" }}
          >
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
      className="rounded-2xl border p-5 sm:p-6"
      style={{ borderColor: "var(--mk-hair)", background: "var(--mk-card)" }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("Your name")} required value={f.name} onChange={set("name")} />
        <Field label={t("Company")} required value={f.company} onChange={set("company")} />
        <Field label={t("Email")} required type="email" value={f.email} onChange={set("email")} />
        <Field label={t("Mobile")} type="tel" value={f.phone} onChange={set("phone")} placeholder="(864) 555-0134" />
        <Field
          label={t("Your role")}
          value={f.role}
          onChange={set("role")}
          placeholder={t("Owner, operations manager…")}
        />
        <Field label={t("Crews you run")} value={f.crews} onChange={set("crews")} placeholder="6" />
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[12.5px] font-medium" style={{ color: "var(--mk-body)" }}>
          {t("Anything we should know")}
        </span>
        <textarea
          value={f.message}
          onChange={set("message")}
          rows={3}
          placeholder={t("What you run on today, and what is not working about it.")}
          className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none focus:border-[color-mix(in_srgb,var(--mk-ink)_40%,transparent)]"
          style={{
            borderColor: "var(--mk-line)",
            background: "var(--mk-surface)",
            color: "var(--mk-ink)",
          }}
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold disabled:opacity-60"
        style={{ background: "var(--mk-gold-fill)", color: "var(--mk-on-gold)" }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {t("Book a demo")}
      </button>

      {error ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--mk-bad)" }}>
          {t(error)}
        </p>
      ) : null}

      <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--mk-muted)" }}>
        {t(
          "We use this to arrange the demonstration and nothing else. No list, no newsletter, and we do not pass it on.",
        )}
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
      <span className="mb-1 block text-[12.5px] font-medium" style={{ color: "var(--mk-body)" }}>
        {label}
        {required ? <span style={{ color: "var(--mk-gold)" }}> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border px-3 text-[14px] outline-none focus:border-[color-mix(in_srgb,var(--mk-ink)_40%,transparent)]"
        style={{
          borderColor: "var(--mk-line)",
          background: "var(--mk-surface)",
          color: "var(--mk-ink)",
        }}
      />
    </label>
  );
}
