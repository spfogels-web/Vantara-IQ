"use client";

import * as React from "react";
import { Bug, Check, Lightbulb, MessageSquarePlus, Sparkles, ThumbsUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { submitFeedback } from "@/app/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  { key: "idea", label: "Idea", icon: Lightbulb },
  { key: "bug", label: "Bug", icon: Bug },
  { key: "confusing", label: "Confusing", icon: MessageSquarePlus },
  { key: "praise", label: "Praise", icon: ThumbsUp },
] as const;

/**
 * Feedback capture for the Enterprise test account. Fortitude is the pilot user,
 * so gathering "what's confusing / what's missing" is a first-class action. Today
 * it acknowledges locally; wiring it to an inbox/table is a one-function change.
 */
export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]["key"]>("idea");
  const [message, setMessage] = React.useState("");
  const [sent, setSent] = React.useState(false);

  // Reset when reopened.
  React.useEffect(() => {
    if (open) {
      setSent(false);
      setMessage("");
      setCategory("idea");
    }
  }, [open]);

  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || saving) return;
    setSaving(true);
    try {
      await submitFeedback({
        category,
        message: message.trim(),
        page: typeof window !== "undefined" ? window.location.pathname : undefined,
      });
      setSent(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-success/12 text-success">
              <Check className="size-6" />
            </span>
            <h2 className="mt-4 text-[16px] font-semibold text-foreground">Thanks — we got it</h2>
            <p className="mt-1.5 max-w-xs text-[12.5px] text-muted-foreground">
              Your feedback goes straight to the Vantara IQ team. This is exactly how we make the
              platform more effective for Fortitude.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="brand-gradient mt-5 h-9 rounded-lg px-4 text-[12.5px] font-semibold text-white"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand-bright" /> Share feedback
              </DialogTitle>
              <DialogDescription>
                You&apos;re on the Enterprise pilot — your input shapes what we build next. Tell us
                what&apos;s working, what&apos;s confusing, or what&apos;s missing.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="grid grid-cols-4 gap-1.5">
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const active = category === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setCategory(c.key)}
                      className={cn(
                        "focus-ring flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors",
                        active
                          ? "border-brand/40 bg-brand/10 text-brand-bright"
                          : "border-border/70 bg-foreground/[0.02] text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                autoFocus
                placeholder="What would make this more effective or efficient for your team?"
                className="w-full resize-none rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40"
              />

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="h-9 rounded-lg border-foreground/[0.08] bg-foreground/[0.03] text-[12.5px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!message.trim() || saving}
                  className="brand-gradient h-9 rounded-lg px-4 text-[12.5px] font-semibold text-white disabled:opacity-40"
                >
                  {saving ? "Sending…" : "Send feedback"}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
