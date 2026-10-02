"use client";

import * as React from "react";
import { HardHat, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";
import { setPreConRequired } from "@/app/settings/alerts-actions";

/**
 * The pre-construction requirement, as a switch.
 *
 * Production cannot be filed against a route nobody photographed first. That is
 * the right rule and it is also absolute, and an absolute rule meets cases it
 * was not written for — restoration work with no route to walk, a job inherited
 * mid-build, an emergency repair that happened before anybody took a phone out.
 *
 * Switching it off does not say the documentation exists. Every project keeps
 * its own `preConStatus`, so a job that was never walked still reads NOT
 * STARTED afterwards. This only says the requirement does not apply, and
 * records who decided that and why.
 *
 * The off state is deliberately loud. A safety rule that is off should not look
 * like a tidy settings row.
 */
export function PreConSwitchPanel({
  required,
  waivedBy,
  waivedAt,
  reason,
  canEdit,
}: {
  required: boolean;
  waivedBy: string;
  waivedAt: Date | null;
  reason: string;
  canEdit: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState(false);
  const [why, setWhy] = React.useState("");

  async function run(nextRequired: boolean, withReason?: string) {
    setBusy(true);
    setError(null);
    const res = await setPreConRequired({ required: nextRequired, reason: withReason });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "That did not work.");
    else {
      setAsking(false);
      setWhy("");
    }
  }

  return (
    <Panel className="lg:col-span-2 scroll-mt-6" id="precon">
      <PanelHeader
        title="Pre-construction documentation"
        description="Whether a route must be documented before production can be filed on it"
        icon={<HardHat className="size-3.5 text-gold" />}
      />
      <PanelBody className="flex flex-col gap-3">
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3",
            required ? "border-success/40 bg-success/[0.06]" : "border-critical/50 bg-critical/[0.08]",
          )}
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">
              {required ? "Required" : "Not required"}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {required
                ? "A crew cannot file production on a project until somebody says its route is documented."
                : "Crews can file production on any project, documented or not."}
            </p>
          </div>

          {canEdit ? (
            <button
              disabled={busy}
              onClick={() => (required ? setAsking(true) : run(true))}
              className={cn(
                "focus-ring shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40",
                required
                  ? "border border-border/60 text-muted-foreground hover:text-foreground"
                  : "bg-foreground/[0.08] text-foreground",
              )}
            >
              {required ? "Switch off" : "Require it again"}
            </button>
          ) : null}
        </div>

        {/* Why it is off, on the screen rather than only in the audit log —
            somebody opening this in three months should not have to go
            looking. */}
        {!required ? (
          <div className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-critical" />
            <div className="min-w-0 text-[11.5px] leading-relaxed">
              <p className="text-foreground">{reason || "No reason recorded."}</p>
              <p className="mt-0.5 text-muted-foreground">
                Switched off by {waivedBy || "—"}
                {waivedAt ? ` · ${new Date(waivedAt).toLocaleString("en-US")}` : ""}
              </p>
              <p className="mt-1.5 text-muted-foreground">
                Each project still shows whether its own route was documented. This has not
                changed any of them.
              </p>
            </div>
          </div>
        ) : null}

        {asking ? (
          <div className="flex flex-col gap-2 rounded-lg border border-critical/40 bg-critical/[0.04] p-3">
            <p className="text-[12px] text-foreground">
              This removes the requirement from every project and every crew at once. Say why.
            </p>
            <textarea
              id="precon-waiver-reason"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              rows={2}
              placeholder="Restoration work with no pre-construction route to walk"
              className="focus-ring w-full rounded-lg border border-border/60 bg-transparent px-2.5 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/60"
            />
            <div className="flex gap-2">
              <button
                disabled={busy || !why.trim()}
                onClick={() => run(false, why)}
                className="focus-ring rounded-lg bg-critical/15 px-3 py-1.5 text-[12px] font-medium text-critical disabled:opacity-40"
              >
                Switch it off
              </button>
              <button
                onClick={() => {
                  setAsking(false);
                  setWhy("");
                }}
                className="focus-ring px-2 text-[12px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-[11.5px] text-critical">{error}</p> : null}

        {!canEdit ? (
          <p className="text-[11.5px] text-muted-foreground">An admin changes this.</p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
