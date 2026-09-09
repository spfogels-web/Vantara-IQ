"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { upload as blobUpload } from "@vercel/blob/client";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  ClipboardList,
  FolderKanban,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
  Smartphone,
  TriangleAlert,
  User,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useLiveMessages } from "@/components/messages/use-live-messages";
import { formatWhen } from "@/lib/format";
import { Panel } from "@/components/common/panel";
import type { ConversationRow, ConversationDetail } from "@/data/messages";
import {
  markRead,
  openConversation,
  retrySms,
  sendMessage,
} from "@/app/messages/actions";

/**
 * The Communications Hub.
 *
 * A split inbox on a desktop, one screen at a time on a phone. The list is the
 * left rail and the thread is the right; on a narrow screen the thread takes
 * over and a back arrow returns.
 *
 * The thing that makes this not a texting app is the context: every
 * conversation is attached to a job, a crew, a task, and the thread says so at
 * the top with links. A foreman's message about a damaged ped stops being a
 * text somebody has to remember and becomes part of the record of that task.
 */

const TABS = [
  ["ALL", "All"],
  ["UNREAD", "Unread"],
  ["CREW", "Crews"],
  ["SUBCONTRACTOR", "Subcontractors"],
  ["PROJECT", "Projects"],
  ["DIRECT", "Direct"],
] as const;

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  CREW: Users,
  SUBCONTRACTOR: Building2,
  PROJECT: FolderKanban,
  DIRECT: User,
};

