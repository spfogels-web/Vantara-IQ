"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { changePassword, updateProfile } from "@/app/auth-actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * Your own account — the name here is what the dashboard greeting and the
 * account menu read, so this is where "Good afternoon, John" gets fixed
 * without anyone touching the database.
 */

const inputClass =
  "w-full rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

export function ProfileCard({
  name: initialName,
  email: initialEmail,
  role,
  organizationName,
}: {
  name: string;
  email: string;
  role: string;
  organizationName: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [email, setEmail] = React.useState(initialEmail);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [pwBusy, setPwBusy] = React.useState(false);
  const [pwMsg, setPwMsg] = React.useState<string | null>(null);
  const [pwErr, setPwErr] = React.useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await updateProfile({ name, email });
    setBusy(false);
    if (res.ok) {
      setMsg("Saved.");
      router.refresh();
    } else {
      setErr(res.error);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwBusy) return;
    setPwBusy(true);
    setPwMsg(null);
    setPwErr(null);
    const res = await changePassword({ current, next });
    setPwBusy(false);
    if (res.ok) {
      setPwMsg("Password changed.");
      setCurrent("");
      setNext("");
    } else {
      setPwErr(res.error);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <Panel>
        <PanelHeader
          title="Your profile"
          description={`${role} · ${organizationName}`}
        />
        <PanelBody>
          <form onSubmit={saveProfile} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
              <span className="text-[11px] text-muted-foreground/70">
                This is also your sign-in.
              </span>
            </label>

            {err ? <p className="text-[12px] text-critical">{err}</p> : null}
            {msg ? <p className="text-[12px] text-success">{msg}</p> : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </form>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Password" description="Changing it signs out nobody else — sessions stay valid." />
        <PanelBody>
          <form onSubmit={savePassword} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className={cn(inputClass)}
              />
              <span className="text-[11px] text-muted-foreground/70">At least 10 characters.</span>
            </label>

            {pwErr ? <p className="text-[12px] text-critical">{pwErr}</p> : null}
            {pwMsg ? <p className="text-[12px] text-success">{pwMsg}</p> : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pwBusy || !current || next.length < 10}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-[12.5px] font-semibold text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
              >
                {pwBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                Change password
              </button>
            </div>
          </form>
        </PanelBody>
      </Panel>
    </div>
  );
}
