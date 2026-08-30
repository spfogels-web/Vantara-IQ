"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { inviteCrewLead, removeCrewLead } from "@/app/actions";

/**
 * A crew's own lead login.
 *
 * One company has meant one shared password, so the foreman filing dailies
 * signs in as the owner. Giving the lead their own login is what makes a daily
 * say who filed it rather than only which company — and it is the thing that
 * would let pay and banking be hidden from one person instead of from
 * everybody.
 *
 * One lead, deliberately. Owners say they want a single second person, and a
 * limit is easy to lift; an unbounded set of logins issued by somebody else is
 * hard to take back.
 */

export type CrewLogin = { id: string; name: string; email: string };

export function CrewLead({
  subcontractorId,
  logins,
}: {
  subcontractorId: string;
  logins: CrewLogin[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  // The first login is the owner's; anything after it is the lead.
  const owner = logins[0];
  const lead = logins[1];

  async function invite() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await inviteCrewLead(subcontractorId, { name, email, password });
    setBusy(false);
    if (res.ok) {
      setDone(res.email);
      setName("");
      setEmail("");
      setPassword("");
      router.refresh();
    } else setError(res.error);
  }

  async function remove() {
    if (!lead || busy) return;
    setBusy(true);
    setError(null);
    const res = await removeCrewLead(subcontractorId, lead.id);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <div className="rounded-xl border border-border bg-foreground/[0.02] p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 text-brand-bright" />
        <p className="text-[13px] font-semibold text-foreground">Your lead&rsquo;s own login</p>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        Give the person who files your dailies their own sign-in, so they are
        not using yours. A daily then records who filed it, and you keep your own
        password to yourself.
      </p>

      {owner ? (
        <p className="mt-2.5 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">{owner.name}</span> · {owner.email}{" "}
          <span className="text-muted-foreground/70">— this account</span>
        </p>
      ) : null}

      {lead ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 px-3 py-2">
          <span className="text-[13px] font-medium text-foreground">{lead.name}</span>
          <span className="text-[12px] text-muted-foreground">{lead.email}</span>
          <span className="rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-success">
            Lead
          </span>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="focus-ring ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground transition hover:text-critical disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> Remove
          </button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.3fr_1fr_auto]">
          <Cell label="Their name" value={name} onChange={setName} />
          <Cell label="Their email" value={email} onChange={setEmail} />
          {/* You set it and tell them. An emailed link needs a mail provider,
              which does not exist yet — and a password you hand over beats a
              shared one you both use. */}
          <Cell
            label="Password to give them"
            value={password}
            onChange={setPassword}
            placeholder="at least 8 characters"
          />
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void invite()}
              disabled={busy || !name.trim() || !email.trim() || password.length < 8}
              className="focus-ring inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-40 sm:w-auto"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              Add lead
            </button>
          </div>
        </div>
      )}

      {done ? (
        <p className="mt-2 rounded-lg border border-success/40 bg-success/[0.07] px-2.5 py-2 text-[12px] text-foreground">
          Done. <span className="font-medium">{done}</span> can sign in at vantaraiq.com with the
          password you set. Tell them what it is — it is not emailed to them.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-[12px] text-critical">{error}</p> : null}
    </div>
  );
}

function Cell({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-8 w-full rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none",
          "focus:border-brand",
        )}
      />
    </label>
  );
}
