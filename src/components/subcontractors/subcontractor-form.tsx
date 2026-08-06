"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Subcontractor } from "@/lib/types";
import {
  createSubcontractor,
  updateSubcontractor,
  type SubcontractorInput,
} from "@/app/actions";

/**
 * Add or edit a subcontractor. One dialog for both — the fields are identical
 * and keeping them in a single component means an added field can't show up on
 * "new" but go missing on "edit".
 */

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

const STATES: { value: string; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "PENDING_REVIEW", label: "Pending review" },
  { value: "INVITED", label: "Invited" },
  { value: "INACTIVE", label: "Inactive" },
];

const STATE_FROM_LABEL: Record<string, string> = {
  Active: "ACTIVE",
  Onboarding: "ONBOARDING",
  "Pending review": "PENDING_REVIEW",
  Invited: "INVITED",
  Inactive: "INACTIVE",
};

const empty: SubcontractorInput = {
  company: "",
  lead: "",
  email: "",
  phone: "",
  location: "",
  trades: "",
  equipment: "",
  crewSize: 0,
  state: "PENDING_REVIEW",
  since: String(new Date().getFullYear()),
  notes: "",
};

function fromSub(s: Subcontractor): SubcontractorInput {
  return {
    company: s.company,
    lead: s.lead,
    email: s.email,
    phone: s.phone,
    location: s.location,
    trades: s.trades.join(", "),
    equipment: s.equipment.join(", "),
    crewSize: s.crewSize,
    state: STATE_FROM_LABEL[s.state] ?? "PENDING_REVIEW",
    since: s.since,
    notes: s.notes,
  };
}

export function SubcontractorForm({
  open,
  onOpenChange,
  /** Omit to add a new one. */
  sub,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sub?: Subcontractor | null;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<SubcontractorInput>(empty);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Re-seed whenever the dialog opens so switching subs can't leave stale text.
  React.useEffect(() => {
    if (!open) return;
    setForm(sub ? fromSub(sub) : empty);
    setError(null);
  }, [open, sub]);

  if (!open) return null;

  const set = <K extends keyof SubcontractorInput>(key: K, value: SubcontractorInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = sub ? await updateSubcontractor(sub.id, form) : await createSubcontractor(form);
    setBusy(false);
    if (res.ok) {
      onOpenChange(false);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <form
        onSubmit={submit}
        className="surface max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {sub ? `Edit ${sub.company}` : "Add subcontractor"}
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {sub
                ? "Changes apply immediately."
                : "Compliance documents are uploaded after the record exists."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="focus-ring grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Company" required>
            <input
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="Summit Underground"
              className={inputClass}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Lead / contact">
              <input
                value={form.lead}
                onChange={(e) => set("lead", e.target.value)}
                placeholder="Marcus Webb"
                className={inputClass}
              />
            </Field>
            <Field label="Location">
              <input
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Commerce, GA"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="dispatch@summitug.com"
                className={inputClass}
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="(706) 555-0173"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Trades" hint="Comma separated">
            <input
              value={form.trades}
              onChange={(e) => set("trades", e.target.value)}
              placeholder="Trenching, Conduit, Restoration"
              className={inputClass}
            />
          </Field>

          <Field label="Equipment" hint="Comma separated">
            <input
              value={form.equipment}
              onChange={(e) => set("equipment", e.target.value)}
              placeholder="2x Case trenchers, Excavator (12t), Plow rig"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Crew size">
              <input
                type="number"
                min={0}
                value={form.crewSize || ""}
                onChange={(e) => set("crewSize", Number(e.target.value))}
                placeholder="8"
                className={cn(inputClass, "num")}
              />
            </Field>
            <Field label="Since">
              <input
                value={form.since}
                onChange={(e) => set("since", e.target.value)}
                placeholder="2020"
                className={cn(inputClass, "num")}
              />
            </Field>
            {/* The asterisk: why this crew is different. Kept internal — a note
                saying "pays $6 bore, runs a drill" is exactly what a sub should
                not read on their own profile. */}
            <Field label="Internal note" className="sm:col-span-2">
              <input
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="e.g. Runs a directional drill — $6.00 bore rate"
                className={inputClass}
              />
            </Field>
            <Field label="Status">
              <select
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                className={cn(inputClass, "appearance-none")}
              >
                {STATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {error ? <p className="mt-3 text-[12.5px] text-critical">{error}</p> : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="focus-ring rounded-lg px-3 py-2 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !form.company.trim()}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {sub ? "Save changes" : "Add subcontractor"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11.5px] font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
        {hint ? <span className="ml-1.5 text-muted-foreground/60">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
