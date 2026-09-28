"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { PanelBody } from "@/components/common/panel";
import { setAssistantEnabled } from "@/app/settings/assistant-actions";

/**
 * The switch that decides whether company records leave for a model provider.
 *
 * It existed as a database flag with no interface, which meant a crew met "The
 * assistant is not enabled for this organisation" and nobody in the office
 * could do anything about it.
 *
 * Turning it off is one click. Turning it on asks first, and names what starts
 * happening — the same shape as the alerts switch, and for the same reason:
 * the action that begins sending data outside the business is one the person
 * doing it should have to mean.
 */
export function AssistantSwitchPanel({
  enabled,
  isDemo,
  canEdit,
}: {
  enabled: boolean;
  isDemo: boolean;
  /** ADMIN only. The action checks again; this stops offering what it refuses. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function set(on: boolean) {
    setBusy(true);
    setErr(null);
    const res = await setAssistantEnabled(on);
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
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
                enabled
                  ? "bg-success/15 text-success"
                  : "bg-foreground/[0.07] text-muted-foreground",
              )}
            >
              <Sparkles className="size-3" />
              {enabled ? "On" : "Off"}
            </span>
            {isDemo ? (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-warning">
                Demonstration organisation
              </span>
            ) : null}
          </div>

          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
            {isDemo
              ? "A demonstration organisation makes no outbound model requests, so this cannot be switched on here."
              : enabled
                ? "Scanning a material list, reading a map, importing a daily and the locate and operations assistants are all available. Each one sends the document it is given to the model provider."
                : "Every model-backed feature is off. Scanning a material list, reading a map and importing a daily will refuse until this is switched on — nothing leaves this organisation in the meantime."}
          </p>
        </div>

        {canEdit && !isDemo ? (
          <div className="flex shrink-0 items-center gap-2">
            {enabled ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => set(false)}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Switch off
              </button>
            ) : confirming ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => set(true)}
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Yes, switch it on
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="focus-ring inline-flex h-9 items-center rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-bright"
              >
                <Sparkles className="size-3.5" /> Switch on
              </button>
            )}
          </div>
        ) : null}
      </div>

      {confirming ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.07] px-3 py-2 text-[12px] leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Switching this on means the documents you scan — material lists, maps,
            prints, dailies — are sent to the model provider to be read. Nothing is
            sent until somebody uses one of those features, and switching it back
            off stops it immediately.
          </span>
        </p>
      ) : null}

      {!canEdit ? (
        <p className="mt-2.5 text-[12px] text-muted-foreground">
          Only an administrator can change this.
        </p>
      ) : null}

      {err ? (
        <p className="mt-2.5 rounded-lg border border-critical/35 bg-critical/[0.07] px-3 py-2 text-[12.5px] text-critical">
          {err}
        </p>
      ) : null}
    </PanelBody>
  );
}
