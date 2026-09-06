"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Mail, UserPlus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { inviteSubUser, revokeSubUserInvite, setSubUserRole } from "@/app/actions";

export type SubUser = {
  id: string;
  name: string;
  email: string;
  subUserRole: string;
  /** Whether they have set a password yet. */
  active: boolean;
};

export type SubUserInviteRow = {
  token: string;
  email: string;
  name: string;
  subUserRole: string;
  invitedBy: string;
  createdAt: string;
};

const ROLES = [
  ["OWNER", "Owner"],
  ["ADMIN", "Office / admin"],
  ["PM", "Project manager"],
  ["FOREMAN", "Foreman"],
  ["SUPERVISOR", "Supervisor"],
] as const;

const LABEL = Object.fromEntries(ROLES) as Record<string, string>;

/**
 * Who works for this crew, and how to add another.
 *
 * A crew used to be one login, shared, and that is why the pay screen and the
 * owner's own details are switched off for every company: behind that single
 * password sat an EIN, a routing number and what the owner is paid, and it was
 * the foreman who used it. Naming people, each with a job, is what lets those
 * come back on for the person they belong to.
 *
 * Staff issue the invitations. Half these companies asked us to do their
 * onboarding for them, and an owner who is not confident with a computer
 * should not have to work out how to add his own PM.
 */
export function SubPeople({
  subcontractorId,
  users,
  invites,
}: {
  subcontractorId: string;
  users: SubUser[];
  invites: SubUserInviteRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<string>("FOREMAN");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [link, setLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function invite() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setLink(null);
    let res;
    try {
      res = await inviteSubUser({
        subcontractorId,
        email,
        name,
        subUserRole: role as "FOREMAN",
      });
    } catch (e) {
      // A server action that throws leaves the button spinning forever and
      // says nothing. Whatever went wrong, the person pressing it deserves
      // to see it rather than a control that has quietly stopped working.
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not create the invite.");
      return;
    }
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setLink(`${window.location.origin}/invite/user/${res.token}`);
    setEmail("");
    setName("");
    router.refresh();
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-foreground">
          Their people
        </p>
        <span className="num text-[11.5px] text-muted-foreground">
          {users.length} {users.length === 1 ? "login" : "logins"}
          {invites.length > 0 ? ` · ${invites.length} invited` : ""}
        </span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="focus-ring ml-auto inline-flex h-7 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[11.5px] font-semibold text-white hover:bg-brand-bright"
        >
          <UserPlus className="size-3" /> Invite someone
        </button>
      </div>

      {adding ? (
        <div className="flex flex-col gap-2 border-b border-border/60 bg-foreground/[0.02] px-3 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Their email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="foreman@company.com"
                className="h-8 w-56 rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand"
              />
            </Field>
            <Field label="Name (optional)">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="They can fill this in"
                className="h-8 w-44 rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand"
              />
            </Field>
            <Field label="Their job">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-8 rounded-lg border border-border bg-transparent px-2 text-[12.5px] text-foreground outline-none focus:border-brand"
              >
                {ROLES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              onClick={() => void invite()}
              disabled={busy || !email.trim()}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
              Create invite
            </button>
          </div>

          {error ? <p className="text-[11.5px] text-critical">{error}</p> : null}

          {/* The link, to send however the office already talks to this crew.
              Nothing is emailed from here: half of them answer a text and not
              an inbox, and a link that silently went nowhere would be worse
              than one somebody has to paste. */}
          {link ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/30 bg-success/[0.06] px-2.5 py-2">
              <Check className="size-3.5 shrink-0 text-success" />
              <span className="text-[11.5px] text-success">Invite ready — send them this link:</span>
              <code className="num min-w-0 flex-1 truncate rounded bg-foreground/[0.06] px-2 py-1 text-[11px] text-foreground">
                {link}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                }}
                className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-[11.5px] font-medium text-foreground"
              >
                <Copy className="size-3" /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <ul className="divide-y divide-border/40">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[11px] font-semibold text-muted-foreground">
              {(u.name || u.email).slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {u.name || "—"}
              </span>
              <span className="block truncate text-[11.5px] text-muted-foreground">{u.email}</span>
            </span>

            {!u.active ? (
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-warning">
                No password set
              </span>
            ) : null}

            {/* The owner is who sees pay and their own bank details. Changing
                that is the office's call, so it is a control here rather than
                a label. */}
            <RoleSelect userId={u.id} value={u.subUserRole} />
          </li>
        ))}

        {invites.map((i) => (
          <li
            key={i.token}
            className="flex flex-wrap items-center gap-2.5 bg-foreground/[0.015] px-3 py-2.5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
              <Mail className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-foreground">{i.name || i.email}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">
                Invited as {LABEL[i.subUserRole] ?? i.subUserRole}
                {i.invitedBy ? ` by ${i.invitedBy}` : ""} · not accepted yet
              </span>
            </span>
            <CopyInvite token={i.token} />
            <RevokeInvite token={i.token} />
          </li>
        ))}

        {users.length === 0 && invites.length === 0 ? (
          <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            Nobody has a login for this crew yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function RoleSelect({ userId, value }: { userId: string; value: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <span className="flex flex-col items-end gap-1">
      <select
        value={value}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          const res = await setSubUserRole(userId, e.target.value as "FOREMAN");
          setBusy(false);
          if (!res.ok) setError(res.error);
          else router.refresh();
        }}
        className={cn(
          "focus-ring h-7 cursor-pointer rounded-lg border px-2 text-[11.5px] font-medium outline-none",
          value === "OWNER"
            ? "border-gold/45 bg-gold/[0.08] text-foreground"
            : "border-border bg-transparent text-muted-foreground",
        )}
      >
        {ROLES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {error ? <span className="text-[10.5px] text-critical">{error}</span> : null}
    </span>
  );
}

function CopyInvite({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}/invite/user/${token}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-[11.5px] font-medium text-foreground"
    >
      <Copy className="size-3" /> {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function RevokeInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await revokeSubUserInvite(token);
        setBusy(false);
        router.refresh();
      }}
      title="Withdraw this invitation"
      className="focus-ring inline-flex size-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-critical disabled:opacity-40"
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
