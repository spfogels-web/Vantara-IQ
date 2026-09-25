"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Loader2, UserPlus, X } from "lucide-react";

import { createEmployee } from "@/app/workforce-actions";

/**
 * Putting somebody on the books.
 *
 * Two things happen here and they are deliberately separable: a roster entry,
 * and — optionally — an invitation that lets that person set their own
 * password. Nobody is forced to decide about a login while they are typing a
 * phone number, because plenty of people are on the books before their
 * account is set up, and the Employees tab says which is which afterwards.
 *
 * NO PASSWORD IS SET HERE. There is no field for one. What this produces is a
 * link, which the office copies and hands over; the person themselves chooses
 * the password on the page it opens. That is why there is nothing on this
 * screen an administrator could read back to somebody over the phone.
 *
 * Vantara sends no email. The link is shown once, with a Copy button, exactly
 * as a subcontractor invitation already works.
 */
export function AddEmployee({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const [name, setName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [withLogin, setWithLogin] = React.useState(true);
  const [status, setStatus] = React.useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [picked, setPicked] = React.useState<string[]>([]);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ name: string; link: string | null } | null>(null);
  const [copied, setCopied] = React.useState(false);

  function reset() {
    setName("");
    setTitle("");
    setPhone("");
    setEmail("");
    setWithLogin(true);
    setStatus("ACTIVE");
    setPicked([]);
    setError(null);
    setDone(null);
    setCopied(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function toggle(id: string) {
    setPicked((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    let res;
    try {
      res = await createEmployee({
        name,
        title,
        phone,
        status,
        email,
        withLogin,
        projectIds: picked,
      });
    } catch {
      // A server action that throws leaves the button spinning forever and
      // says nothing.
      setBusy(false);
      setError("Something went wrong. Nothing was saved.");
      return;
    }
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone({
      name: res.name,
      link: res.token ? `${window.location.origin}/invite/employee/${res.token}` : null,
    });
    router.refresh();
  }

  const field =
    "focus-ring h-11 w-full rounded-xl border border-border/60 bg-foreground/[0.03] px-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60";
  const label =
    "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
      >
        <UserPlus className="size-3.5" /> Add employee
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/50 p-0 sm:place-items-center sm:p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add employee"
        className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-border bg-background p-4 sm:max-h-[85vh] sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">
            {done ? "Employee added" : "Add employee"}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="focus-ring grid size-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {done ? (
          /* What was created, and the one thing the office still has to do. */
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-[13.5px] text-foreground">
              <span className="font-semibold">{done.name}</span> is on the books.
            </p>

            {done.link ? (
              <>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  Send them this link. They choose their own password on it —
                  Vantara does not email it, and nobody here can see it. The
                  link works once.
                </p>
                <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-foreground/[0.03] p-2">
                  <code className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                    {done.link}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(done.link!);
                      setCopied(true);
                    }}
                    className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] text-foreground hover:border-brand/50"
                  >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                They have no login yet, so they cannot clock in. You can send
                them an invitation from the Employees list whenever you are
                ready.
              </p>
            )}

            {picked.length === 0 ? <NoJobsNote /> : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={close}
                className="focus-ring inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-bright"
              >
                Done
              </button>
              <button
                type="button"
                onClick={reset}
                className="focus-ring inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-[13.5px] text-foreground hover:border-brand/50"
              >
                Add another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className={label}>Full name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={field}
                placeholder="Ray Colson"
                autoFocus
                required
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={label}>Job title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={field}
                  placeholder="Operator"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={label}>Phone</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={field}
                  placeholder="864 555 0134"
                  inputMode="tel"
                />
              </label>
            </div>

            {/* The login, kept as its own decision rather than implied by
                having typed an email. */}
            <div className="rounded-xl border border-border/60 p-3">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={withLogin}
                  onChange={(e) => setWithLogin(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-foreground">
                    Give them a Vantara login
                  </span>
                  <span className="block text-[11.5px] leading-relaxed text-muted-foreground">
                    Creates an invitation link. They set their own password —
                    you will not see it. Without a login they cannot clock in.
                  </span>
                </span>
              </label>

              {withLogin ? (
                <label className="mt-3 flex flex-col gap-1">
                  <span className={label}>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={field}
                    placeholder="ray@example.com"
                    autoComplete="off"
                    required
                  />
                </label>
              ) : null}
            </div>

            <label className="flex flex-col gap-1">
              <span className={label}>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
                className={field}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive — no clock</option>
              </select>
            </label>

            <div className="flex flex-col gap-1.5">
              <span className={label}>Jobs they may book time to</span>
              {projects.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  There are no projects to assign yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {projects.map((p) => {
                    const on = picked.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggle(p.id)}
                        aria-pressed={on}
                        className={[
                          "focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors",
                          on
                            ? "border-brand/60 bg-brand/[0.12] text-foreground"
                            : "border-border/60 text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                      >
                        {on ? <Check className="size-3 shrink-0" /> : null}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {picked.length === 0 ? <NoJobsNote /> : null}
            </div>

            {error ? (
              <p className="rounded-xl border border-critical/35 bg-critical/[0.07] px-3 py-2 text-[12.5px] text-critical">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || !name.trim() || (withLogin && !email.trim())}
              className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Adding…" : "Add employee"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * What zero assignments actually means, said accurately.
 *
 * Verified against clockIn in src/app/workforce-actions.ts rather than
 * assumed: a project id is optional there, and when one is given the
 * assignment is re-checked server-side. So an unassigned employee can start a
 * general shift and can never attach a job they are not on. Both halves are
 * stated, because "they cannot clock in" would be wrong and "it's fine" would
 * hide that the hours land against nothing.
 */
function NoJobsNote() {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/[0.07] px-3 py-2 text-[12px] leading-relaxed text-warning">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>
        With no jobs assigned they can still clock in, but the shift will not
        be booked to any job. They cannot pick a job they are not assigned to.
      </span>
    </p>
  );
}
