"use client";

import * as React from "react";
import { Check, Copy, Link2, Mail, MessageSquare, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** "White Plains, SC" → "SC"; falls back to the whole string. */
function stateOf(location: string) {
  const parts = location.split(",");
  return parts.length > 1 ? parts[parts.length - 1].trim() : location.trim();
}

const STATE_NAMES: Record<string, string> = {
  GA: "Georgia",
  SC: "South Carolina",
  NC: "North Carolina",
  VA: "Virginia",
  FL: "Florida",
  TN: "Tennessee",
};

const inputClass =
  "w-full rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand/40";

export function InviteDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  company,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: Project[];
  defaultProjectId?: string;
  company?: string;
}) {
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  // A stable token per dialog session so the same link is shared everywhere.
  const [nonce, setNonce] = React.useState("");

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // New token each time the dialog opens or the project changes.
  React.useEffect(() => {
    if (open) {
      setNonce(Math.random().toString(36).slice(2, 8));
      setCopied(false);
    }
  }, [open, projectId]);

  React.useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  const project = projects.find((p) => p.id === projectId);

  // Group projects by market — customer + state. The same customer can run
  // separate markets in different states, so both dimensions matter.
  const grouped = React.useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      const st = stateOf(p.location);
      const market = `${p.client} · ${STATE_NAMES[st] ?? st}`;
      if (!map.has(market)) map.set(market, []);
      map.get(market)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [projects]);

  const token = `${projectId}-${nonce}`;
  const link = origin && projectId ? `${origin}/invite/${token}?project=${projectId}` : "";

  const message = project
    ? `You're invited to join ${project.name} (${project.client} · ${project.location}) on Vantara IQ. Register your crew and start submitting dailies here: ${link}`
    : "";

  function copy() {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  function sendEmail() {
    if (!project) return;
    const subject = `Vantara IQ invite — ${project.name}`;
    const url = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(message)}`;
    window.location.href = url;
  }

  function sendText() {
    const url = `sms:${encodeURIComponent(phone)}?&body=${encodeURIComponent(message)}`;
    window.location.href = url;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite subcontractor</DialogTitle>
          <DialogDescription>
            Send a project-specific onboarding link. The crew registers, uploads compliance, and is
            tied to the project you pick — their dailies flow straight to it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Project assignment */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">
              Assign to project<span className="ml-0.5 text-critical">*</span>
            </span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={cn(inputClass, "appearance-none")}
            >
              {grouped.map(([market, list]) => (
                <optgroup key={market} label={market}>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.location}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {project ? (
              <span className="text-[11px] text-muted-foreground">
                {company ? `${company} → ` : ""}
                {project.client} · {project.location}. Only this project will be visible to the crew.
              </span>
            ) : null}
          </label>

          {/* Generated link */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">Invite link</span>
            <div className="flex items-center gap-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-2.5 py-1.5">
              <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="num min-w-0 flex-1 truncate text-[11.5px] text-foreground">
                {link || "Select a project…"}
              </span>
              <button
                type="button"
                onClick={copy}
                disabled={!link}
                className={cn(
                  "focus-ring inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
                  copied ? "text-success" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <span className="text-[11px] text-muted-foreground/80">
              The link changes with the project — each carries its own assignment.
            </span>
          </div>

          {/* Forward via email + text */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-foreground/[0.02] p-3">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
                <Mail className="size-3.5 text-muted-foreground" /> Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className={inputClass}
              />
              <Button
                type="button"
                size="sm"
                onClick={sendEmail}
                disabled={!email.trim() || !link}
                className="h-8 gap-1.5 rounded-lg bg-brand text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
              >
                <Send className="size-3.5" /> Send email
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-foreground/[0.02] p-3">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
                <MessageSquare className="size-3.5 text-muted-foreground" /> Text message
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(864) 555-0142"
                className={inputClass}
              />
              <Button
                type="button"
                size="sm"
                onClick={sendText}
                disabled={!phone.trim() || !link}
                className="h-8 gap-1.5 rounded-lg bg-brand text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
              >
                <Send className="size-3.5" /> Send text
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
