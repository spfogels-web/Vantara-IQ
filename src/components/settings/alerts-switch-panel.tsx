"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { PanelBody } from "@/components/common/panel";
import { toggleAlertsLive } from "@/app/settings/alerts-actions";
import type { AlertsState } from "@/lib/alerts-switch";

/**
 * The master switch for outbound texts.
 *
 * Turning it off is one click and takes effect on the next message. Turning it
 * on asks first, because it is the action that starts sending to real handsets
 * and the person doing it should have to mean it.
 *
 * Where it is unprovisioned the switch is shown, disabled, and says why —
 * rather than hidden, which would leave somebody hunting for a control that is
 * simply not applicable yet.
 */
export function AlertsSwitchPanel({ state }: { state: AlertsState }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function set(on: boolean) {
    setBusy(true);
    setErr(null);
    const res = await toggleAlertsLive(on);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) return setErr(res.error);
    router.refresh();
  }

  return (
    <PanelBody>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11.5px] font-semibold",
                state.live
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning",
              )}
            >
              <Radio className="size-3" />
              {state.live ? "Alerts are live" : "Alerts are off"}
            </span>
            {!state.provisioned ? (
              <span className="rounded-full border border-border bg-foreground/[0.04] px-2.5 py-[3px] text-[11.5px] text-muted-foreground">
                {state.credentials ? "Sending not switched on" : "Carrier not configured"}
              </span>
            ) : null}
          </div>

          <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground">
            {state.live
              ? "Text messages are going out to crews and staff who have agreed to them. Turning this off stops every outbound text immediately — including the welcome message somebody gets when they opt in."
              : state.provisioned
                ? "Nothing is being texted. Messages still appear inside Vantara IQ; they just do not leave as SMS."
                : state.credentials
                  ? "The Twilio credentials are in place, but SMS_ENABLED is not set in this environment, so nothing can leave whatever this switch says. Set SMS_ENABLED=true, redeploy, then turn this on."
                  : "This environment has no carrier account, so nothing can be texted whatever this switch says. Set the Twilio credentials and SMS_ENABLED, then turn this on."}
          </p>

          {state.updatedAt ? (
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Last changed {new Date(state.updatedAt).toLocaleString()}
              {state.updatedBy ? ` by ${state.updatedBy}` : ""}.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {state.switchedOn ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void set(false)}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-critical/40 px-3 text-[12.5px] font-semibold text-critical transition-colors hover:bg-critical/10 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Turn alerts off
            </button>
          ) : confirming ? (
            <>
              <button
                type="button"
                disabled={busy || !state.provisioned}
                onClick={() => void set(true)}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Yes, start sending
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="focus-ring h-9 rounded-lg px-2.5 text-[12.5px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!state.provisioned}
              onClick={() => setConfirming(true)}
              title={
                state.provisioned
                  ? undefined
                  : state.credentials
                    ? "SMS_ENABLED is not set in this environment."
                    : "No carrier account in this environment."
              }
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Turn alerts on
            </button>
          )}
        </div>
      </div>

      {confirming ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-warning/35 bg-warning/[0.06] px-3 py-2 text-[12px] text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          This starts sending real text messages to every crew and staff member who has agreed to
          them. Only do this once the A2P campaign is approved.
        </p>
      ) : null}

      {err ? <p className="mt-2 text-[12px] text-critical">{err}</p> : null}
    </PanelBody>
  );
}
