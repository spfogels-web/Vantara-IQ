"use client";

import * as React from "react";
import { Bell } from "lucide-react";

import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/icons";
import { toneStyles } from "@/lib/tone";
import type { AppNotification } from "@/lib/types";
import { Panel, PanelHeader } from "@/components/common/panel";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

export function NotificationsPanel({
  notifications,
}: {
  notifications: AppNotification[];
}) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const visible = React.useMemo(
    () => (filter === "unread" ? notifications.filter((n) => n.unread) : notifications),
    [filter, notifications],
  );

  const unread = notifications.filter((n) => n.unread).length;

  return (
    <Panel>
      <PanelHeader
        title="Activity"
        description={`${unread} unread`}
        icon={<Bell className="size-3.5 text-brand-bright" />}
      >
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={cn(
                "focus-ring rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                filter === option.id
                  ? "bg-white/[0.09] text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </PanelHeader>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <span className="grid size-9 place-items-center rounded-full bg-white/[0.05] text-muted-foreground">
            <Bell className="size-4" />
          </span>
          <p className="text-[12.5px] font-medium text-foreground">You&apos;re all caught up</p>
          <p className="text-[11.5px] text-muted-foreground">No unread activity.</p>
        </div>
      ) : (
        <ul className="relative flex-1 py-1">
          {visible.map((item, index) => {
            const Icon = getIcon(item.icon);
            const tone = toneStyles[item.tone];
            const isLast = index === visible.length - 1;

            return (
              <li key={item.id} className="relative flex gap-3 px-4 py-2 sm:px-5">
                {/* Timeline spine — connects events without a heavy divider */}
                {!isLast ? (
                  <span
                    aria-hidden
                    className="absolute left-[27px] top-9 h-[calc(100%-1.25rem)] w-px bg-white/[0.07] sm:left-[31px]"
                  />
                ) : null}

                <span
                  className={cn(
                    "relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border",
                    tone.bg,
                    tone.border,
                    tone.text,
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={2} />
                </span>

                <span className="min-w-0 flex-1 pb-1">
                  <span className="flex items-start gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-[12.5px] leading-snug",
                        item.unread ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {item.title}
                    </span>
                    {item.unread ? (
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {item.detail}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-muted-foreground/70">
                    {item.time}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
