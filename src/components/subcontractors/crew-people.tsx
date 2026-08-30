"use client";

import * as React from "react";
import { Loader2, Plus, Trash2, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { saveCrewContact2, deleteCrewContact } from "@/app/actions";

/**
 * The people at a crew — foreman, owner, office.
 *
 * One company used to mean one name and one number, which holds until the
 * foreman filing the dailies is not the owner whose number is on the packet.
 * A task assigned to a person could not be texted at all, because a person had
 * nowhere to keep a number.
 *
 * Every row saves the moment you leave a field, and it is the first thing the
 * form asks for. Somebody who starts onboarding and gives up at the EIN has
 * still told you who they are and how to ring them — which is the thing that
 * gets lost when several companies are onboarding in the same week.
 */

export type CrewPerson = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  primary: boolean;
};

type Row = CrewPerson & { saving?: boolean };

const blank = (): Row => ({
  id: "",
  name: "",
  role: "",
  phone: "",
  email: "",
  primary: false,
});

export function CrewPeople({
  subcontractorId,
  initial,
  canEdit = true,
}: {
  subcontractorId: string;
  initial: CrewPerson[];
  canEdit?: boolean;
}) {
  // Always one empty row to type into, so adding a person is typing rather
  // than finding a button first.
  const [rows, setRows] = React.useState<Row[]>(() =>
    initial.length ? [...initial, blank()] : [blank()],
  );
  const [error, setError] = React.useState<string | null>(null);

  const patch = (i: number, next: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...next } : r)));

  async function persist(i: number) {
    if (!canEdit) return;
    const r = rows[i];
    if (!r.name.trim() && !r.phone.trim() && !r.email.trim()) return;

    patch(i, { saving: true });
    try {
      const res = await saveCrewContact2(subcontractorId, {
        id: r.id || undefined,
        name: r.name,
        role: r.role,
        phone: r.phone,
        email: r.email,
        primary: r.primary,
      });
      if (res.ok && res.id) {
        patch(i, { id: res.id, saving: false });
        // Typing in the last row means there is a person there now, so open
        // another one beneath it.
        setRows((prev) => (prev[prev.length - 1]?.id ? [...prev, blank()] : prev));
      } else {
        patch(i, { saving: false });
      }
    } catch {
      patch(i, { saving: false });
      setError("Couldn't save that. Check your connection.");
    }
  }

  async function remove(i: number) {
    const r = rows[i];
    if (r.id) await deleteCrewContact(r.id).catch(() => undefined);
    setRows((prev) => {
      const next = prev.filter((_, j) => j !== i);
      return next.length ? next : [blank()];
    });
  }

  return (
    <div className="rounded-xl border border-border bg-foreground/[0.02] p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <UserRound className="size-4 text-brand-bright" />
        <p className="text-[13px] font-semibold text-foreground">Who works here</p>
        <span className="text-[11.5px] text-muted-foreground">
          Saved as you type — so we can reach you even if you finish the rest later
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        The foreman who files the dailies, whoever chases an invoice, and whoever
        signs. Each person needs their own mobile and email, because a job alert
        has to reach the person doing the job — not whoever happens to be on the
        company record.
      </p>

      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <div
            key={r.id || `new-${i}`}
            className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 p-2 sm:grid-cols-[1.1fr_0.8fr_1fr_1.2fr_auto]"
          >
            <Cell
              label="Name"
              value={r.name}
              onChange={(v) => patch(i, { name: v })}
              onBlur={() => void persist(i)}
              disabled={!canEdit}
            />
            <Cell
              label="Role"
              value={r.role}
              onChange={(v) => patch(i, { role: v })}
              onBlur={() => void persist(i)}
              placeholder="Foreman"
              disabled={!canEdit}
            />
            <Cell
              label="Mobile"
              value={r.phone}
              onChange={(v) => patch(i, { phone: v })}
              onBlur={() => void persist(i)}
              disabled={!canEdit}
            />
            <Cell
              label="Email"
              value={r.email}
              onChange={(v) => patch(i, { email: v })}
              onBlur={() => void persist(i)}
              disabled={!canEdit}
            />
            <div className="flex items-end justify-end gap-1 pb-0.5">
              {r.saving ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
              {canEdit && (r.id || rows.length > 1) ? (
                <button
                  type="button"
                  onClick={() => void remove(i)}
                  title="Remove this person"
                  className="focus-ring grid size-7 place-items-center rounded-lg text-muted-foreground transition hover:text-critical"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {canEdit ? (
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, blank()])}
          className="focus-ring mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-bright hover:underline"
        >
          <Plus className="size-3.5" /> Add another person
        </button>
      ) : null}

      {error ? <p className="mt-2 text-[12px] text-critical">{error}</p> : null}
    </div>
  );
}

function Cell({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "h-8 w-full rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none",
          "focus:border-brand disabled:opacity-60",
        )}
      />
    </label>
  );
}
