"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquare, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/format";
import { MessageButton } from "@/components/messages/message-button";

export type TaskComms = {
  conversationId: string;
  total: number;
  messages: {
    id: string;
    body: string;
    kind: string;
    senderName: string;
    createdAt: string;
    viaSms: boolean;
  }[];
} | null;

/**
 * What has been said about this task, on the task.
 *
 * The last few lines and a way into the thread — deliberately not the whole
 * conversation. A reviewer opening a task wants to know whether the crew has
 * been chased and what they said, not to read a second inbox.
 */
export function TaskCommunication({ taskId, comms }: { taskId: string; comms: TaskComms }) {
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground">
          Communication
        </p>
        {comms && comms.total > comms.messages.length ? (
          <span className="num text-[11px] text-muted-foreground">
            {comms.total} in the thread
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5">
          <MessageButton taskId={taskId} label={comms ? "Open thread" : "Message"} />
        </span>
      </div>

      {!comms || comms.messages.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Nothing sent about this yet. A message from here stays attached to the task.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {comms.messages.map((m) => (
            <li key={m.id} className="text-[12px]">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">{m.senderName}</span>
                <span>{formatWhen(m.createdAt)}</span>
                {m.viaSms ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Smartphone className="size-3" /> via SMS
                  </span>
                ) : null}
              </p>
              <p
                className={cn(
                  "mt-0.5 leading-relaxed",
                  m.kind === "SYSTEM" ? "italic text-muted-foreground" : "text-foreground/90",
                )}
              >
                {m.body.length > 180 ? `${m.body.slice(0, 180)}…` : m.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {comms ? (
        <Link
          href={`/messages?c=${comms.conversationId}`}
          className="focus-ring mt-2 inline-block text-[11.5px] font-medium text-brand-bright underline"
        >
          Open the full conversation
        </Link>
      ) : null}
    </div>
  );
}
