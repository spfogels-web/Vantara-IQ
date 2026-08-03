"use client";

import * as React from "react";
import { Check, Copy, Link2, Mail, MessageSquare, Send, ShieldCheck, TriangleAlert } from "lucide-react";

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
import { FortitudeLogo } from "@/components/common/fortitude-logo";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(v: string) {
  return EMAIL_RE.test(v.trim());
}

/** Live-format US numbers as (XXX) XXX-XXXX while typing. */
function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function phoneDigits(v: string) {
  return v.replace(/\D/g, "");
}

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
  const [recipientName, setRecipientName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [consent, setConsent] = React.useState(false);
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
      setConsent(false);
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

  const greeting = recipientName.trim() ? `Hi ${recipientName.trim().split(" ")[0]}, ` : "";
  const message = project
    ? `${greeting}you're invited to join ${project.name} (${project.client} · ${project.location}) on Vantara IQ. Register your crew and start submitting dailies here: ${link}`
    : "";

  const emailValid = isValidEmail(email);
  const phoneValid = phoneDigits(phone).length === 10;
  const canEmail = Boolean(link) && emailValid && consent;
  const canText = Boolean(link) && phoneValid && consent;

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
    const url = `sms:${phoneDigits(phone)}?&body=${encodeURIComponent(message)}`;
    window.location.href = url;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto overflow-x-hidden sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <div className="flex items-center gap-2.5">
            <FortitudeLogo size={30} />
            <DialogTitle className="truncate">Invite subcontractor</DialogTitle>
          </div>
          <DialogDescription>
            Send a project-specific onboarding link tied to the project you pick.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3">
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
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">Invite link</span>
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-2.5 py-1.5">
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

          {/* Recipient + contact */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">Recipient name (optional)</span>
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Reggie Vance"
              className={inputClass}
            />
          </label>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
                <Mail className="size-3.5 text-muted-foreground" /> Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className={cn(inputClass, email && !emailValid && "border-critical/50 focus:ring-critical/30")}
              />
              {email && !emailValid ? (
                <span className="flex items-center gap-1 text-[10.5px] text-critical">
                  <TriangleAlert className="size-3" /> Enter a valid email
                </span>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
                <MessageSquare className="size-3.5 text-muted-foreground" /> Mobile number
              </span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(864) 555-0142"
                className={cn(inputClass, phone && !phoneValid && "border-critical/50 focus:ring-critical/30")}
              />
              {phone && !phoneValid ? (
                <span className="flex items-center gap-1 text-[10.5px] text-critical">
                  <TriangleAlert className="size-3" /> Enter a 10-digit number
                </span>
              ) : null}
            </div>
          </div>

          {/* Authorization / consent — required before sending */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/70 bg-foreground/[0.02] p-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--vq-blue)]"
            />
            <span className="text-[11.5px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">Authorization confirmed.</span> This
              subcontractor has agreed to receive onboarding messages from Fortitude by email and
              text. <span className="text-muted-foreground/70">(Required — TCPA / CAN-SPAM.)</span>
            </span>
          </label>

          {/* Send */}
          <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Button
              type="button"
              size="sm"
              onClick={sendEmail}
              disabled={!canEmail}
              className="h-9 gap-1.5 rounded-lg bg-brand text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
            >
              <Send className="size-3.5" /> Send email
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={sendText}
              disabled={!canText}
              className="h-9 gap-1.5 rounded-lg bg-brand text-[12px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
            >
              <Send className="size-3.5" /> Send text
            </Button>
          </div>

          <p className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/80">
            <ShieldCheck className="size-3 shrink-0" /> Ownership is verified with a one-time code
            when they create their account.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
