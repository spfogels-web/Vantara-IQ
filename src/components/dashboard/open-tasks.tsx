import Link from "next/link";
import { ClipboardList, TriangleAlert, User, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TaskRow } from "@/data/queries";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * What is outstanding, on the operations centre.
 *
 * This slot used to hold crew availability, which ran entirely on seeded
 * people and jobs. Open tasks answer a question somebody actually has, from
 * records that exist — overdue first, because that is the part that hurts.
 */
export function OpenTasks({ tasks }: { tasks: TaskRow[] }) {
  const live = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
  const sorted = [...live].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const rank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as Record<string, number>;
    const byPriority = (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
    if (byPriority) return byPriority;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return a.dueDate ? -1 : b.dueDate ? 1 : 0;
  });

  const overdue = live.filter((t) => t.overdue).length;

  return (
    <Panel>
      <PanelHeader
        title="Open tasks"
        description={overdue > 0 ? `${overdue} past its date` : "Nothing overdue"}
        count={live.length}
        icon={<ClipboardList className="size-3.5" />}
        action="All tasks"
        actionHref="/tasks"
      />
      {sorted.length === 0 ? (
        <PanelBody className="py-8 text-center text-[12.5px] text-muted-foreground">
          Nothing outstanding.
        </PanelBody>
      ) : (
        <ul className="p-2">
          {sorted.slice(0, 7).map((t) => (
            <li key={t.id}>
              <Link
                href="/tasks"
                className="focus-ring flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-foreground/[0.03]"
              >
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    t.overdue ? "bg-critical" : t.status === "BLOCKED" ? "bg-warning" : "bg-info",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-foreground">{t.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {t.assigneeKind === "crew" ? (
                      <Users className="size-3" />
                    ) : (
                      <User className="size-3" />
                    )}
                    <span className="truncate">{t.assigneeName}</span>
                    {t.dueDate ? (
                      <span className={cn("num shrink-0", t.overdue && "text-critical")}>
                        {t.dueDate}
                      </span>
                    ) : null}
                  </span>
                </span>
                {t.overdue ? (
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-critical" />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
