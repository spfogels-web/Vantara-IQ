"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { acceptEmployeeInvite } from "@/app/invite/employee/actions";

/**
 * Setting a password on an employee's invitation.
 *
 * The name and the address are shown and fixed. Both came off the invitation,
 * which the office minted; letting either be edited here would be letting
 * somebody put themselves on the payroll under details nobody approved.
 *
 * So the only thing this form collects is the password, and it is the only
 * place in the product where an employee's password is ever set. No
 * administrator types it and none can read it back.
 */
export function AcceptEmployeeInvite({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  name: string;
}) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) return setError("Those passwords do not match.");
    setBusy(true);
    setError(null);
    let res;
    try {
      res = await acceptEmployeeInvite({ token, password });
    } catch {
      // A server action that throws leaves the button spinning forever and
      // says nothing.
      setBusy(false);
      setError("Something went wrong setting that up. Try again.");
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    // Signed in by the action itself, so they land on their clock rather than
    // on a login screen having just chosen a password.
    router.replace("/time-clock");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="rounded-xl border border-border/60 bg-foreground/[0.02] px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Your account
        </p>
        <p className="mt-0.5 truncate text-[13.5px] font-semibold text-foreground">{name}</p>
        <p className="truncate text-[12px] text-muted-foreground">{email}</p>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Choose a password
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="focus-ring mt-1 h-12 w-full rounded-xl border border-border/60 bg-foreground/[0.03] px-3 text-[15px] text-foreground outline-none"
          required
        />
        <span className="mt-1 block text-[11.5px] text-muted-foreground">
          At least 8 characters. Nobody at the office can see it.
        </span>
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Type it again
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="focus-ring mt-1 h-12 w-full rounded-xl border border-border/60 bg-foreground/[0.03] px-3 text-[15px] text-foreground outline-none"
          required
        />
      </label>

      {tooShort ? (
        <p className="text-[12.5px] text-warning">That is shorter than 8 characters.</p>
      ) : null}
      {mismatch ? (
        <p className="text-[12.5px] text-warning">Those two do not match yet.</p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-critical/35 bg-critical/[0.07] px-3 py-2 text-[12.5px] text-critical">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || password.length < 8 || password !== confirm}
        className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Setting up…" : "Set my password"}
      </button>
    </form>
  );
}
