"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { setProjectComplete } from "@/app/actions";

/**
 * The mark on a finished job, and the button that puts it there.
 *
 * A completed job looks identical to a running one on every screen unless it
 * says so — same health ring, same pace, same place in the list — and the only
 * person who knows is whoever remembers. The badge is the point; the button is
 * how it gets set.
 *
 * Reopening is deliberately as easy as completing. A job called done in error
 * and then stuck that way is worse than one nobody marked at all, because the
 * office stops looking at it.
 */
export function CompleteToggle({
  projectId,
  completedAt,
  canEdit,
}: {
  projectId: string;
  completedAt: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const done = Boolean(completedAt);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await setProjectComplete(projectId, !done);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const on = completedAt
    ? new Date(completedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {done ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/45 bg-success/[0.12] px-2.5 py-1 text-[12px] font-semibold text-success">
          <CheckCircle2 className="size-3.5" />
          Completed{on ? ` · ${on}` : ""}
        </span>
      ) : null}

      {canEdit ? (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={cn(
            "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50",
            done
              ? "border-border text-muted-foreground hover:text-foreground"
              : "border-success/45 text-success hover:bg-success/[0.08]",
          )}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : done ? (
            <RotateCcw className="size-3.5" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          {done ? "Reopen" : "Mark complete"}
        </button>
      ) : null}

      {error ? <span className="text-[11.5px] text-critical">{error}</span> : null}
    </div>
  );
}