export function MessagesView({
  conversations,
  initial,
  targets,
  canStart,
  meId,
}: {
  conversations: ConversationRow[];
  initial: ConversationDetail | null;
  targets: {
    employees: { id: string; name: string; email: string }[];
    crews: { id: string; company: string }[];
    projects: { id: string; name: string; number: string }[];
  };
  canStart: boolean;
  meId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("c");

  // A reply arriving by text should appear without anybody reloading. The hook
  // asks whether the newest message changed and re-renders only when it did.
  useLiveMessages();

  const [tab, setTab] = React.useState<string>("ALL");
  const [query, setQuery] = React.useState("");
  const [composing, setComposing] = React.useState(false);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (tab === "UNREAD" && c.unread === 0) return false;
      if (tab !== "ALL" && tab !== "UNREAD" && c.type !== tab) return false;
      if (
        q &&
        ![c.title, c.subject, c.projectName, c.subcontractorName, c.taskTitle, c.preview]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [conversations, tab, query]);

  const unreadTotal = conversations.reduce((n, c) => n + c.unread, 0);

  function select(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("c", id);
    router.push(`/messages?${next}`);
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* The list. Hidden on a phone once a thread is open — one screen at a
          time is the only layout that works with a keyboard up. */}
      <div className={cn("lg:col-span-4 xl:col-span-4", selectedId && "hidden lg:block")}>
        <Panel className="flex h-[calc(100vh-13rem)] flex-col">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 p-2.5">
            {TABS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setTab(v)}
                className={cn(
                  "focus-ring rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  tab === v
                    ? "bg-brand text-white"
                    : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
                )}
              >
                {l}
                {v === "UNREAD" && unreadTotal > 0 ? (
                  <span className="num ml-1 text-[10.5px]">{unreadTotal}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="border-b border-border/70 p-2.5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                aria-label="Search conversations"
                className="focus-ring h-8 w-full rounded-lg bg-foreground/[0.05] pl-7 pr-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70"
              />
            </label>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <li className="px-4 py-14 text-center">
                <MessageSquare className="mx-auto size-7 text-muted-foreground/40" />
                <p className="mt-2 text-[13px] font-medium text-foreground">
                  {conversations.length === 0
                    ? "No conversations yet"
                    : tab === "UNREAD"
                      ? "You're all caught up."
                      : "Nothing matches."}
                </p>
                {conversations.length === 0 ? (
                  <>
                    <p className="mx-auto mt-1 max-w-[15rem] text-[12px] text-muted-foreground">
                      Keep project and crew communication tied directly to the work.
                    </p>
                    {canStart ? (
                      <button
                        type="button"
                        onClick={() => setComposing(true)}
                        className="focus-ring mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-bright"
                      >
                        <Plus className="size-3.5" /> Start a conversation
                      </button>
                    ) : null}
                  </>
                ) : null}
              </li>
            ) : (
              shown.map((c) => (
                <li key={c.id}>
                  <ConversationRowItem
                    row={c}
                    active={selectedId === c.id}
                    onClick={() => select(c.id)}
                  />
                </li>
              ))
            )}
          </ul>

          {canStart ? (
            <div className="border-t border-border/70 p-2.5">
              <button
                type="button"
                onClick={() => setComposing(true)}
                className="focus-ring inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-[12.5px] font-semibold text-white hover:bg-brand-bright"
              >
                <Plus className="size-3.5" /> New message
              </button>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className={cn("lg:col-span-8 xl:col-span-8", !selectedId && "hidden lg:block")}>
        {initial ? (
          <Thread key={initial.id} detail={initial} meId={meId} onBack={() => router.push("/messages")} />
        ) : (
          <Panel className="grid h-[calc(100vh-13rem)] place-items-center p-8 text-center">
            <div className="max-w-sm">
              <MessageSquare className="mx-auto size-8 text-muted-foreground/30" />
              <p className="mt-3 text-[14px] font-semibold text-foreground">
                Pick a conversation
              </p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Every thread stays attached to the job, crew or task it is about, so the
                history is still there when somebody asks about it in six months.
              </p>
            </div>
          </Panel>
        )}
      </div>

      {composing ? (
        <NewMessage
          targets={targets}
          onClose={() => setComposing(false)}
          onOpened={(id) => {
            setComposing(false);
            select(id);
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One row in the inbox.
 * ------------------------------------------------------------------ */

function ConversationRowItem({
  row: c,
  active,
  onClick,
}: {
  row: ConversationRow;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = TYPE_ICON[c.type] ?? MessageSquare;
  const context = c.taskTitle || c.projectName || c.subcontractorName || "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-ring flex w-full items-start gap-2.5 border-b border-border/40 px-3 py-2.5 text-left transition-colors",
        active ? "gold-rail bg-foreground/[0.03]" : "hover:bg-foreground/[0.03]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          c.unread > 0 ? "bg-brand/15 text-brand-bright" : "bg-foreground/[0.06] text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13.5px]",
              c.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground/90",
            )}
          >
            {c.title}
          </span>
          <span className="shrink-0 text-[10.5px] text-muted-foreground">
            {shortWhen(c.lastMessageAt)}
          </span>
        </span>

        {context ? (
          <span className="mt-0.5 block truncate text-[11.5px] text-gold">{context}</span>
        ) : null}

        <span className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12px]",
              c.previewKind === "SYSTEM"
                ? "italic text-muted-foreground/70"
                : c.unread > 0
                  ? "text-foreground/80"
                  : "text-muted-foreground",
            )}
          >
            {c.preview || "No messages yet"}
          </span>
          {c.usedSms ? (
            <Smartphone className="size-3 shrink-0 text-muted-foreground/60" />
          ) : null}
          {c.unread > 0 ? (
            <span className="num shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
              {c.unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/** "9:17 AM" today, "Yesterday", then a date. */
function shortWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (day(d) === day(now)) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  }
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (day(d) === day(yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", timeZone: "America/New_York" });
}

/* ------------------------------------------------------------------ *
 * The thread.
 * ------------------------------------------------------------------ */

function Thread({
  detail: d,
  meId,
  onBack,
}: {
  detail: ConversationDetail;
  meId: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  // Texting is the default, not an extra step.
  //
  // It started off because the A2P campaign was pending and every send was a
  // no-op. Now that it is approved, a message typed to a crew is meant to reach
  // them on the job — leaving it off meant somebody wrote to a foreman, saw it
  // sitting in the app, and had no idea it had gone nowhere.
  //
  // Still a toggle rather than fixed behaviour: an internal note, or anything
  // written at eleven at night, is worth being able to keep in the app. It
  // simply is not the default any more. Off wherever SMS is unavailable, so
  // the composer never claims something it cannot do.
  const [withSms, setWithSms] = React.useState(d.smsAvailable);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<
    { url: string; name: string; contentType: string; bytes: number }[]
  >([]);
  const [uploading, setUploading] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  const pickRef = React.useRef<HTMLInputElement>(null);

  // Opening a thread is reading it. Done once per conversation rather than on
  // every keystroke, and it is why the badge clears.
  React.useEffect(() => {
    void markRead(d.id).then(() => router.refresh());
  }, [d.id, router]);

  // Follow the conversation. Moving to a crew that can be texted turns it on;
  // moving to one that cannot must not leave the toggle reading "Vantara + SMS"
  // from the previous thread.
  React.useEffect(() => {
    setWithSms(d.smsAvailable);
  }, [d.id, d.smsAvailable]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [d.messages.length]);

  async function send() {
    if (busy) return;
    const text = body.trim();
    if (!text && files.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await sendMessage({
      conversationId: d.id,
      body: text,
      withSms,
      attachments: files,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setBody("");
    setFiles([]);
    if (res.smsFailed > 0) {
      setNote(`${res.smsFailed} text${res.smsFailed === 1 ? "" : "s"} failed to send.`);
    } else if (withSms && res.smsSkipped > 0 && res.smsSent === 0) {
      setNote("Kept in Vantara — nobody on this thread can be texted yet.");
    }
    router.refresh();
  }

  async function attach(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(list)) {
      try {
        const blob = await blobUpload(`messages/${d.id}/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          contentType: file.type || undefined,
        });
        setFiles((f) => [
          ...f,
          { url: blob.url, name: file.name, contentType: file.type, bytes: file.size },
        ]);
      } catch {
        setError("That file wouldn't upload. Try again, or send without it.");
      }
    }
    setUploading(false);
  }

  const Icon = TYPE_ICON[d.type] ?? MessageSquare;

  return (
    <Panel className="flex h-[calc(100vh-13rem)] flex-col">
      {/* Header — who, and what it is about. */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border/70 px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="focus-ring grid size-8 shrink-0 place-items-center rounded-lg border border-border text-foreground lg:hidden"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-foreground">
            {d.title}
          </span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {d.type.charAt(0) + d.type.slice(1).toLowerCase()} · {d.participants.length}{" "}
            {d.participants.length === 1 ? "participant" : "participants"}
            {d.subject ? ` · ${d.subject}` : ""}
          </span>
        </span>
      </div>

      {/* What this is attached to. The reason the thread is worth keeping. */}
      {d.taskId || d.projectId || d.subcontractorId ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-foreground/[0.02] px-3 py-2 text-[11.5px]">
          <span className="font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Linked to
          </span>
          {d.taskId ? (
            <Link
              href={`/tasks?task=${d.taskId}`}
              className="focus-ring inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-medium text-foreground hover:border-brand/60"
            >
              <ClipboardList className="size-3" /> {d.taskTitle || "Task"}
            </Link>
          ) : null}
          {d.projectId ? (
            <Link
              href={`/projects/${d.projectId}`}
              className="focus-ring inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-medium text-foreground hover:border-brand/60"
            >
              <FolderKanban className="size-3" /> {d.projectName}
            </Link>
          ) : null}
          {d.subcontractorId ? (
            <Link
              href="/subcontractors"
              className="focus-ring inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-medium text-foreground hover:border-brand/60"
            >
              <Building2 className="size-3" /> {d.subcontractorName}
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* The messages. */}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {d.hasMore ? (
          <p className="text-center text-[11.5px] text-muted-foreground">
            Older messages are not loaded.
          </p>
        ) : null}
        {d.messages.length === 0 ? (
          <p className="py-10 text-center text-[12.5px] text-muted-foreground">
            Nothing said yet. Whatever goes here stays attached to this work.
          </p>
        ) : null}
        {d.messages.map((m) =>
          m.kind === "SYSTEM" ? (
            <p
              key={m.id}
              className="mx-auto max-w-lg text-center text-[11.5px] italic text-muted-foreground/80"
            >
              {m.body} · {formatWhen(m.createdAt)}
            </p>
          ) : (
            <Bubble key={m.id} m={m} mine={m.senderUserId === meId} />
          ),
        )}
        <div ref={endRef} />
      </div>

      {/* Composer. */}
      <div className="border-t border-border/70 p-2.5">
        {files.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f) => (
              <span
                key={f.url}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-foreground/[0.03] px-2 py-1 text-[11.5px] text-foreground"
              >
                <Paperclip className="size-3" />
                <span className="max-w-[140px] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((v) => v.filter((x) => x.url !== f.url))}
                  className="focus-ring text-muted-foreground hover:text-critical"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={pickRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void attach(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => pickRef.current?.click()}
            disabled={uploading}
            aria-label="Attach a file"
            className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          </button>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Type a message…"
            className="focus-ring max-h-32 min-h-9 flex-1 resize-y rounded-lg border border-border bg-transparent px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-brand"
          />

          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || (!body.trim() && files.length === 0)}
            className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-white hover:bg-brand-bright disabled:opacity-40"
            aria-label="Send"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>

        {/* How it will travel. Plain, and honest about SMS being off. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className="text-muted-foreground">Send via</span>
          <button
            type="button"
            disabled={!d.smsAvailable}
            onClick={() => setWithSms((v) => !v)}
            title={d.smsNote ?? undefined}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium transition-colors",
              !d.smsAvailable
                ? "cursor-not-allowed bg-foreground/[0.04] text-muted-foreground"
                : withSms
                  ? "bg-brand text-white"
                  : "bg-foreground/[0.06] text-foreground",
            )}
          >
            <Smartphone className="size-3" />
            {d.smsAvailable ? (withSms ? "Vantara + SMS" : "Vantara only") : "Vantara only"}
          </button>
          {!d.smsAvailable && d.smsNote ? (
            <span className="text-muted-foreground/80">{d.smsNote}</span>
          ) : null}
          {note ? <span className="text-warning">{note}</span> : null}
          {error ? <span className="text-critical">{error}</span> : null}
        </div>
      </div>
    </Panel>
  );
}

function Bubble({
  m,
  mine,
}: {
  m: ConversationDetail["messages"][number];
  mine: boolean;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = React.useState(false);
  const sms = m.delivery.find((x) => x.channel === "SMS");
  const failed = sms?.status === "FAILED";
  // A message that arrived from a handset is not one we sent.
  //
  // The label fell through to "Sent via SMS" for every status that was not
  // failed, skipped or delivered — and RECEIVED is one of those. So a text
  // somebody sent us was captioned as a text we had sent them, which is
  // exactly the wrong way round when the question being asked is "did my
  // reply go out".
  const inbound = sms?.status === "RECEIVED";

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%] min-w-0", mine ? "items-end" : "items-start")}>
        <p className="mb-0.5 flex items-baseline gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{m.senderName}</span>
          <span>{formatWhen(m.createdAt)}</span>
          {m.kind === "AUTOMATED" ? (
            <span className="rounded bg-foreground/[0.08] px-1 text-[10px]">automated</span>
          ) : null}
        </p>
        <div
          className={cn(
            "rounded-xl border px-3 py-2 text-[13px] leading-relaxed",
            mine
              ? "border-brand/40 bg-brand/[0.12] text-foreground"
              : "border-border bg-foreground/[0.03] text-foreground",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
          {m.attachments.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.attachments.map((a) =>
                a.contentType.startsWith("image/") ? (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt={a.name}
                      className="h-24 w-auto rounded-lg border border-border object-cover"
                    />
                  </a>
                ) : (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11.5px] text-foreground hover:border-brand/60"
                  >
                    <Paperclip className="size-3" /> {a.name || "Attachment"}
                  </a>
                ),
              )}
            </div>
          ) : null}
        </div>

        {/* Delivery, only when it says something. */}
        {sms ? (
          <p
            className={cn(
              "mt-0.5 flex items-center gap-1.5 text-[10.5px]",
              failed
                ? "text-critical"
                : sms.status === "SKIPPED" || inbound
                  ? "text-muted-foreground"
                  : "text-success",
            )}
          >
            {failed ? <TriangleAlert className="size-3" /> : <Check className="size-3" />}
            {failed
              ? "SMS failed"
              : inbound
                ? "Received by text"
                : sms.status === "SKIPPED"
                  ? "Kept in Vantara"
                  : sms.status === "DELIVERED"
                    ? "Delivered via SMS"
                    : sms.status === "QUEUED"
                      ? "Queued for SMS"
                      : "Sent via SMS"}
            {failed ? (
              <button
                type="button"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  await retrySms(m.id);
                  setRetrying(false);
                  router.refresh();
                }}
                className="focus-ring underline"
              >
                {retrying ? "retrying…" : "retry"}
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Starting one.
 * ------------------------------------------------------------------ */

function NewMessage({
  targets,
  onClose,
  onOpened,
}: {
  targets: {
    employees: { id: string; name: string; email: string }[];
    crews: { id: string; company: string }[];
    projects: { id: string; name: string; number: string }[];
  };
  onClose: () => void;
  onOpened: (id: string) => void;
}) {
  const [kind, setKind] = React.useState<"SUBCONTRACTOR" | "PROJECT" | "DIRECT">("SUBCONTRACTOR");
  const [target, setTarget] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const options =
    kind === "SUBCONTRACTOR"
      ? targets.crews.map((c) => [c.id, c.company] as const)
      : kind === "PROJECT"
        ? targets.projects.map((p) => [p.id, p.number ? `${p.number} · ${p.name}` : p.name] as const)
        : targets.employees.map((e) => [e.id, e.name || e.email] as const);

  async function go() {
    if (!target) return setError("Pick who this is for.");
    setBusy(true);
    setError(null);
    const res = await openConversation({
      type: kind,
      subcontractorId: kind === "SUBCONTRACTOR" ? target : undefined,
      projectId: kind === "PROJECT" ? target : undefined,
      withUserId: kind === "DIRECT" ? target : undefined,
      subject,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onOpened(res.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-card p-4 sm:rounded-2xl">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[15px] font-semibold text-foreground">New message</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Pick who it is for. If a thread already exists for them, it opens rather than
          starting a second one.
        </p>

        <div className="mt-3 flex gap-1.5">
          {(["SUBCONTRACTOR", "PROJECT", "DIRECT"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setTarget("");
              }}
              className={cn(
                "focus-ring flex-1 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors",
                kind === k ? "bg-brand text-white" : "bg-foreground/[0.05] text-muted-foreground",
              )}
            >
              {k === "SUBCONTRACTOR" ? "Crew" : k === "PROJECT" ? "Project" : "Person"}
            </button>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            To
          </span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="focus-ring h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-[13px] text-foreground outline-none focus:border-brand"
          >
            <option value="">Choose…</option>
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-2.5 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            What it is about (optional)
          </span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="COI request, Reynolds Rd rework…"
            className="focus-ring h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-brand"
          />
        </label>

        {error ? <p className="mt-2 text-[12px] text-critical">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring h-9 rounded-lg border border-border px-3 text-[12.5px] font-medium text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void go()}
            disabled={busy}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronDown className="size-3.5 -rotate-90" />}
            Open conversation
          </button>
        </div>
      </div>
    </div>
  );
}
