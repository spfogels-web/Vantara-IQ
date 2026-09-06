"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { acceptSubUserInvite } from "@/app/invite/user/actions";

/**
 * Setting a password on an invitation.
 *
 * The email is shown and fixed. It is what the invitation was issued against,
 * and letting somebody change it here would be letting them join a crew under
 * an address nobody at Fortitude approved.
 */
export function AcceptSubUserInvite({
  token,
  email,
  name: initialName,
  company,
}: {
  token: string;
  email: string;
  name: string;
  company: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await acceptSubUserInvite({ token, name, password });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    // Signed in by the action itself, so they land inside rather than on a
    // login screen having just chosen a password.
    router.push("/dailies");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Your name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          className="h-10 rounded-lg border border-border bg-transparent px-3 text-[14px] text-foreground outline-none focus:border-brand"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Email
        </span>
        <input
          value={email}
          readOnly
          className="h-10 cursor-not-allowed rounded-lg border border-border bg-foreground/[0.04] px-3 text-[14px] text-muted-foreground outline-none"
        />
        <span className="text-[11px] text-muted-foreground">
          This is the address {company} was invited under. Ask the office to change it.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Choose a password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="h-10 rounded-lg border border-border bg-transparent px-3 text-[14px] text-foreground outline-none focus:border-brand"
        />
        <span className="text-[11px] text-muted-foreground">At least 8 characters.</span>
      </label>

      {error ? <p className="text-[12.5px] text-critical">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="focus-ring mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand text-[13.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Create my login
      </button>
    </form>
  );
}
