"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, Send, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { sendTestText } from "@/app/actions";

/**
 * Whether texting actually works, said plainly.
 *
 * Every part of this was already built and none of it could be checked. A
 * message that does not arrive looks the same whether the credentials are
 * missing, the number is sending outside its campaign, the crew replied STOP
 * two months ago, or nobody ever set the webhook — and all four have to be
 * ruled out by hand, in a console, by somebody who knows where to look.
 *
 * So the configuration is stated, and then there is a button that sends a real
 * message to the person reading the screen. A test that goes through Twilio
 * and comes back with Twilio's own error is worth more than any amount of
 * checking that the variables are set.
 */
export function SmsStatus({
  ready,
  sender,
  webhook,
  hasNumber,
}: {
  /** Credentials and a sender are both present. */
  ready: boolean;
  /** What sends are attributed to — a Messaging Service, or a bare number. */
  sender: string;
  /** The inbound URL as configured, or null if SMS_WEBHOOK_URL is unset. */
  webhook: string | null;
  /** Whether the person reading this has given their own number. */
  hasNumber: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function test() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    const res = await sendTestText();
    setBusy(false);
    setResult(
      res.ok
        ? { ok: true, text: `Sent. Twilio accepted it as ${res.sid || "queued"}.` }
        : { ok: false, text: res.error },
    );
  }

  const usingService = sender.startsWith("Messaging Service");

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3">
      <Line
        ok={ready}
        label={ready ? "Twilio credentials are set" : "Twilio credentials are missing"}
        detail={
          ready
            ? undefined
            : "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN need setting in this environment."
        }
      />

      <Line
        ok={usingService}
        warn={!usingService}
        label={`Sending as ${sender}`}
        detail={
          usingService
            ? undefined
            : "Under A2P 10DLC a bare number is attributed to a campaign only by inference. Set TWILIO_MESSAGING_SERVICE_SID to the service the campaign is registered against."
        }
      />

      <Line
        ok={Boolean(webhook)}
        warn={!webhook}
        label={webhook ? `Replies come back to ${webhook}` : "No inbound webhook URL set"}
        detail={
          webhook
            ? "This must match the Messaging Service webhook character for character — the signature is checked against it, and a mismatch returns 403 and looks like silence."
            : "SMS_WEBHOOK_URL is unset, so the signature is checked against whatever host the request claims. Set it, and point the Messaging Service at the same URL."
        }
      />

      <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
        <button
          type="button"
          onClick={() => void test()}
          disabled={busy || !ready || !hasNumber}
          className={cn(
            "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright",
            (busy || !ready || !hasNumber) && "opacity-40",
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Send myself a test
        </button>

        {!hasNumber ? (
          <span className="text-[11.5px] text-muted-foreground">
            Add your number and agree to alerts above first — a test goes through the same
            consent check as everything else, on purpose.
          </span>
        ) : null}

        {result ? (
          <span
            className={cn(
              "text-[11.5px]",
              result.ok ? "text-success" : "text-critical",
            )}
          >
            {result.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Line({
  ok,
  warn,
  label,
  detail,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[12.5px]",
        ok
          ? "border-success/25 bg-success/[0.06] text-success"
          : warn
            ? "border-warning/35 bg-warning/[0.07] text-warning"
            : "border-critical/35 bg-critical/[0.07] text-critical",
      )}
    >
      {ok ? (
        <Check className="mt-0.5 size-3.5 shrink-0" />
      ) : warn ? (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <X className="mt-0.5 size-3.5 shrink-0" />
      )}
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        {detail ? <span className="mt-0.5 block text-[11.5px] opacity-90">{detail}</span> : null}
      </span>
    </div>
  );
}
