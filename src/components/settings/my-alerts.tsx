"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import { saveMyAlertSettings } from "@/app/actions";

/**
 * Your own job alerts, on your own account.
 *
 * Staff were the one group with no way to agree to texts. Crews consent in
 * their onboarding packet and anybody can consent on the public page, but
 * there was nowhere for the office to give a number or agree to anything — so
 * nothing could be sent to them, and nothing was.
 *
 * The wording is the same constant the crew packet and the public page use, so
 * a carrier reading any of the three sees identical terms. The box starts
 * unticked and the number is only stored once somebody agrees.
 */
export function MyAlerts({
  initial,
  consentText,
}: {
  initial: { phone: string; consented: boolean; consentedAt: string | null; optedOut: boolean };
  consentText: string;
}) {
  const router = useRouter();
  const [phone, setPhone] = React.useState(initial.phone);
  const [consent, setConsent] = React.useState(initial.consented);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const dirty = phone !== initial.phone || consent !== initial.consented;

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await saveMyAlertSettings({ phone, consent });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {/* A STOP from the handset outranks anything set here, so it is said
          plainly rather than left to be discovered by texts not arriving. */}
      {initial.optedOut ? (
        <p className="rounded-lg border border-warning/40 bg-warning/[0.07] px-3 py-2 text-[12px] text-foreground">
          You replied <strong>STOP</strong> from this number, so nothing is being sent. Ticking
          the box below turns alerts back on.
        </p>
      ) : null}

      <label className="block max-w-xs">
        <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Your mobile number
        </span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(864) 555-0134"
          className="h-9 w-full rounded-lg border border-border bg-transparent px-3 text-[13px] text-foreground outline-none focus:border-brand"
        />
      </label>

      <label className="flex items-start gap-2.5 rounded-xl border border-border bg-foreground/[0.02] p-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--vq-blue)]"
        />
        <span className="text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Text me job alerts.</span> {consentText}{" "}
          <a
            href="/sms"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-bright underline"
          >
            What we send and how to stop
          </a>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className={cn(
            "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright",
            (busy || !dirty) && "opacity-40",
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Smartphone className="size-3.5" />}
          Save
        </button>

        {initial.consented && initial.consentedAt ? (
          <span className="text-[11.5px] text-muted-foreground">
            Agreed {initial.consentedAt}
          </span>
        ) : null}
        {saved && !dirty ? <span className="text-[11.5px] text-success">Saved.</span> : null}
        {error ? <span className="text-[11.5px] text-critical">{error}</span> : null}
      </div>
    </div>
  );
}
