"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { messageAboutTask, openConversation } from "@/app/messages/actions";

/**
 * "Message" wherever the work is.
 *
 * One button, used from a task card, a subcontractor's file and a project
 * page. It opens the conversation for that thing — creating one only if there
 * is not one already — and lands the person in it.
 *
 * The point is that the office never picks a recipient. Pressing Message on a
 * task assigned to TecTwo opens the TecTwo thread, linked to that task, and
 * everything said afterwards is part of that task's history.
 */
export function MessageButton({
  taskId,
  subcontractorId,
  projectId,
  label = "Message",
  title,
  subject,
  className,
  variant = "outline",
}: {
  taskId?: string;
  subcontractorId?: string;
  projectId?: string;
  label?: string;
  title?: string;
  subject?: string;
  className?: string;
  variant?: "outline" | "solid";
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function go(e: React.MouseEvent) {
    // These sit inside rows that are themselves buttons.
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setError(null);

    const res = taskId
      ? await messageAboutTask(taskId)
      : await openConversation({
          type: subcontractorId ? "SUBCONTRACTOR" : "PROJECT",
          subcontractorId,
          projectId,
          title,
          subject,
        });

    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/messages?c=${res.id}`);
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={(e) => void go(e)}
        disabled={busy}
        className={cn(
          "focus-ring inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-40",
          variant === "solid"
            ? "bg-brand text-white hover:bg-brand-bright"
            : "border border-border text-foreground hover:border-brand/60",
          className,
        )}
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <MessageSquare className="size-3" />
        )}
        {label}
      </button>
      {error ? <span className="mt-0.5 text-[10.5px] text-critical">{error}</span> : null}
    </span>
  );
}
